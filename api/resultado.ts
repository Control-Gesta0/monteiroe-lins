import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { baseVigente } from '../lib/base'
import { CONFIG } from '../lib/config'
import { portaById } from '../lib/crm-map'
import { logExec } from '../lib/execlog'
import { appendMessage, humanSpokeRecently } from '../lib/history'
import { getLead, leadTags } from '../lib/kommo'
import { kommoPort } from '../lib/port'
import { k, redis } from '../lib/redis'
import { chaveEntrega } from '../lib/resultado'
import { getState, patchState } from '../lib/state'
import { entregarResultado } from '../lib/tools'
import { sendReply } from '../lib/transport'

/**
 * Prazo do resultado (lib/resultado.ts), chamado pelo QStash: o lead não respondeu sobre as
 * outras dívidas, então o resultado guardado sai agora. Se já saiu (o lead respondeu), não faz nada.
 * Responde 200 também quando não manda (senão o QStash tenta de novo).
 */

function igual(a: string, b: string): boolean {
  if (!a || !b) return false
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest())
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  const b = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}) as Record<string, unknown>
  const leadId = Number(b.leadId), em = Number(b.em)
  if (!leadId || !em || !igual(String(b.s || ''), chaveEntrega(leadId, em))) return res.status(401).json({ error: 'unauthorized' })

  const pular = (motivo: string) => res.status(200).json({ ok: true, enviado: false, motivo })
  const state = await getState(leadId)
  if (state.pendente?.em !== em) return pular('resultado já entregue')
  if ((await redis.set(k('entrega', leadId, em), 1, { nx: true, ex: 86400 })) !== 'OK') return pular('outra entrega em andamento')
  const lead = await getLead(leadId)
  if (await humanSpokeRecently(leadId)) {
    await patchState(leadId, { pendente: undefined })
    return pular('a equipe assumiu a conversa')
  }
  if (CONFIG.gateTag && !leadTags(lead).map(t => t.toLowerCase()).includes(CONFIG.gateTag)) return pular('sem a tag da Lia')

  const porta = portaById('superendividamento')!
  const base = await baseVigente()
  const ctx = { port: kommoPort(leadId), porta, gateTag: CONFIG.gateTag, textos: base.textos, nome: lead.name || '', leadText: '', lastLeadText: '', lastAgentText: '' }
  try {
    const r = await entregarResultado(ctx)
    if (!r) return pular('nada pendente')
    const detalhe = await sendReply(leadId, r.texto)
    await appendMessage(leadId, { id: crypto.randomUUID(), dir: 'out', text: r.texto, ts: Date.now() })
    await logExec({ tipo: r.handoff ? 'finalizou' : 'resposta', leadId, nome: lead.name || '', porta: porta.id, tools: ['resultado:prazo', 'trava:texto-aprovado'], decisao: r.decisao, detalhe, respostaIA: r.texto })
    return res.status(200).json({ ok: true, enviado: true })
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 250)
    await logExec({ tipo: 'erro', leadId, nome: lead.name || '', porta: 'superendividamento', detalhe: `resultado no prazo: ${msg}` })
    return res.status(200).json({ ok: false, erro: msg })
  }
}
