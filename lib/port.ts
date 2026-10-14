import { CRM_MAP } from './crm-map'
import { addLeadNote, addLeadTags, createTask, fieldValue, getLead, leadsInStatuses, leadTags, markLeadLost, removeLeadTags, updateLeadFields, updateLeadStatus, type KommoFieldValue } from './kommo'
import { k, redis } from './redis'
import { getState, patchState } from './state'
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
        ocupados = leads.map(l => Number(fieldValue(l, CRM_MAP.sdr.campos.agendamento))).filter(n => Number.isFinite(n) && n > 0)
      }
      return ocupados
    },
    async reservarHorario(inicio) {
      const ttl = Math.max(3600, inicio - Math.floor(Date.now() / 1000) + 86_400)
      const r = await redis.set(k('agenda', inicio), String(leadId), { nx: true, ex: ttl })
      if (r === 'OK') return true
      return (await redis.get<string | number>(k('agenda', inicio)))?.toString() === String(leadId)
    },
    agoraS: () => Math.floor(Date.now() / 1000),
    getState: () => getState(leadId),
    patchState: p => patchState(leadId, p),
  }
}
