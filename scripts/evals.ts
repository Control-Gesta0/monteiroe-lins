/**
 * O EXAME DO CÉREBRO (linha de comando). O executor mora em lib/evals-runner.ts
 * e é o mesmo que o botão Publicar da Central usa (lib/exame.ts).
 *
 *   npm run evals                        # todos, 1 rodada
 *   npx tsx scripts/evals.ts golpe agenda   # filtra por id
 *   EVAL_REPS=3 npm run evals
 */
import { loadEnv } from './env'

loadEnv()
for (const [key, val] of Object.entries({ KOMMO_DOMAIN: 'https://eval.kommo.com', KOMMO_TOKEN: 'x', KOMMO_ACCOUNT_ID: '1', UPSTASH_REDIS_REST_URL: 'https://x.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'x', WEBHOOK_SECRET: 'x' })) process.env[key] ||= val

export type { Cenario, Turno, World } from '../lib/evals-runner'

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error('OPENAI_API_KEY ausente no .env.local'); process.exit(1) }
  const { runEvals } = await import('../lib/evals-runner')
  const { cenarios } = await import('../evals/cenarios')
  const MODEL = process.env.LLM_MODEL || 'gpt-5.4-mini-2026-03-17'
  const REPS = Number(process.env.EVAL_REPS || 1)
  const filtros = process.argv.slice(2)
  const lista = cenarios().filter(c => !filtros.length || filtros.some(f => c.id.includes(f)))
  const { resultados, custoUsd } = await runEvals({
    apiKey: process.env.OPENAI_API_KEY!, model: MODEL, judgeModel: process.env.EVAL_JUDGE_MODEL || 'gpt-5.4-2026-03-05',
    cenarios: lista, reps: REPS, concorrencia: Number(process.env.EVAL_CONCORRENCIA || 4), gateTag: process.env.GATE_TAG || 'gate',
  })
  for (const r of resultados) {
    console.log(`\n${r.passou ? '✅' : '❌'} ${r.id} [${r.rep}/${REPS}] nota ${r.nota}/10`)
    if (r.passou) continue
    console.log(r.conversa.map(t => `LEAD: ${t.lead}\nIA: ${t.resposta}`).join('\n\n').split('\n').map(l => `   ${l}`).join('\n'))
    for (const f of r.falhasCodigo) console.log(`   ⛔ código: ${f}`)
    for (const f of r.falhasJuiz) console.log(`   ⛔ juiz: ${f.criterio} — ${f.porque}`)
    for (const l of r.log) console.log(`   · ${l}`)
  }
  const reprovados = resultados.filter(r => !r.passou).length
  console.log(`\n${reprovados ? `❌ ${reprovados} reprovado(s)` : '✅ Todos aprovados'} · ${lista.length} cenário(s) × ${REPS} · custo do agente US$ ${custoUsd.toFixed(4)} (juiz não incluso)`)
  process.exit(reprovados ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
