import type { LeadPort } from './tools'

/**
 * Porta em MEMÓRIA: o mesmo contrato do Kommo + Redis, mas nada sai daqui.
 * Usada pelo exame (evals, CLI e botão Publicar) e pelo laboratório da Central.
 */
export interface World {
  tasks: Array<{ typeId: number; text: string; completeTill: number }>
  lost?: number | null
  /** reuniões já marcadas (epoch s) */
  ocupados: number[]
  /** "agora" (epoch s): deixa a agenda determinística */
  agoraS: number
  statusId: number
  pipelineId: number
  fields: Record<number, { value?: unknown; enumIds: number[] }>
  tags: Set<string>
  notes: string[]
  state: Record<string, any>
  log: string[]
}

export function novoMundo(o: Partial<Pick<World, 'statusId' | 'pipelineId' | 'ocupados' | 'agoraS' | 'state'>> & { gateTag: string }): World {
  return {
    statusId: o.statusId ?? 85921943, pipelineId: o.pipelineId ?? 11197195, fields: {}, tags: new Set([o.gateTag]), notes: [],
    state: o.state || {}, log: [], tasks: [], ocupados: [...(o.ocupados || [])], agoraS: o.agoraS ?? Math.floor(Date.now() / 1000),
  }
}

export function memoryPort(w: World): LeadPort {
  return {
    async getLead() { return { id: 1, statusId: w.statusId, pipelineId: w.pipelineId, fields: structuredClone(w.fields), tags: [...w.tags] } },
    async writeFields(vs) { for (const v of vs) { w.fields[v.field_id] = { value: v.values[0]?.value, enumIds: v.values.map(x => x.enum_id).filter((x): x is number => typeof x === 'number') }; w.log.push(`campo ${v.field_id} = ${JSON.stringify(v.values).slice(0, 120)}`) } },
    async moveStage(s, p) { w.statusId = s; w.pipelineId = p; w.log.push(`etapa → ${s}`) },
    async addTags(t) { t.forEach(x => w.tags.add(x.toLowerCase())); w.log.push(`tags + ${t.join(',')}`) },
    async removeTags(t) { t.forEach(x => w.tags.delete(x.toLowerCase())); w.log.push(`tags − ${t.join(',')}`) },
    async addNote(n) { w.notes.push(n); w.log.push(`nota: ${n.slice(0, 80)}`) },
    async createTask(typeId, text, completeTill) { w.tasks.push({ typeId, text, completeTill }); w.log.push(`tarefa ${typeId}: ${text.slice(0, 80)}`) },
    async markLost(r) { w.lost = r ?? null; w.statusId = 143; w.log.push('venda perdida') },
    async horariosOcupados() { return [...w.ocupados] },
    async reservarHorario(inicio) { if (w.ocupados.includes(inicio)) return false; w.ocupados.push(inicio); return true },
    async criarEventoAgenda() { w.log.push('evento na agenda (simulado)'); return null },
    agoraS: () => w.agoraS,
    async getState() { return structuredClone(w.state) },
    async patchState(p) { Object.assign(w.state, p); return structuredClone(w.state) },
  }
}
