import { agendarCobrancas, cobrancaLigada } from './cobranca'
import { baseVigente } from './base'
import { comNome, primeiroNome } from './base-core'
import { CANAIS } from './canais'
import { CONFIG } from './config'
import { CRM_MAP } from './crm-map'
import { logExec } from './execlog'
import { appendMessage, getHistory } from './history'
import { addLeadNote, addLeadTags, kommoGet, leadTags, sleep, type KommoLead } from './kommo'
import { k, redis } from './redis'
import { getState, patchState } from './state'
import { statusStevo } from './stevo'
import { guardarRota, rotaDoLead } from './stevo-conversa'
import { sendReply } from './transport'

/**
 * PRIMEIRA MENSAGEM DA LIA PARA O LEAD DE CAMPANHA (produção, 09/11/2026).
 * O lead do formulário (tag LEC) não escreve primeiro: o card nasce em Funil/SDR >
 * Qualificação e, até aqui, um robô do Kommo mandava a primeira mensagem. Agora o
 * webhook de lead novo do Kommo (/api/lead-novo) chama abrirConversa: a Lia põe a
 * tag, manda a abertura pela Stevo no número dela e agenda os lembretes do contracheque.
 *
 * Só para card criado depois de LIA_DESDE (os anteriores seguem com a equipe) e só se
 * ninguém falou ainda: quem escreveu primeiro (anúncio de clique para o WhatsApp) é
 * atendido pelo webhook da Stevo, como sempre.
 */

const ESPERA_MS = Number(process.env.ABERTURA_ESPERA_MS ?? 30_000)
const BLOQUEIOS = ['lia-finalizou', 'lia-desqualificou']

/** Card que a Lia pode assumir sozinha: Funil/SDR, entrada ou Qualificação, criado depois de LIA_DESDE. */
export function cardDaLia(l: { pipeline_id: number; status_id: number; created_at?: number }, desdeMs = CONFIG.liaDesde): boolean {
  if (!desdeMs) return false
  const { pipelineId, etapas } = CRM_MAP.sdr
  if (l.pipeline_id !== pipelineId) return false
  if (l.status_id !== etapas.entrada && l.status_id !== etapas.qualificacao) return false
  return (l.created_at || 0) * 1000 >= desdeMs
}

/** Telefone do Kommo → dígitos com DDI 55 ("(21) 99999-1234" → "5521999991234"). */
export function foneParaEnvio(bruto: string): string {
  const d = String(bruto || '').replace(/\D/g, '').replace(/^0+/, '')
  if (d.length === 10 || d.length === 11) return `55${d}`
  return d.length >= 12 ? d : ''
}

/** Celular do Brasil com o 9 ("5521999991234") → sem o 9 ("552199991234"): alguns WhatsApps antigos ficaram assim. */
export function semNono(fone: string): string | null {
  return /^55\d{2}9\d{8}$/.test(fone) ? fone.slice(0, 4) + fone.slice(5) : null
}

type Contato = { id: number; name?: string; custom_fields_values?: Array<{ field_code?: string; values: Array<{ value?: unknown }> }> | null }
type LeadV = KommoLead & { created_at?: number }

/** Mensagens que o Kommo já registrou no card (do lead e para o lead: robô, equipe ou outra integração). */
async function chatNoKommo(leadId: number): Promise<{ doLead: boolean; paraLead: boolean }> {
  const d = await kommoGet<{ _embedded?: { events?: Array<{ type: string }> } } | null>(`/api/v4/events?filter[entity]=lead&filter[entity_id]=${leadId}&filter[type][]=incoming_chat_message&filter[type][]=outgoing_chat_message&limit=50`)
  const tipos = (d?._embedded?.events || []).map(e => e.type)
  return { doLead: tipos.includes('incoming_chat_message'), paraLead: tipos.includes('outgoing_chat_message') }
}

/** Lead escreveu e ficou sem resposta há mais disto (a Stevo não entregou): a Lia abre a conversa. */
const SEM_RESPOSTA_MS = 2 * 60_000

export async function abrirConversa(leadId: number, esperaMs = ESPERA_MS): Promise<void> {
  if (!CONFIG.liaDesde || CONFIG.canalLia !== 'stevo' || !CONFIG.gateTag) return
  const canal = Object.keys(CANAIS).find(c => CANAIS[c].ia)
  if (!canal) return
  await sleep(esperaMs) // deixa o Kommo ligar contato e tags, e a Stevo registrar quem escreveu primeiro
  const lead = await kommoGet<LeadV>(`/api/v4/leads/${leadId}?with=contacts`)
  if (!cardDaLia(lead)) return
  // Um card, uma abertura: o Kommo manda "add_lead" e "status_lead" juntos
  if ((await redis.set(k('abertura', leadId), Date.now(), { nx: true, ex: 30 * 86400 })) !== 'OK') return
  const tags = leadTags(lead).map(t => t.toLowerCase())
  const nome = lead.name || ''
  const pular = (motivo: string) => logExec({ tipo: 'pulou', leadId, nome, porta: 'abertura', detalhe: `abertura: ${motivo}` })
  if (tags.includes(CONFIG.gateTag) || tags.includes(CONFIG.humanTag) || BLOQUEIOS.some(t => tags.includes(t))) return pular('o card já tem tag de atendimento')
  if ((await getHistory(leadId)).length || (await rotaDoLead(leadId))) return pular('a conversa já começou pelo WhatsApp')
  const chat = await chatNoKommo(leadId)
  if (chat.paraLead) return pular('o card já tem mensagem para o lead (robô do Kommo ou equipe)')
  // Escreveu primeiro: quem responde é o webhook da Stevo. Se passou do prazo sem nada chegar (Stevo fora), a Lia abre.
  if (chat.doLead && Date.now() - (lead.created_at || 0) * 1000 < SEM_RESPOSTA_MS) {
    await redis.del(k('abertura', leadId))
    return
  }

  const contatoId = (lead._embedded?.contacts || []).find(c => c.is_main)?.id ?? lead._embedded?.contacts?.[0]?.id
  const contato = contatoId ? await kommoGet<Contato>(`/api/v4/contacts/${contatoId}`) : null
  const brutos = (contato?.custom_fields_values || []).filter(v => v.field_code === 'PHONE').flatMap(v => v.values.map(x => String(x.value || '')))
  const fone = brutos.map(foneParaEnvio).find(Boolean)
  if (!fone) {
    await addLeadNote(leadId, 'Lia: o card não tem telefone válido, a primeira mensagem não foi enviada.')
    return pular('sem telefone no contato')
  }

  // WhatsApp fora da Stevo: não manda e solta a trava; a varredura tenta de novo quando voltar
  if ((await statusStevo(canal)).status !== 'conectado') {
    await redis.del(k('abertura', leadId))
    await logExec({ tipo: 'erro', leadId, nome, porta: 'abertura', detalhe: 'abertura adiada: o WhatsApp da Lia está desconectado da Stevo' })
    return
  }

  const base = await baseVigente()
  const texto = comNome(base.textos.abertura, primeiroNome(contato?.name || nome))
  await addLeadTags(leadId, [CONFIG.gateTag])
  let enviado = ''
  let erro = ''
  for (const tentativa of [fone, semNono(fone)].filter((x): x is string => Boolean(x))) {
    try {
      await guardarRota(leadId, { canal, fone: tentativa })
      enviado = await sendReply(leadId, texto)
      break
    } catch (e) { erro = (e instanceof Error ? e.message : String(e)).slice(0, 200) }
  }
  if (!enviado) {
    await addLeadNote(leadId, `Lia: não consegui mandar a primeira mensagem para ${fone} (${erro}). A equipe precisa chamar o lead.`)
    await logExec({ tipo: 'erro', leadId, nome, porta: 'abertura', detalhe: `abertura para ${fone}: ${erro}` })
    return
  }

  const agora = Date.now()
  await appendMessage(leadId, { id: `abertura:${leadId}`, dir: 'out', text: texto, ts: agora })
  // Porta fixa já na abertura: a resposta do lead cai direto na análise do contracheque, com a abertura no contexto
  if (!(await getState(leadId)).porta) await patchState(leadId, { porta: 'superendividamento', portaEm: 0 })
  if (cobrancaLigada()) {
    await patchState(leadId, { cobrancaDesde: agora })
    await agendarCobrancas(leadId, agora).catch(e => console.error(`[abertura] lead ${leadId}: não agendei os lembretes`, e))
  }
  await logExec({ tipo: 'menu', leadId, nome, porta: 'abertura', detalhe: `primeira mensagem · ${enviado}`, respostaIA: texto })
}

/**
 * Varredura de reserva (sem depender do webhook): cards da Lia criados nas últimas 12 horas
 * que ainda não tiveram abertura. Só pega card com mais de 30 s (o webhook, quando existe, chega antes).
 */
export async function varrerNovos(agora = Date.now()): Promise<number[]> {
  if (!CONFIG.liaDesde) return []
  const { pipelineId, etapas } = CRM_MAP.sdr
  const de = Math.floor(Math.max(CONFIG.liaDesde, agora - 12 * 3600_000) / 1000)
  const d = await kommoGet<{ _embedded?: { leads?: LeadV[] } } | null>(`/api/v4/leads?filter[pipeline_id]=${pipelineId}&filter[created_at][from]=${de}&filter[statuses][0][pipeline_id]=${pipelineId}&filter[statuses][0][status_id]=${etapas.qualificacao}&filter[statuses][1][pipeline_id]=${pipelineId}&filter[statuses][1][status_id]=${etapas.entrada}&limit=50`)
  const candidatos: number[] = []
  for (const l of d?._embedded?.leads || []) {
    if (!cardDaLia(l) || agora / 1000 - (l.created_at || 0) < 30) continue
    if (await redis.exists(k('abertura', l.id))) continue
    candidatos.push(l.id)
  }
  for (const id of candidatos) await abrirConversa(id, 0)
  return candidatos
}
