import { CONFIG } from './config'
import { CRM_MAP } from './crm-map'
import { addLeadTags, updateLeadStatus } from './kommo'
import {
  aceitarIncoming, contatoPorTelefone, criarContato, criarLead, funisAoVivo, leadsDoContato, GANHO, PERDIDO,
  type KommoFunil, type KommoLeadV,
} from './kommo-vivo'
import type { EventoStevo } from './stevo'

/**
 * O CARD DA CONVERSA no número da Lia (Stevo). Com a integração da Stevo com o Kommo
 * ligada, a Stevo cria o contato e o card (em "Incoming leads"); o app ADOTA esse card
 * em vez de criar outro. Ordem:
 *  1. card aberto no Funil/SDR → é ele (se não triado, aceita em Qualificação);
 *  2. card novo da Stevo (não triado, < 2 dias) em outro funil → aceita e leva para
 *     Funil/SDR > Qualificação;
 *  3. card aberto em outro funil (quem já é cliente) → é ele, sem mexer (a Lia trata
 *     como atendimento);
 *  4. nenhum → cria em Funil/SDR > Qualificação.
 * A tag de gate só entra sozinha com STEVO_TAG_LIA ligado (fim da rampagem).
 */

const ESPERA_STEVO_MS = Number(process.env.STEVO_ESPERA_MS ?? 5000)
const ADOTAR_ATE_S = 2 * 86400
const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

const aberto = (l: KommoLeadV) => l.status_id !== GANHO && l.status_id !== PERDIDO
const recente = (ls: KommoLeadV[]) => [...ls].sort((a, b) => (b.updated_at || b.id) - (a.updated_at || a.id))[0]
const etapaDe = (funis: KommoFunil[], l: KommoLeadV) => funis.find(f => f.id === l.pipeline_id)?._embedded.statuses.find(s => s.id === l.status_id)
const naoTriado = (funis: KommoFunil[], l: KommoLeadV) => etapaDe(funis, l)?.type === 1

/** Aceita (se não triado) e põe em Funil/SDR > Qualificação. */
async function trazerParaSdr(l: KommoLeadV, funis: KommoFunil[]): Promise<void> {
  if (naoTriado(funis, l)) {
    const f = funis.find(x => x.id === l.pipeline_id)
    const primeira = f?._embedded.statuses.filter(s => s.type !== 1 && s.id !== GANHO && s.id !== PERDIDO).sort((a, b) => a.sort - b.sort)[0]
    await aceitarIncoming(l.id, primeira?.id)
  }
  if (l.pipeline_id !== CRM_MAP.sdr.pipelineId || l.status_id !== CRM_MAP.sdr.etapas.qualificacao) {
    await updateLeadStatus(l.id, CRM_MAP.sdr.etapas.qualificacao, CRM_MAP.sdr.pipelineId)
  }
}

export type Card = { leadId: number; como: 'sdr' | 'adotado' | 'cliente' | 'criado' }

export async function cardDaConversa(e: EventoStevo): Promise<Card> {
  const contato = (await contatoPorTelefone(e.fone))
    || (await espera(ESPERA_STEVO_MS), await contatoPorTelefone(e.fone))
    || await criarContato(e.nome, e.fone)
  const [funis, leads] = await Promise.all([funisAoVivo(), leadsDoContato(contato)])
  const abertos = leads.filter(aberto)
  const agora = Date.now() / 1000
  const tagar = async (id: number) => { if (CONFIG.stevoTagLia && CONFIG.gateTag) await addLeadTags(id, [CONFIG.gateTag]) }

  const noSdr = recente(abertos.filter(l => l.pipeline_id === CRM_MAP.sdr.pipelineId))
  if (noSdr) {
    if (naoTriado(funis, noSdr)) await trazerParaSdr(noSdr, funis)
    await tagar(noSdr.id)
    return { leadId: noSdr.id, como: 'sdr' }
  }
  const daStevo = recente(abertos.filter(l => naoTriado(funis, l) && agora - (l.created_at || 0) < ADOTAR_ATE_S))
  if (daStevo) {
    await trazerParaSdr(daStevo, funis)
    await tagar(daStevo.id)
    return { leadId: daStevo.id, como: 'adotado' }
  }
  const cliente = recente(abertos)
  if (cliente) return { leadId: cliente.id, como: 'cliente' }
  const tags = CONFIG.stevoTagLia && CONFIG.gateTag ? [CONFIG.gateTag] : []
  const id = await criarLead(contato.name || e.nome || `+${e.fone}`, CRM_MAP.sdr.pipelineId, CRM_MAP.sdr.etapas.qualificacao, contato.id, tags)
  return { leadId: id, como: 'criado' }
}
