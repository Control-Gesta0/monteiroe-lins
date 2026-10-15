import type { ExecEntry } from './execlog'

/**
 * Conversas REAIS para correção (Central › Ensinar › Conversas reais), montadas do
 * diário de execuções: o que o lead escreveu e o que a Lia mandou, já com CPF,
 * CNPJ, telefone e e-mail mascarados na gravação. Puro (sem env): testado em npm test.
 */

export interface ConversaResumo {
  contato: string
  nome: string
  ultima: string
  respostas: number
  previa: string
  /** motivo da finalização, se a Lia encerrou (agendou, renda_abaixo, pediu_humano…) */
  passou?: string
  perfil?: 'cliente' | 'nao_cliente'
}

export interface TurnoReal {
  ts: string
  tipo: 'resposta' | 'finalizou'
  cliente: string
  resposta: string
  tools: string[]
  travas: string[]
  motivo?: string
}

const COM_RESPOSTA: Array<ExecEntry['tipo']> = ['resposta', 'finalizou']
const tem = (e: ExecEntry) => COM_RESPOSTA.includes(e.tipo) && !!e.respostaIA

export function listarConversas(execs: ExecEntry[], limite = 60): ConversaResumo[] {
  const porContato = new Map<string, ExecEntry[]>()
  for (const e of execs) {
    if (!tem(e)) continue
    const id = String(e.leadId)
    const l = porContato.get(id)
    if (l) l.push(e); else porContato.set(id, [e])
  }
  return [...porContato.entries()]
    .map(([contato, l]) => {
      const ordem = [...l].sort((a, b) => b.at.localeCompare(a.at))
      const ult = ordem[0]
      const fim = ordem.find(e => e.tipo === 'finalizou')
      return {
        contato,
        nome: ult.nome || ordem.find(e => e.nome)?.nome || 'Contato',
        ultima: ult.at,
        respostas: l.length,
        previa: (ult.respostaIA || ult.turnoLead || '').replace(/\s+/g, ' ').slice(0, 140),
        passou: fim?.motivo,
        perfil: ordem.find(e => e.perfil)?.perfil,
      }
    })
    .sort((a, b) => b.ultima.localeCompare(a.ultima))
    .slice(0, limite)
}

/** Turnos de um contato, do mais antigo para o mais novo. */
export function turnosDoContato(execs: ExecEntry[], contato: string): TurnoReal[] {
  const l = execs.filter(e => String(e.leadId) === contato && tem(e)).sort((a, b) => a.at.localeCompare(b.at))
  let ultimoCliente = ''
  return l.map(e => {
    const cliente = (e.turnoLead || '').trim()
    const repetido = !!cliente && cliente === ultimoCliente
    if (cliente) ultimoCliente = cliente
    return {
      ts: e.at,
      tipo: e.tipo as TurnoReal['tipo'],
      cliente: repetido ? '' : cliente,
      resposta: e.respostaIA || '',
      tools: (e.tools || []).filter(t => !t.startsWith('trava:')),
      travas: e.guard || [],
      motivo: e.tipo === 'finalizou' ? e.motivo : undefined,
    }
  })
}

/** Contexto da correção: até 6 turnos antes + o que o lead escreveu na resposta marcada. */
export function contextoReal(turnos: TurnoReal[], ts: string): { lead: string; resposta: string; turno: TurnoReal } | null {
  const i = turnos.findIndex(t => t.ts === ts)
  if (i < 0) return null
  const linhas: string[] = []
  for (const t of turnos.slice(Math.max(0, i - 6), i + 1)) {
    if (t.cliente) linhas.push(`LEAD: ${t.cliente}`)
    if (t !== turnos[i]) linhas.push(`LIA: ${t.resposta}`)
  }
  const d = turnos[i]
  linhas.push(`(nessa resposta a Lia usou: ${d.tools.join(', ') || 'nenhuma ferramenta'}${d.travas.length ? `; travas: ${d.travas.join(' | ')}` : ''}${d.motivo ? `; encerrou com motivo ${d.motivo}` : ''})`)
  return { lead: linhas.join('\n').slice(0, 6000), resposta: d.resposta.slice(0, 3000), turno: d }
}
