import { CRM_MAP } from './crm-map'
import { addLeadNote, addLeadTags, getLead, leadTags, removeLeadTags, updateLeadFields, updateLeadStatus, type KommoFieldValue } from './kommo'
import { getState, patchState } from './state'
import type { LeadPort, LeadView } from './tools'

/** Porta de produção: Kommo + Redis. Relê o lead depois de toda escrita. */
export function kommoPort(leadId: number): LeadPort {
  let cached: LeadView | undefined
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
    getState: () => getState(leadId),
    patchState: p => patchState(leadId, p),
  }
}
