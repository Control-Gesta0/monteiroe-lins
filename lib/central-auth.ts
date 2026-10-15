import type { VercelRequest } from '@vercel/node'
import crypto from 'crypto'
import { CONFIG } from './config'

/** A Central fala com o agente com o header x-central-secret (CENTRAL_SECRET; sem ele, o WEBHOOK_SECRET). */
export function centralAutorizada(req: VercelRequest): boolean {
  const dado = String(req.headers['x-central-secret'] || '')
  if (!dado) return false
  const segredos = [CONFIG.centralSecret, CONFIG.webhookSecret].filter(Boolean)
  const h = (x: string) => crypto.createHash('sha256').update(x).digest()
  return segredos.some(s => crypto.timingSafeEqual(h(dado), h(s)))
}

/** Corpo JSON de um POST (a Vercel já entrega parseado; string vira objeto). */
export function corpo(req: VercelRequest): Record<string, unknown> {
  const b = req.body
  if (!b) return {}
  if (typeof b === 'string') { try { return JSON.parse(b) } catch { return {} } }
  return b as Record<string, unknown>
}
