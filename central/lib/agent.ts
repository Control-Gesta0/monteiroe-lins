import 'server-only'
import { demo } from './demo'

export type Recurso = 'execucoes' | 'live' | 'base' | 'teste' | 'reais'

/**
 * Lê o agente no servidor (o segredo nunca vai ao navegador).
 * Fail-closed: sem AGENT_URL/AGENT_SECRET devolve erro, nunca dado vazio que
 * pareça "tudo bem". CENTRAL_DEMO=1 só serve para ver a tela com dados fictícios.
 */
export async function lerAgente(recurso: Recurso): Promise<{ status: number; body: unknown }> {
  if (process.env.CENTRAL_DEMO === '1') return { status: 200, body: { ...(demo(recurso) as object), demo: true } }
  const url = process.env.AGENT_URL
  const secret = process.env.AGENT_SECRET
  if (!url || !secret) return { status: 503, body: { error: 'Central sem conexão com o agente: configure AGENT_URL e AGENT_SECRET.' } }
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/api/central?recurso=${recurso}`, {
      headers: { 'x-central-secret': secret },
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    })
    const body = await r.json().catch(() => ({ error: `agente respondeu ${r.status} sem JSON` }))
    return { status: r.ok ? 200 : 502, body: r.ok ? body : { error: (body as { error?: string }).error || `agente respondeu ${r.status}` } }
  } catch (e) {
    return { status: 502, body: { error: `agente não respondeu: ${e instanceof Error ? e.message : String(e)}` } }
  }
}

/**
 * Chamada genérica ao agente (Base de dados e laboratório), também no servidor.
 * `rota` é o caminho no agente (ex.: /api/base?exame=x). Erro vira { error }, nunca dado falso.
 */
export async function chamarAgente(rota: string, init: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number } = {}): Promise<{ status: number; body: unknown }> {
  if (process.env.CENTRAL_DEMO === '1') return { status: 200, body: demoChamada(rota, init.method || 'GET') }
  const url = process.env.AGENT_URL
  const secret = process.env.AGENT_SECRET
  if (!url || !secret) return { status: 503, body: { error: 'Central sem conexão com o agente: configure AGENT_URL e AGENT_SECRET.' } }
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}${rota}`, {
      method: init.method || 'GET',
      headers: { 'x-central-secret': secret, ...(init.body ? { 'content-type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(init.timeoutMs || 25_000),
    })
    const body = await r.json().catch(() => ({ error: `agente respondeu ${r.status} sem JSON` }))
    return { status: r.status, body }
  } catch (e) {
    const tempo = e instanceof Error && /timeout|aborted/i.test(e.name + e.message)
    return { status: 502, body: { error: tempo ? 'O agente demorou demais para responder. Tente de novo.' : `agente não respondeu: ${e instanceof Error ? e.message : String(e)}` } }
  }
}

function demoChamada(rota: string, metodo: string): unknown {
  if (metodo === 'POST') return { error: 'Modo demonstração: salvar, publicar e conversar precisam do agente de verdade.' }
  // o recurso sai do caminho (/api/base, /api/teste): acesso dinâmico ao JSON de demonstração
  const recurso = rota.split('?')[0].split('/').pop() as Recurso
  // conversas reais de demonstração (montadas do diário fictício)
  const reais = demo('reais') as { conversas: unknown[]; turnos: Record<string, unknown[]> } | undefined
  if (reais && /[?&]conversas=1/.test(rota)) return { conversas: reais.conversas, demo: true }
  const um = rota.match(/[?&]conversa=([^&]+)/)
  if (reais && um) return { contato: decodeURIComponent(um[1]), turnos: reais.turnos[decodeURIComponent(um[1])] || [], demo: true }
  const dado = recurso === 'base' || recurso === 'teste' ? demo(recurso) : null
  return dado ? { ...(dado as object), demo: true } : { error: 'rota sem demonstração' }
}
