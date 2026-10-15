import OpenAI from 'openai'
import type { PromptsRenderizados } from './base'
import type { Textos } from './base-core'
import { portaById } from './crm-map'
import { costUsd } from './execlog'
import type { ChatMsg } from './history'
import { createBrain } from './llm'
import { memoryPort, novoMundo, type World } from './porta-memoria'

/**
 * O EXAME DO CÉREBRO como módulo: o mesmo executor serve à linha de comando
 * (scripts/evals.ts) e ao botão Publicar da Central (lib/exame.ts). Roda os
 * prompts com as ferramentas REAIS numa porta em memória (zero efeito no CRM).
 * Cada cenário: checagens em código + critérios para um juiz cego.
 */

export type { World } from './porta-memoria'

export interface Turno { lead: string; resposta: string; tools: string[]; guard: string[]; handoff: boolean }

export interface Cenario {
  id: string
  porta: string
  nomeContato?: string
  historico?: Array<['in' | 'out', string]>
  state?: Record<string, any>
  statusId?: number
  pipelineId?: number
  ocupados?: number[]
  msgs: string[]
  checks: Array<{ nome: string; fn: (w: World, t: Turno[]) => boolean }>
  criterios: string[]
}

export interface Resultado {
  id: string
  rep: number
  passou: boolean
  nota: number
  falhasCodigo: string[]
  falhasJuiz: Array<{ criterio: string; porque: string }>
  conversa: Turno[]
  log: string[]
}

export interface RunOpts {
  apiKey: string
  model: string
  judgeModel: string
  cenarios: Cenario[]
  /** prompts candidatos (base); sem isso, os arquivos do disco */
  prompts?: PromptsRenderizados
  textos?: Partial<Textos>
  reps?: number
  concorrencia?: number
  gateTag?: string
  onProgresso?: (feitos: number, total: number) => void | Promise<void>
}

const JUIZ = 'Você avalia a conversa de um atendente virtual de WhatsApp. Para CADA critério responda se foi atendido. Seja rigoroso e literal. JSON: {"criterios":[{"criterio":"...","ok":true|false,"porque":"..."}]}'

export async function runEvals(o: RunOpts): Promise<{ resultados: Resultado[]; custoUsd: number }> {
  const openai = new OpenAI({ apiKey: o.apiKey })
  const gate = (o.gateTag || 'gate').toLowerCase()
  const reps = o.reps || 1
  const fila = o.cenarios.flatMap(c => Array.from({ length: reps }, (_, i) => ({ c, rep: i + 1 })))
  const resultados: Resultado[] = []
  let custo = 0
  let feitos = 0

  async function um(c: Cenario, rep: number): Promise<Resultado> {
    const porta = portaById(c.porta)
    if (!porta) throw new Error(`cenário ${c.id}: porta ${c.porta} não existe`)
    const w = novoMundo({ gateTag: gate, statusId: c.statusId, pipelineId: c.pipelineId, ocupados: c.ocupados, state: { porta: porta.id, portaEm: 0, ...(c.state || {}) } })
    const brain = createBrain({
      apiKey: o.apiKey, model: o.model, promptOverride: o.prompts,
      onTool: (nome, input, out) => { w.log.push(`${nome}(${JSON.stringify(input).slice(0, 200)}) → ${out.isError ? 'ERRO ' : ''}${out.content.slice(0, 200)}`) },
    })
    const history: ChatMsg[] = (c.historico || []).map(([dir, text], i) => ({ id: `h${i}`, dir, text, ts: i + 1 }))
    const turnos: Turno[] = []
    for (const msg of c.msgs) {
      if (w.state.finalizado) break
      history.push({ id: `m${history.length}`, dir: 'in', text: msg, ts: history.length + 1 })
      const iOut = history.map(m => m.dir).lastIndexOf('out')
      const bloco = history.slice(iOut + 1).map(m => m.text).join('\n')
      const reply = await brain.generateReply({
        port: memoryPort(w), porta, gateTag: gate, textos: o.textos,
        leadText: history.filter(m => m.dir === 'in').map(m => m.text).join('\n'),
        lastLeadText: bloco,
        lastAgentText: iOut >= 0 ? history[iOut].text : '',
      }, { nomeContato: c.nomeContato || '', primeiroContatoDaPorta: !history.some(m => m.dir === 'out') }, history)
      const resposta = reply?.text || ''
      custo += reply ? costUsd(o.model, reply.usage) || 0 : 0
      turnos.push({ lead: msg, resposta, tools: reply?.toolsUsed || [], guard: reply?.guard || [], handoff: !!reply?.handoff })
      history.push({ id: `r${history.length}`, dir: 'out', text: resposta, ts: history.length + 1 })
    }
    const falhasCodigo = c.checks.filter(ch => { try { return !ch.fn(w, turnos) } catch { return true } }).map(ch => ch.nome)
    const transcript = turnos.map(t => `LEAD: ${t.lead}\nIA: ${t.resposta}`).join('\n\n')
    const juiz = await openai.chat.completions.create({
      model: o.judgeModel,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: JUIZ },
        { role: 'user', content: `CRITÉRIOS:\n${c.criterios.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\nCONVERSA:\n${transcript}` },
      ],
    })
    const veredito = JSON.parse(juiz.choices[0].message.content || '{"criterios":[]}') as { criterios: Array<{ criterio: string; ok: boolean; porque: string }> }
    const falhasJuiz = (veredito.criterios || []).filter(x => !x.ok).map(x => ({ criterio: x.criterio, porque: x.porque }))
    const nota = c.criterios.length ? Math.round(((c.criterios.length - falhasJuiz.length) / c.criterios.length) * 100) / 10 : 10
    const passou = !falhasCodigo.length && !falhasJuiz.length && (veredito.criterios || []).length >= c.criterios.length
    return { id: c.id, rep, passou, nota, falhasCodigo, falhasJuiz, conversa: turnos, log: w.log }
  }

  // Concorrência limitada: cabe no tempo da função sem estourar o limite de tokens por minuto
  const conc = Math.max(1, o.concorrencia || 1)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(conc, fila.length) }, async () => {
    while (i < fila.length) {
      const { c, rep } = fila[i++]
      resultados.push(await um(c, rep))
      feitos++
      await o.onProgresso?.(feitos, fila.length)
    }
  }))
  const ordem = new Map(fila.map((f, idx) => [`${f.c.id}#${f.rep}`, idx]))
  resultados.sort((a, b) => ordem.get(`${a.id}#${a.rep}`)! - ordem.get(`${b.id}#${b.rep}`)!)
  return { resultados, custoUsd: custo }
}
