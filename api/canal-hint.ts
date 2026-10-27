import type { VercelRequest, VercelResponse } from '@vercel/node'
import { waitUntil } from '@vercel/functions'
import crypto from 'crypto'
import { processLead } from '../lib/agent'
import { CANAIS } from '../lib/canais'
import { CONFIG } from '../lib/config'
import { logExec } from '../lib/execlog'
import { appendMessage, isEchoOfSent, markHumanSpoke } from '../lib/history'
import { getLead, leadTags } from '../lib/kommo'
import { bytesToText, type MediaKind } from '../lib/media'
import { baixarMidia, apikeyDe, aprenderInstancia, chaveWebhook, lerEvento, type EventoStevo } from '../lib/stevo'
import { cardDaConversa } from '../lib/stevo-card'
import { k, redis } from '../lib/redis'
import { isResetCommand, resetLead } from '../lib/reset'
import { sendReply } from '../lib/transport'
import { guardarRota, leadDaConversa, registrarEvento } from '../lib/stevo-conversa'

/**
 * WEBHOOK DA STEVO — um por número: /api/canal-hint?canal=<canal>&s=<chave do número>.
 * Eventos na Stevo: MESSAGE, SEND_MESSAGE e CONNECTION.
 *
 * Todo número: aprende o token/servidor (primeiro evento autenticado), registra a
 * atividade e a fila "sem resposta" (painel).
 * Número da Lia (CANAIS[canal].ia) com CANAL_LIA=stevo:
 *  - cliente escreveu → acha/adota o card do Kommo → grava no histórico (mídia vira
 *    texto) → a Lia atende pelo mesmo número (lib/transport.ts usa a rota);
 *  - saída que não foi a IA (equipe pelo Kommo ou pelo celular) → a Lia recua 6 h.
 */

function igual(a: string, b: string): boolean {
  if (!a || !b) return false
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest())
}

/** É mesmo a Stevo? A chave do número na URL, ou o token da instância já aprendido no corpo. */
async function confiavel(canal: string, body: Record<string, unknown>, req: VercelRequest): Promise<boolean> {
  const s = String(req.query.s || req.headers['x-webhook-secret'] || '')
  if (igual(s, chaveWebhook(canal))) return true
  return igual(String(body.instanceToken || ''), await apikeyDe(canal))
}

const KIND: Record<string, MediaKind> = { imagem: 'image', documento: 'document', audio: 'audio' }

/** Texto que entra no histórico da Lia (mídia lida uma vez, na entrada). */
async function textoDaMensagem(e: EventoStevo, lia: boolean): Promise<string> {
  if (!e.midia) return e.texto
  const kind = KIND[e.midia.tipo]
  const rotulo = { imagem: 'imagem', documento: 'documento', audio: 'áudio', video: 'vídeo', figurinha: 'figurinha' }[e.midia.tipo]
  // Só quem a Lia atende tem o arquivo lido pelo modelo
  if (!kind || !lia) return [e.texto, `[${rotulo} recebido]`].filter(Boolean).join('\n')
  try {
    const arq = await baixarMidia(e.canal, e.midia.bruta)
    if (arq) return await bytesToText(kind, arq.bytes, arq.mime || e.midia.mime, e.texto)
  } catch (err) { console.error(`[canal-hint] não baixei a mídia ${e.id}:`, err) }
  return [e.texto, `[${rotulo} recebido, mas não consegui abrir]`].filter(Boolean).join('\n')
}

const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * O lead da conversa: o que já está ligado ao telefone (se ainda aberto) ou o card
 * achado/adotado no Kommo. Uma resolução por vez por telefone: 3 fotos seguidas não
 * podem criar 3 cards.
 */
async function leadDaMensagem(e: EventoStevo): Promise<number> {
  const conhecido = async () => {
    const id = await leadDaConversa(e.canal, e.fone)
    if (!id) return null
    const l = await getLead(id)
    return l.status_id === 142 || l.status_id === 143 ? null : id
  }
  const ja = await conhecido()
  if (ja) return ja
  const trava = k('stevo', 'card', e.canal, e.fone)
  if ((await redis.set(trava, 1, { nx: true, ex: 30 })) !== 'OK') {
    for (let i = 0; i < 25; i++) { await espera(1000); const id = await leadDaConversa(e.canal, e.fone); if (id) return id }
  }
  try {
    const card = await cardDaConversa(e)
    await guardarRota(card.leadId, { canal: e.canal, fone: e.fone })
    console.log(`[canal-hint] ${e.canal}: conversa no card ${card.leadId} (${card.como})`)
    return card.leadId
  } finally { await redis.del(trava) }
}

async function atender(e: EventoStevo, webhookId: string): Promise<void> {
  try {
    const leadId = await leadDaMensagem(e)
    await guardarRota(leadId, { canal: e.canal, fone: e.fone })
    if (isResetCommand(leadId, e.texto)) {
      await resetLead(leadId)
      await sendReply(leadId, '🔄 Teste reiniciado. Mande a primeira mensagem como se fosse um lead novo.')
      await logExec({ tipo: 'reset', leadId, detalhe: 'reset de teste (Stevo)' })
      return
    }
    const lead = await getLead(leadId)
    const lia = !CONFIG.gateTag || leadTags(lead).map(t => t.toLowerCase()).includes(CONFIG.gateTag)
    const texto = await textoDaMensagem(e, lia)
    await appendMessage(leadId, { id: `stevo:${e.id}`, dir: 'in', text: texto, ts: Date.parse(e.quando) || Date.now() })
    await processLead(leadId, webhookId)
  } catch (err) {
    console.error(`[canal-hint] falha atendendo ${e.canal}:`, err)
    await logExec({ tipo: 'erro', leadId: 0, detalhe: `Stevo ${e.canal}: ${(err instanceof Error ? err.message : String(err)).slice(0, 250)}` })
  }
}

/** Saída do número que não foi a IA: a equipe falou (Kommo ou celular) → a Lia recua. */
async function equipeFalou(e: EventoStevo): Promise<void> {
  const leadId = await leadDaConversa(e.canal, e.fone)
  if (!leadId || (await isEchoOfSent(leadId, e.texto))) return // eco da própria IA que chegou antes do ID
  await appendMessage(leadId, { id: `stevo:${e.id}`, dir: 'out', text: e.texto || '[mídia enviada pela equipe]', ts: Date.parse(e.quando) || Date.now() })
  await markHumanSpoke(leadId)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'canal-hint', canalLia: CONFIG.canalLia })
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })

  const canal = String(req.query.canal || '').toLowerCase().trim()
  const body = (req.body || {}) as Record<string, any>
  if (!CANAIS[canal]) return res.status(200).json({ ok: false, reason: 'canal desconhecido' })
  if (!(await confiavel(canal, body, req))) return res.status(401).json({ error: 'unauthorized' })

  // O primeiro evento autenticado (inclusive CONNECTION) ensina o token e o servidor
  try { await aprenderInstancia(canal, body) } catch (e) { console.error('[canal-hint] falha guardando a instância:', e) }
  const evento = lerEvento(canal, body)
  if (!evento) return res.status(200).json({ ok: true, ignorado: 'não é conversa' })

  const r = await registrarEvento(evento)
  if (!r) return res.status(200).json({ ok: true, repetido: true })

  if (CANAIS[canal].ia && CONFIG.canalLia === 'stevo') {
    if (r.autor === 'lead') waitUntil(atender(evento, crypto.randomUUID()))
    else if (r.autor === 'equipe') await equipeFalou(evento)
  }
  return res.status(200).json({ ok: true, autor: r.autor })
}
