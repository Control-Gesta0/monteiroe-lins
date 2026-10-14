import { CONFIG } from './config'

/**
 * Client da API do Kommo (v4 + endpoint legado v2 do Salesbot).
 * - Retry em 429/5xx. O Salesbot passa retry5xx:false: um 502 pode ter
 *   rodado o bot, e repetir duplicaria a mensagem (kommo/PEGADINHAS §7).
 * - PATCH de tags SUBSTITUI o conjunto inteiro: só addLeadTags/removeLeadTags.
 */

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

async function kommo<T>(method: string, path: string, body?: unknown, opts?: { retries?: number; retry5xx?: boolean }): Promise<T> {
  const retries = opts?.retries ?? 3
  const retry5xx = opts?.retry5xx ?? true
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${CONFIG.kommoDomain}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${CONFIG.kommoToken}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (res.ok) return (text ? JSON.parse(text) : {}) as T
    const retryable = res.status === 429 || (retry5xx && res.status >= 500)
    if (retryable && attempt < retries) {
      await sleep(res.status === 429 ? 2000 * 2 ** attempt : 1000 * (attempt + 1))
      continue
    }
    throw new Error(`Kommo ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`)
  }
}

export const kommoGet = <T>(path: string) => kommo<T>('GET', path)

export interface KommoFieldValue { field_id: number; values: Array<{ value?: unknown; enum_id?: number }> }

export interface KommoLead {
  id: number
  name?: string
  status_id: number
  pipeline_id: number
  responsible_user_id?: number
  custom_fields_values?: KommoFieldValue[] | null
  _embedded?: { tags?: Array<{ id: number; name: string }>; contacts?: Array<{ id: number; is_main?: boolean }> }
}

export async function getLead(leadId: number): Promise<KommoLead> {
  return kommo<KommoLead>('GET', `/api/v4/leads/${leadId}?with=contacts`)
}

export const leadTags = (lead: KommoLead) => (lead._embedded?.tags || []).map(t => t.name)

export async function updateLeadFields(leadId: number, values: KommoFieldValue[]): Promise<void> {
  await kommo('PATCH', `/api/v4/leads/${leadId}`, { custom_fields_values: values })
}

export async function updateLeadStatus(leadId: number, statusId: number, pipelineId: number): Promise<void> {
  await kommo('PATCH', `/api/v4/leads/${leadId}`, { status_id: statusId, pipeline_id: pipelineId })
}

async function setLeadTags(leadId: number, names: string[]): Promise<void> {
  // Array vazio não limpa: o Kommo ignora. Para zerar, é preciso tags_to_delete.
  await kommo('PATCH', `/api/v4/leads/${leadId}`, { _embedded: { tags: names.map(name => ({ name })) } })
}

export async function addLeadTags(leadId: number, names: string[]): Promise<void> {
  if (!names.length) return
  const current = leadTags(await getLead(leadId))
  const lower = new Set(current.map(t => t.toLowerCase()))
  const add = names.filter(n => !lower.has(n.toLowerCase()))
  if (add.length) await setLeadTags(leadId, [...current, ...add])
}

/** Remove tags sem apagar as outras. Usa tags_to_delete (funciona mesmo quando sobra zero tag). */
export async function removeLeadTags(leadId: number, names: string[]): Promise<void> {
  if (!names.length) return
  const lead = await getLead(leadId)
  const drop = new Set(names.map(n => n.toLowerCase()))
  const alvo = (lead._embedded?.tags || []).filter(t => drop.has(t.name.toLowerCase()))
  if (!alvo.length) return
  try {
    await kommo('PATCH', `/api/v4/leads/${leadId}`, { tags_to_delete: alvo.map(t => ({ id: t.id })) })
  } catch (e) {
    // Conta sem suporte a tags_to_delete: regrava o conjunto restante (merge local)
    const kept = leadTags(lead).filter(n => !drop.has(n.toLowerCase()))
    if (!kept.length) throw e
    await setLeadTags(leadId, kept)
  }
  // Prova: relê o lead. Tag que "saiu com 200" e continua lá = IA que não desliga.
  const still = leadTags(await getLead(leadId)).filter(n => drop.has(n.toLowerCase()))
  if (still.length) throw new Error(`tags não removidas do lead ${leadId}: ${still.join(', ')}`)
}

export async function addLeadNote(leadId: number, text: string): Promise<void> {
  await kommo('POST', `/api/v4/leads/${leadId}/notes`, [{ note_type: 'common', params: { text } }])
}

/** Dispara o Salesbot de envio. Sem retry em 5xx (ver topo do arquivo). */
export async function runSalesbot(botId: number, leadId: number): Promise<void> {
  await kommo('POST', '/api/v2/salesbot/run', [{ bot_id: botId, entity_id: leadId, entity_type: 'leads' }], { retry5xx: false })
}

export function fieldValue(lead: KommoLead, fieldId: number): unknown {
  const f = (lead.custom_fields_values || []).find(v => v.field_id === fieldId)
  return f?.values?.[0]?.value ?? null
}

export function fieldEnumIds(lead: KommoLead, fieldId: number): number[] {
  const f = (lead.custom_fields_values || []).find(v => v.field_id === fieldId)
  return (f?.values || []).map(v => v.enum_id).filter((x): x is number => typeof x === 'number')
}
