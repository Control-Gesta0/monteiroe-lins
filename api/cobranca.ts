import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { baseVigente } from '../lib/base'
import { cobranca, primeiroNome } from '../lib/base-core'
import { chaveCobranca } from '../lib/cobranca'
import { CONFIG } from '../lib/config'
import { logExec } from '../lib/execlog'
import { appendMessage, getHistory, humanSpokeRecently } from '../lib/history'
import { getLead, leadTags } from '../lib/kommo'
import { getState } from '../lib/state'
import { sendReply } from '../lib/transport'

/**
 * Lembrete do contracheque, chamado pelo QStash na hora marcada (lib/cobranca.ts).
 * Só manda se AINDA falta: mesma cadeia de pedido, sem análise, sem encerramento, o
 * lead não escreveu depois, a equipe não assumiu e o card segue com a tag da Lia.
 * Responde 200 também quando não manda (senão o QStash tenta de novo).
 */

function igual(a: string, b: string): boolean {
  if (!a || !b) return false
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest())
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  const b = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}) as Record<string, unknown>
  const leadId = Number(b.leadId), n = Number(b.n), desde = Number(b.desde)
  if (!leadId || ![1, 2, 3].includes(n) || !desde || !igual(String(b.s || ''), chaveCobranca(leadId, n, desde))) return res.status(401).json({ error: 'unauthorized' })

  const pular = (motivo: string) => res.status(200).json({ ok: true, enviado: false, motivo })
  const state = await getState(leadId)
  if (state.cobrancaDesde !== desde) return pular('pedido mais novo (outra cadeia)')
  if (state.analise) return pular('contracheque já analisado')
  if (state.finalizado) return pular('atendimento encerrado')
  if (state.porta && state.porta !== 'superendividamento') return pular(`porta ${state.porta}`)
  const historico = await getHistory(leadId)
  if (historico[historico.length - 1]?.dir !== 'out') return pular('o lead escreveu depois do pedido')
  if (await humanSpokeRecently(leadId)) return pular('equipe falou com o lead')
  const lead = await getLead(leadId)
  if (lead.status_id === 142 || lead.status_id === 143) return pular('card fechado')
  if (CONFIG.gateTag && !leadTags(lead).map(t => t.toLowerCase()).includes(CONFIG.gateTag)) return pular('sem a tag da Lia')

  const base = await baseVigente()
  const texto = cobranca(base.textos, n as 1 | 2 | 3, primeiroNome(lead.name || ''))
  try {
    const detalhe = await sendReply(leadId, texto)
    await appendMessage(leadId, { id: crypto.randomUUID(), dir: 'out', text: texto, ts: Date.now() })
    // O card NÃO muda de etapa: a etapa "follow - não responde" dispara o robô de follow-up do Kommo (cobrança em dobro)
    await logExec({ tipo: 'menu', leadId, nome: lead.name || '', porta: 'cobranca', detalhe: `cobrança ${n} do contracheque · ${detalhe}`, respostaIA: texto })
    return res.status(200).json({ ok: true, enviado: true, n })
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 250)
    await logExec({ tipo: 'erro', leadId, nome: lead.name || '', porta: 'cobranca', detalhe: `cobrança ${n}: ${msg}` })
    return res.status(200).json({ ok: false, erro: msg }) // sem retry: um envio pode ter saído
  }
}
