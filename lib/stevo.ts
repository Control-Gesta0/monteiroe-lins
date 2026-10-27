import crypto from 'crypto'
import { CONFIG } from './config'
import { k, redis } from './redis'

/**
 * STEVO (Evolution Go / whatsmeow). O webhook chega com {event, instanceToken,
 * serverUrl, data: {Info, Message}} e a API usa o header `apikey` (token da instância).
 *
 * Ninguém precisa procurar o token da instância: a URL do webhook leva a chave do
 * número (?s=HMAC(WEBHOOK_SECRET, "stevo:<canal>")) e o primeiro evento autenticado
 * ensina o token e o servidor. O primeiro vale: depois, nenhum webhook troca os dois
 * (quem só conhece a URL não consegue desviar os envios). STEVO_INSTANCES vence o
 * aprendido, se um dia for preciso corrigir.
 */

export interface Instancia { canal: string; url: string; apikey: string }

const limpa = (u: string) => u.trim().replace(/\/+$/, '')
const credKey = (canal: string) => k('stevo', 'cred', canal)
const memoria = new Map<string, { url: string; apikey: string }>()

/** A chave do webhook de cada número (vai na URL). Derivada do WEBHOOK_SECRET, diferente por número. */
export function chaveWebhook(canal: string, segredo = CONFIG.webhookSecret): string {
  return crypto.createHmac('sha256', segredo).update(`stevo:${canal}`).digest('hex').slice(0, 32)
}

async function credencial(canal: string): Promise<{ url: string; apikey: string }> {
  const env = CONFIG.stevoInstances[canal] || {}
  let aprendida = memoria.get(canal)
  if (!aprendida) {
    const v = await redis.get<string | { url: string; apikey: string }>(credKey(canal))
    aprendida = (typeof v === 'string' ? JSON.parse(v) : v) || undefined
    if (aprendida) memoria.set(canal, aprendida)
  }
  return { url: limpa(env.url || aprendida?.url || ''), apikey: env.apikey || aprendida?.apikey || '' }
}

/** O token da instância (o webhook confere com ele quando a URL vem sem a chave). */
export async function apikeyDe(canal: string): Promise<string> {
  return (await credencial(canal)).apikey
}

const servidorDaStevo = (url: string) => /^https:\/\/[a-z0-9-]+\.stevo\.chat$/i.test(url)
  || (process.env.STEVO_SERVIDORES || '').split(',').map(limpa).filter(Boolean).includes(url)

async function guardar(canal: string, c: { url: string; apikey: string }): Promise<void> {
  memoria.set(canal, c)
  await redis.set(credKey(canal), JSON.stringify(c), { ex: 365 * 86400 })
}

export async function instancia(canal: string): Promise<Instancia | null> {
  const c = await credencial(canal)
  return c.apikey && c.url ? { canal, url: c.url, apikey: c.apikey } : null
}

/** Webhook autenticado: guarda o token (instanceToken) e o servidor (serverUrl), se ainda não tem. */
export async function aprenderInstancia(canal: string, body: Record<string, unknown>): Promise<void> {
  const env = CONFIG.stevoInstances[canal] || {}
  const atual = await credencial(canal)
  const token = String(body.instanceToken || '').trim()
  const url = limpa(String(body.serverUrl || ''))
  const novo = {
    apikey: env.apikey || atual.apikey || (/^[\w.:-]{8,200}$/.test(token) ? token : ''),
    url: limpa(env.url || '') || atual.url || (servidorDaStevo(url) ? url : ''),
  }
  if (novo.apikey !== atual.apikey || novo.url !== atual.url) await guardar(canal, novo)
}

async function stevo<T>(canal: string, caminho: string, corpo: unknown): Promise<T> {
  const i = await instancia(canal)
  if (!i) throw new Error(`Stevo: o número "${canal}" ainda não mandou nenhum evento pelo webhook com a chave (sem token)`)
  const res = await fetch(`${i.url}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', apikey: i.apikey },
    body: JSON.stringify(corpo),
  })
  const texto = await res.text()
  // Envio não é idempotente: sem retry (um 502 pode ter entregado a mensagem).
  if (!res.ok) throw new Error(`Stevo ${caminho} ${res.status} (${canal}): ${texto.slice(0, 200)}`)
  return (texto.trim() ? JSON.parse(texto) : {}) as T
}

type RespostaEnvio = { data?: { Info?: { ID?: string } } }

/** Envia texto; devolve o ID da mensagem no WhatsApp (marca a mensagem como da IA). */
export async function enviarTexto(canal: string, fone: string, texto: string): Promise<string> {
  const r = await stevo<RespostaEnvio>(canal, '/send/text', { number: fone.replace(/\D/g, ''), text: texto })
  return r.data?.Info?.ID || ''
}

/** Baixa (e decifra) a mídia recebida. `mensagem` é o data.Message do webhook. */
export async function baixarMidia(canal: string, mensagem: Record<string, unknown>): Promise<{ bytes: Buffer; mime: string } | null> {
  const r = await stevo<{ data?: { base64?: string } }>(canal, '/message/downloadmedia', { message: mensagem })
  const m = /^data:([^;,]+)?(?:;[^,]*)?,(.*)$/s.exec(r.data?.base64 || '')
  if (!m) return null
  return { mime: (m[1] || 'application/octet-stream').toLowerCase(), bytes: Buffer.from(m[2], 'base64') }
}

export type StatusStevo = { status: 'conectado' | 'desconectado' | 'aguardando' | 'erro'; whatsapp?: string }

/** Situação da instância (painel). "aguardando" = ainda não chegou evento com a chave do número. */
export async function statusStevo(canal: string): Promise<StatusStevo> {
  const i = await instancia(canal)
  if (!i) return { status: 'aguardando' }
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 4000)
    const r = await fetch(`${i.url}/instance/status`, { headers: { apikey: i.apikey, Accept: 'application/json' }, signal: ctl.signal })
    clearTimeout(t)
    if (!r.ok) return { status: 'erro' }
    const d = (await r.json()) as { data?: { Connected?: boolean; LoggedIn?: boolean; Name?: string } }
    return d.data?.Connected && d.data?.LoggedIn ? { status: 'conectado', whatsapp: d.data.Name || '' } : { status: 'desconectado' }
  } catch { return { status: 'erro' } }
}

// ---------- Webhook ----------

export type TipoMidia = 'audio' | 'imagem' | 'documento' | 'video' | 'figurinha'

export interface EventoStevo {
  canal: string
  id: string
  fone: string              // só dígitos, com DDI
  deMim: boolean            // saiu do número do escritório (IA pela API ou equipe)
  nome: string              // PushName do cliente
  quando: string            // ISO
  texto: string
  midia?: { tipo: TipoMidia; mime: string; nomeArquivo?: string; bruta: Record<string, unknown> }
  /** Veio de anúncio (clique para o WhatsApp) */
  origem?: Record<string, unknown>
}

const s = (v: unknown) => (typeof v === 'string' ? v : '')
const digitos = (jid: string) => jid.split('@')[0]!.split(':')[0]!.replace(/\D/g, '')

/** Desembrulha os envelopes do WhatsApp (temporária, visualização única, documento com legenda, edição). */
function desembrulhar(m: Record<string, any>): Record<string, any> {
  for (let i = 0; i < 4 && m; i++) {
    const dentro = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message
      || m.viewOnceMessageV2Extension?.message || m.documentWithCaptionMessage?.message
      || m.editedMessage?.message?.protocolMessage?.editedMessage || m.editedMessage?.message
    if (!dentro) break
    m = dentro
  }
  return m || {}
}

const MIDIAS: Array<[string, TipoMidia]> = [
  ['audioMessage', 'audio'], ['imageMessage', 'imagem'], ['documentMessage', 'documento'],
  ['videoMessage', 'video'], ['stickerMessage', 'figurinha'],
]

/**
 * Lê o webhook. null para o que não é conversa de 1 a 1 (grupo, status, reação,
 * recibo, apagar, conexão) ou quando não dá para saber o telefone.
 */
export function lerEvento(canal: string, corpo: Record<string, any>): EventoStevo | null {
  const evento = s(corpo?.event)
  if (evento && evento !== 'Message' && evento !== 'SendMessage') return null
  const d = (corpo?.data || {}) as Record<string, any>
  const info = (d.Info || {}) as Record<string, any>
  const chat = s(info.Chat)
  if (!chat || chat.endsWith('@g.us') || chat.endsWith('@broadcast') || chat.endsWith('@newsletter')) return null

  const deMim = Boolean(info.IsFromMe) || evento === 'SendMessage'
  // @lid esconde o número: usa o "alt" que tiver o @s.whatsapp.net
  let jid = chat
  if (jid.endsWith('@lid')) {
    const alt = [info.RecipientAlt, info.SenderAlt, info.ChatAlt].map(s).find(x => x.endsWith('@s.whatsapp.net'))
    if (!alt) return null
    jid = alt
  }
  const fone = digitos(jid)
  if (fone.length < 10) return null

  const msg = desembrulhar((d.Message || {}) as Record<string, any>)
  if (msg.reactionMessage || msg.protocolMessage || (msg.senderKeyDistributionMessage && Object.keys(msg).length === 1)) return null

  let texto = s(msg.conversation) || s(msg.extendedTextMessage?.text)
  let midia: EventoStevo['midia']
  for (const [chave, tipo] of MIDIAS) {
    const m = msg[chave]
    if (!m || typeof m !== 'object') continue
    const { base64: _b, JPEGThumbnail: _t, ...resto } = m as Record<string, unknown>
    midia = { tipo, mime: s(m.mimetype).split(';')[0].toLowerCase(), nomeArquivo: s(m.fileName) || undefined, bruta: { [chave]: resto } }
    texto = texto || s(m.caption)
    break
  }
  if (!texto) {
    if (msg.contactMessage) texto = `[contato compartilhado: ${s(msg.contactMessage.displayName)}]`
    else if (msg.locationMessage) texto = '[localização compartilhada]'
    else texto = s(msg.buttonsResponseMessage?.selectedDisplayText) || s(msg.listResponseMessage?.title) || s(msg.templateButtonReplyMessage?.selectedDisplayText)
  }
  if (!texto && !midia) return null

  const ts = s(info.Timestamp)
  const quando = ts && !Number.isNaN(Date.parse(ts)) ? new Date(ts).toISOString() : new Date().toISOString()
  return {
    canal, id: s(info.ID), fone, deMim, nome: deMim ? '' : s(info.PushName), quando, texto: texto.trim(), midia,
    ...(d.referral && typeof d.referral === 'object' ? { origem: d.referral as Record<string, unknown> } : {}),
  }
}
