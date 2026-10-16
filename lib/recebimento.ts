import crypto from 'crypto'
import { CONFIG } from './config'
import { CRM_MAP } from './crm-map'
import { logExec } from './execlog'
import { appendMessage } from './history'
import { leadTags, type KommoLead } from './kommo'
import type { MediaKind } from './media'
import { k, redis } from './redis'
import { sendReply } from './transport'

/**
 * Robô de recebimento: lead em Qualificação, sem a Lia, mandou foto ou PDF → agradecimento fixo, uma vez
 * por janela. Não passa pela IA nem lê o arquivo. Config em CRM_MAP.recebimento.
 */

type Cfg = typeof CRM_MAP.recebimento

/** Por que NÃO agradecer (undefined = agradece). Puro, para testar sem rede. */
export function motivoSemAgradecimento(
  kind: MediaKind | null,
  lead: Pick<KommoLead, 'pipeline_id' | 'status_id'> & { tags: string[] },
  cfg: Cfg = CRM_MAP.recebimento,
  gateTag = CONFIG.gateTag,
  humanTag = CONFIG.humanTag,
): string | undefined {
  if (!cfg.ativo) return 'robô de recebimento desligado'
  if (kind !== 'image' && kind !== 'document') return 'não é foto nem documento'
  if (lead.pipeline_id !== CRM_MAP.sdr.pipelineId || !cfg.etapas.includes(lead.status_id)) return 'fora da etapa do robô'
  const tags = lead.tags.map(t => t.toLowerCase())
  if (!gateTag || tags.includes(gateTag)) return 'a Lia atende este lead'
  if (tags.includes(humanTag)) return `tag "${humanTag}"`
  return undefined
}

/** Lead com a Lia: só esses têm a mídia lida pela IA (os outros não gastam modelo nem mandam o documento para fora). */
export function liaAtende(lead: KommoLead): boolean {
  return !CONFIG.gateTag || leadTags(lead).map(t => t.toLowerCase()).includes(CONFIG.gateTag)
}

export async function agradecerRecebimento(lead: KommoLead, kind: MediaKind | null): Promise<void> {
  const cfg = CRM_MAP.recebimento
  if (motivoSemAgradecimento(kind, { ...lead, tags: leadTags(lead) })) return
  // Uma vez por janela: as outras páginas do mesmo contracheque não repetem a mensagem
  const primeira = await redis.set(k('recebimento', lead.id), String(Date.now()), { nx: true, ex: cfg.janelaHoras * 3600 })
  if (!primeira) return
  const detalhe = await sendReply(lead.id, cfg.texto)
  await appendMessage(lead.id, { id: crypto.randomUUID(), dir: 'out', text: cfg.texto, ts: Date.now() })
  await logExec({ tipo: 'menu', leadId: lead.id, nome: lead.name || '', porta: 'recebimento', detalhe: `${detalhe} · robô de recebimento (documento recebido)` })
}
