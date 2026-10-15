import data from './demo-data.json'
import type { Recurso } from './agent'

/** Dados FICTÍCIOS (gerados pelas mesmas funções do agente) — só com CENTRAL_DEMO=1. */
export function demo(recurso: Recurso): unknown {
  return (data as Record<Recurso, unknown>)[recurso]
}
