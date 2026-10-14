/**
 * Cria o webhook add_message VIA API (no UI é onde se erra o filtro e nasce o eco).
 *   npx tsx scripts/create-webhook.ts            → só LISTA os webhooks atuais
 *   npx tsx scripts/create-webhook.ts --criar    → cria para DEPLOY_URL/api/inbound
 *
 * Ação externa: confirme com o responsável antes de --criar. Não remove nenhum
 * webhook existente (a desativação do sistema antigo é um passo separado e humano-aprovado).
 */
import { loadEnv } from './env'

loadEnv()
const domain = (process.env.KOMMO_DOMAIN || '').replace(/\/+$/, '').replace(/^(?!https?:\/\/)/, 'https://')
const headers = { Authorization: `Bearer ${process.env.KOMMO_TOKEN}`, 'Content-Type': 'application/json' }

async function main() {
  const atual = await fetch(`${domain}/api/v4/webhooks`, { headers }).then(r => r.status === 204 ? {} : r.json()) as any
  for (const h of atual._embedded?.webhooks || []) console.log(`${h.id} · ${h.destination} · ${JSON.stringify(h.settings)}`)
  if (!process.argv.includes('--criar')) return
  const destination = `${(process.env.DEPLOY_URL || '').replace(/\/+$/, '')}/api/inbound?secret=${process.env.WEBHOOK_SECRET}`
  const r = await fetch(`${domain}/api/v4/webhooks`, { method: 'POST', headers, body: JSON.stringify({ destination, settings: ['add_message'] }) })
  console.log('criado:', r.status, (await r.text()).slice(0, 300))
}
main()
