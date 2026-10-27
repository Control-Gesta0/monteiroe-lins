import { CONFIG } from './config'

/**
 * KOMMO AO VIVO, PELO NOME (painel de gestão e adoção do card da Stevo).
 * Funis, etapas, campos, usuários e motivos de perda são achados pelo NOME na API
 * (cache de 5 min), nunca por ID gravado: faltou um nome → null e o fluxo para com
 * motivo claro. O agente da Lia continua com os IDs aprovados do crm-map.ts.
 *
 * A API aceita ~7 requisições/s por conta: o helper espaça as chamadas e tenta de
 * novo em 429/5xx (só leitura e mudanças idempotentes passam por aqui).
 */

const BASE = `${CONFIG.kommoDomain}/api/v4`
const CACHE_MS = 5 * 60_000
let ultimaChamada = 0
const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function kommo<T = unknown>(metodo: 'GET' | 'POST' | 'PATCH', caminho: string, corpo?: unknown): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    const desde = Date.now() - ultimaChamada
    if (desde < 160) await espera(160 - desde)
    ultimaChamada = Date.now()
    let res: Response
    try {
      res = await fetch(`${BASE}${caminho}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${CONFIG.kommoToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(20_000),
      })
    } catch (e) {
      // Falha de rede ("fetch failed", tempo esgotado): leitura pode tentar de novo
      if (metodo === 'GET' && tentativa < 2) { await espera(1000 * (tentativa + 1)); continue }
      throw new Error(`Kommo ${metodo} ${caminho}: ${e instanceof Error ? e.message : String(e)}`)
    }
    if ((res.status === 429 || res.status >= 500) && tentativa < 2) { await espera(800 * (tentativa + 1)); continue }
    if (res.status === 204) return {} as T // lista vazia vem sem corpo
    const texto = await res.text()
    if (!res.ok) throw new Error(`Kommo ${metodo} ${caminho} -> ${res.status}: ${texto.slice(0, 300)}`)
    return (texto.trim() ? JSON.parse(texto) : {}) as T
  }
}

// ---------- Tipos ----------

export interface KommoValorCampo { field_id: number; field_name?: string; field_code?: string | null; values: Array<{ value?: unknown; enum_id?: number }> }
export interface KommoContato { id: number; name: string; custom_fields_values?: KommoValorCampo[] | null; _embedded?: { leads?: Array<{ id: number }> } }
export interface KommoLeadV {
  id: number; name: string; pipeline_id: number; status_id: number; responsible_user_id: number; price?: number
  closed_at?: number | null; created_at?: number; updated_at?: number; loss_reason_id?: number | null
  custom_fields_values?: KommoValorCampo[] | null
  _embedded?: { tags?: Array<{ id?: number; name: string }>; contacts?: Array<{ id: number; is_main?: boolean }>; loss_reason?: Array<{ id: number; name: string }> }
}
export interface KommoEtapa { id: number; name: string; sort: number; type: number }
export interface KommoFunil { id: number; name: string; _embedded: { statuses: KommoEtapa[] } }
export interface KommoUsuario { id: number; name: string; email: string }
export interface KommoCampo { id: number; name: string; type: string }
export interface KommoTarefa { id: number; entity_id: number; responsible_user_id: number; complete_till: number; is_completed: boolean }

export const GANHO = 142
export const PERDIDO = 143

/** Nome comparável: sem acento, minúsculo, pontuação vira espaço ("Funil/SDR" = "funil sdr"). */
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').trim()

const cache = new Map<string, { v: unknown; exp: number }>()
async function vivo<T>(chave: string, busca: () => Promise<T>): Promise<T> {
  const c = cache.get(chave)
  if (c && Date.now() < c.exp) return c.v as T
  const v = await busca()
  cache.set(chave, { v, exp: Date.now() + CACHE_MS })
  return v
}

export const funisAoVivo = () => vivo('funis', async () =>
  (await kommo<{ _embedded?: { pipelines: KommoFunil[] } }>('GET', '/leads/pipelines'))._embedded?.pipelines || [])
export const usuariosAoVivo = () => vivo('usuarios', async () =>
  (await kommo<{ _embedded?: { users: KommoUsuario[] } }>('GET', '/users?limit=250'))._embedded?.users || [])
export const camposAoVivo = () => vivo('campos', async () =>
  (await kommo<{ _embedded?: { custom_fields: KommoCampo[] } }>('GET', '/leads/custom_fields?limit=250'))._embedded?.custom_fields || [])
export const motivosDePerdaAoVivo = () => vivo('motivos', async () =>
  (await kommo<{ _embedded?: { loss_reasons: Array<{ id: number; name: string }> } }>('GET', '/leads/loss_reasons'))._embedded?.loss_reasons || [])

/** O funil com esse nome (só se houver exatamente um). */
export async function funilPorNome(nome: string): Promise<KommoFunil | null> {
  const achados = (await funisAoVivo()).filter(f => norm(f.name) === norm(nome))
  return achados.length === 1 ? achados[0] : null
}
export function etapaPorNome(funil: KommoFunil, nome: string): KommoEtapa | null {
  const achadas = funil._embedded.statuses.filter(s => norm(s.name) === norm(nome))
  return achadas.length === 1 ? achadas[0] : null
}
export async function localizar(funil: string, etapa: string): Promise<{ funil: KommoFunil; etapa: KommoEtapa } | null> {
  const f = await funilPorNome(funil)
  const e = f && etapaPorNome(f, etapa)
  return f && e ? { funil: f, etapa: e } : null
}

/** Valor (texto) de um campo pelo nome. */
export function lerCampo(valores: KommoValorCampo[] | null | undefined, nome: string): string {
  const c = (valores || []).find(v => norm(v.field_name || '') === norm(nome))
  return c ? c.values.map(v => String(v.value ?? '')).filter(Boolean).join(', ') : ''
}

// ---------- Contatos e cards ----------

const soDigitos = (s: string) => String(s || '').replace(/\D/g, '')
/** Os últimos 8 dígitos comparam celular com e sem o 9 extra (o WhatsApp Lite grava sem). */
const chaveFone = (fone: string) => soDigitos(fone).slice(-8)
export const telefonesDoContato = (c: KommoContato) => (c.custom_fields_values || []).filter(v => v.field_code === 'PHONE').flatMap(v => v.values.map(x => String(x.value || '')))

export async function contatoPorTelefone(fone: string): Promise<KommoContato | null> {
  const chave = chaveFone(fone)
  if (chave.length < 8) return null
  const d = await kommo<{ _embedded?: { contacts: KommoContato[] } }>('GET', `/contacts?query=${chave}&with=leads&limit=50`)
  const achados = (d._embedded?.contacts || []).filter(c => telefonesDoContato(c).some(t => chaveFone(t) === chave))
  return achados.sort((a, b) => a.id - b.id)[0] || null
}

export async function criarContato(nome: string, fone: string): Promise<KommoContato> {
  const d = soDigitos(fone)
  const e164 = d.startsWith('55') ? `+${d}` : `+55${d}`
  const r = await kommo<{ _embedded: { contacts: Array<{ id: number }> } }>('POST', '/contacts', [{
    name: nome || e164, custom_fields_values: [{ field_code: 'PHONE', values: [{ value: e164, enum_code: 'MOB' }] }],
  }])
  return { id: r._embedded.contacts[0].id, name: nome || e164 }
}

export async function leadsDoContato(contato: KommoContato): Promise<KommoLeadV[]> {
  const ids = (contato._embedded?.leads || []).map(l => l.id).slice(-250)
  if (!ids.length) return []
  const filtro = ids.map((id, i) => `filter[id][${i}]=${id}`).join('&')
  return (await kommo<{ _embedded?: { leads: KommoLeadV[] } }>('GET', `/leads?${filtro}&with=contacts&limit=250`))._embedded?.leads || []
}

export async function criarLead(nome: string, funilId: number, etapaId: number, contatoId: number, tags: string[] = []): Promise<number> {
  const r = await kommo<{ _embedded: { leads: Array<{ id: number }> } }>('POST', '/leads', [{
    name: nome, pipeline_id: funilId, status_id: etapaId,
    _embedded: { contacts: [{ id: contatoId }], ...(tags.length ? { tags: tags.map(name => ({ name })) } : {}) },
  }])
  return r._embedded.leads[0].id
}

/**
 * Aceita um card de "Incoming leads" (não triado). O Kommo não move card não triado
 * pela API comum: precisa aceitar pelo uid da entrada.
 */
export async function aceitarIncoming(leadId: number, etapaId?: number): Promise<boolean> {
  for (let page = 1; page <= 5; page++) {
    const d = await kommo<{ _embedded?: { unsorted: Array<{ uid: string; _embedded?: { leads?: Array<{ id: number }> } }> } }>('GET', `/leads/unsorted?limit=250&page=${page}`)
    const lista = d._embedded?.unsorted || []
    const u = lista.find(x => x._embedded?.leads?.some(l => l.id === leadId))
    if (u) {
      await kommo('POST', `/leads/unsorted/${encodeURIComponent(u.uid)}/accept`, etapaId ? { status_id: etapaId } : {})
      return true
    }
    if (lista.length < 250) break
  }
  return false
}

// ---------- Varreduras do painel ----------

/** Cards abertos de um funil (até 5.000). */
export async function leadsAbertosDoFunil(funilId: number): Promise<KommoLeadV[]> {
  const out: KommoLeadV[] = []
  for (let page = 1; page <= 20; page++) {
    const d = await kommo<{ _embedded?: { leads: KommoLeadV[] } }>('GET', `/leads?filter[pipeline_id]=${funilId}&with=contacts&limit=250&page=${page}`)
    const lote = d._embedded?.leads || []
    out.push(...lote.filter(l => l.status_id !== GANHO && l.status_id !== PERDIDO))
    if (lote.length < 250) break
  }
  return out
}

/** Ganhos e perdidos de um funil fechados desde `desde` (unix), com o motivo de perda. */
export async function leadsFechadosDoFunil(funilId: number, desde: number): Promise<KommoLeadV[]> {
  const out: KommoLeadV[] = []
  const filtro = [GANHO, PERDIDO].map((s, i) => `filter[statuses][${i}][pipeline_id]=${funilId}&filter[statuses][${i}][status_id]=${s}`).join('&')
  for (let page = 1; page <= 20; page++) {
    const d = await kommo<{ _embedded?: { leads: KommoLeadV[] } }>('GET', `/leads?${filtro}&filter[closed_at][from]=${desde}&with=loss_reason&limit=250&page=${page}`)
    const lote = d._embedded?.leads || []
    out.push(...lote.filter(l => l.status_id === GANHO || l.status_id === PERDIDO))
    if (lote.length < 250) break
  }
  return out
}

export async function tarefasAbertas(): Promise<KommoTarefa[]> {
  const out: KommoTarefa[] = []
  for (let page = 1; page <= 4; page++) {
    const lote = (await kommo<{ _embedded?: { tasks: KommoTarefa[] } }>('GET', `/tasks?filter[is_completed]=0&limit=250&page=${page}`))._embedded?.tasks || []
    out.push(...lote.filter(t => !t.is_completed))
    if (lote.length < 250) break
  }
  return out
}

/** Confere ao vivo os nomes que o painel e a Stevo usam. Só o que falta (vazio = tudo certo). */
export async function checarEstrutura(nomes: { funis: string[]; etapas: Array<[string, string]> }): Promise<{ ok: boolean; faltaFunil: string[]; faltaEtapa: string[] }> {
  const faltaFunil: string[] = []
  for (const f of nomes.funis) if (!(await funilPorNome(f))) faltaFunil.push(f)
  const faltaEtapa: string[] = []
  for (const [f, e] of nomes.etapas) if (!(await localizar(f, e))) faltaEtapa.push(`${f} / ${e}`)
  return { ok: !faltaFunil.length && !faltaEtapa.length, faltaFunil, faltaEtapa }
}
