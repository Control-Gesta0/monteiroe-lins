/**
 * Gera o link que o dono da agenda abre para ligar a Google Agenda à Lia.
 * Vale 7 dias e uma conexão; não carrega o WEBHOOK_SECRET, então pode ir por WhatsApp.
 *   npx tsx scripts/google-convite.ts
 * Precisa só de SELF_URL, REDIS_PREFIX, UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN.
 */
import crypto from 'node:crypto'
import { loadEnv } from './env'

loadEnv()

async function main() {
  const self = (process.env.SELF_URL || '').replace(/\/+$/, '')
  const prefixo = process.env.REDIS_PREFIX || ''
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!self || !prefixo || prefixo === 'ak:' || !url || !token) throw new Error('Defina SELF_URL, REDIS_PREFIX do cliente e o Upstash antes de gerar o convite.')
  const convite = crypto.randomBytes(16).toString('hex')
  // mesma chave que k('google', 'convite', convite) no agente
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(['SET', `${prefixo}google:convite:${convite}`, '1', 'EX', 7 * 86400]) })
  if (!r.ok) throw new Error(`Upstash respondeu ${r.status}`)
  console.log(`${self}/api/google-oauth?convite=${convite}`)
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
