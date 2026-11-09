import type { VercelRequest, VercelResponse } from '@vercel/node'
import { waitUntil } from '@vercel/functions'
import crypto from 'crypto'
import { abrirConversa, varrerNovos } from '../lib/abertura'
import { CONFIG } from '../lib/config'
import { CRM_MAP } from '../lib/crm-map'
import { logExec } from '../lib/execlog'

/**
 * Webhook do Kommo para card novo ou que mudou de etapa ("add_lead", "status_lead"),
 * form-urlencoded: leads[add][0][id] · leads[status][0][id|status_id|pipeline_id].
 * Responde 200 na hora; a primeira mensagem sai em segundo plano (lib/abertura.ts).
 */

function safeEq(a: string, b: string): boolean {
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest())
}

type Item = { id: number; pipeline?: number; status?: number }

/** Cards do webhook, nos dois formatos que o corpo pode chegar (chaves planas ou objeto aninhado). */
export function cardsDoWebhook(body: unknown): Item[] {
  const porId = new Map<number, Item>()
  const anotar = (id: unknown, pipeline?: unknown, status?: unknown) => {
    const n = Number(id)
    if (!Number.isInteger(n) || n <= 0) return
    const it = porId.get(n) || { id: n }
    if (pipeline !== undefined && pipeline !== '') it.pipeline = Number(pipeline)
    if (status !== undefined && status !== '') it.status = Number(status)
    porId.set(n, it)
  }
  if (body && typeof body === 'object') {
    const plano = body as Record<string, unknown>
    for (const chave of Object.keys(plano)) {
      const m = /^leads\[(add|status)\]\[(\d+)\]\[id\]$/.exec(chave)
      if (m) anotar(plano[chave], plano[`leads[${m[1]}][${m[2]}][pipeline_id]`], plano[`leads[${m[1]}][${m[2]}][status_id]`])
    }
    const leads = (body as { leads?: Record<string, unknown> }).leads
    for (const ev of ['add', 'status']) {
      const lista = leads?.[ev]
      for (const item of Array.isArray(lista) ? lista : lista && typeof lista === 'object' ? Object.values(lista) : []) {
        const i = item as { id?: unknown; pipeline_id?: unknown; status_id?: unknown }
        anotar(i?.id, i?.pipeline_id, i?.status_id)
      }
    }
  }
  return [...porId.values()]
}

/** Só vale esperar e conferir o card que está no Funil/SDR, em entrada ou Qualificação (sem etapa no corpo: confere). */
export function interessa(c: Item): boolean {
  const { pipelineId, etapas } = CRM_MAP.sdr
  if (c.pipeline !== undefined && c.pipeline !== pipelineId) return false
  return c.status === undefined || c.status === etapas.entrada || c.status === etapas.qualificacao
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'lead-novo', ligado: Boolean(CONFIG.liaDesde) })
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  if (!safeEq(String(req.headers['x-webhook-secret'] || req.query.secret || ''), CONFIG.webhookSecret)) return res.status(401).json({ error: 'unauthorized' })

  // Varredura de reserva: ?varrer=1 (chamada agendada) procura cards novos da Lia sem abertura
  if (req.query.varrer === '1') return res.status(200).json({ ok: true, abertos: await varrerNovos() })

  const ids = cardsDoWebhook(req.body).filter(interessa).map(c => c.id)
  if (!CONFIG.liaDesde || !ids.length) return res.status(200).json({ ok: true, ids: ids.length, ligado: Boolean(CONFIG.liaDesde) })
  waitUntil(Promise.all(ids.slice(0, 20).map(id => abrirConversa(id).catch(async e => {
    console.error(`[lead-novo] lead ${id}:`, e)
    await logExec({ tipo: 'erro', leadId: id, porta: 'abertura', detalhe: `abertura: ${(e instanceof Error ? e.message : String(e)).slice(0, 250)}` })
  }))))
  return res.status(200).json({ ok: true, ids })
}
