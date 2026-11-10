import { CRM_MAP } from './crm-map'
import { addLeadNote, addLeadTags, createTask, fieldValue, getLead, leadsInStatuses, leadTags, markLeadLost, removeLeadTags, updateLeadFields, updateLeadStatus, type KommoFieldValue } from './kommo'
import { k, redis } from './redis'
import { iniciosOcupadosPorIntervalos } from './agenda'
import { criarEvento, googleAtivo, intervalosOcupados, listarEventos } from './google-calendar'
import { getState, patchState } from './state'
import { kommoGet } from './kommo'
import { rotaDoLead } from './stevo-conversa'
import { agendarEntrega } from './resultado'
import type { LeadPort, LeadView } from './tools'

/** Porta de produção: Kommo + Redis. Relê o lead depois de toda escrita. */
export function kommoPort(leadId: number): LeadPort {
  let cached: LeadView | undefined
  let ocupados: number[] | undefined
  return {
    async getLead() {
      if (!cached) {
        const lead = await getLead(leadId)
        const fields: LeadView['fields'] = {}
        for (const f of lead.custom_fields_values || []) {
          fields[f.field_id] = {
            value: f.values?.[0]?.value,
            enumIds: (f.values || []).map(v => v.enum_id).filter((x): x is number => typeof x === 'number'),
          }
        }
        cached = { id: lead.id, statusId: lead.status_id, pipelineId: lead.pipeline_id, fields, tags: leadTags(lead) }
      }
      return cached
    },
    async writeFields(values: KommoFieldValue[]) {
      const permitidos = values.filter(v => !CRM_MAP.camposProibidos.includes(v.field_id))
      if (permitidos.length) await updateLeadFields(leadId, permitidos)
      cached = undefined
    },
    async moveStage(statusId, pipelineId) { await updateLeadStatus(leadId, statusId, pipelineId); cached = undefined },
    async addTags(tags) { await addLeadTags(leadId, tags); cached = undefined },
    async removeTags(tags) { await removeLeadTags(leadId, tags); cached = undefined },
    async addNote(text) { await addLeadNote(leadId, text) },
    async createTask(typeId, text, completeTill) {
      const lead = await getLead(leadId)
      await createTask({ leadId, typeId, text, completeTill, responsibleUserId: lead.responsible_user_id })
    },
    async markLost(lossReasonId) { await markLeadLost(leadId, CRM_MAP.sdr.pipelineId, lossReasonId); cached = undefined },
    async horariosOcupados() {
      if (!ocupados) {
        const leads = await leadsInStatuses(CRM_MAP.sdr.pipelineId, CRM_MAP.agenda.etapasOcupadas)
        const lista = leads.map(l => Number(fieldValue(l, CRM_MAP.sdr.campos.agendamento))).filter(n => Number.isFinite(n) && n > 0)
        // Google Agenda do escritório: compromisso que bate no horário ocupa. Se a leitura falhar, o erro sobe e a
        // Lia não oferece horário (fail-closed); só guarda em cache a lista completa.
        if (await googleAtivo()) {
          const agora = Math.floor(Date.now() / 1000)
          const eventos = await listarEventos(agora, agora + (CRM_MAP.agenda.diasAFrente + 2) * 86_400)
          lista.push(...iniciosOcupadosPorIntervalos(intervalosOcupados(eventos, CRM_MAP.agenda.offsetUtc), agora, CRM_MAP.agenda))
        }
        ocupados = lista
      }
      return ocupados
    },
    async reservarHorario(inicio) {
      const ttl = Math.max(3600, inicio - Math.floor(Date.now() / 1000) + 86_400)
      const r = await redis.set(k('agenda', inicio), String(leadId), { nx: true, ex: ttl })
      if (r === 'OK') return true
      return (await redis.get<string | number>(k('agenda', inicio)))?.toString() === String(leadId)
    },
    async criarEventoAgenda(inicio, fim, titulo, descricao, local) {
      if (!(await googleAtivo())) return null
      return criarEvento({ inicioS: inicio, fimS: fim, titulo, descricao, local })
    },
    agoraS: () => Math.floor(Date.now() / 1000),
    agendarEntrega: (em: number) => agendarEntrega(leadId, em),
    async contato() {
      // Telefone: o número da conversa na Stevo; sem ela, o telefone do contato no Kommo
      const lead = await getLead(leadId)
      const cid = (lead._embedded?.contacts || []).find(c => c.is_main)?.id ?? lead._embedded?.contacts?.[0]?.id
      const c = cid ? await kommoGet<{ name?: string; custom_fields_values?: Array<{ field_code?: string; values: Array<{ value?: unknown }> }> | null }>(`/api/v4/contacts/${cid}`) : null
      const doKommo = (c?.custom_fields_values || []).filter(v => v.field_code === 'PHONE').flatMap(v => v.values.map(x => String(x.value || '').replace(/\D/g, ''))).find(x => x.length >= 10) || ''
      const rota = await rotaDoLead(leadId)
      const telefone = rota?.fone || (doKommo.length <= 11 ? `55${doKommo}` : doKommo)
      return { nome: c?.name || lead.name || '', telefone: telefone.length >= 12 ? telefone : '' }
    },
    getState: () => getState(leadId),
    patchState: p => patchState(leadId, p),
  }
}
