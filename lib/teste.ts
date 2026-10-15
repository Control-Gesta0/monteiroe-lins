import { baseVigente, candidata, renderPrompts } from './base'
import type { Textos } from './base-core'
import { CONFIG } from './config'
import { portaById } from './crm-map'
import { costUsd } from './execlog'
import type { ChatMsg } from './history'
import { createBrain } from './llm'
import { memoryPort, novoMundo, type World } from './porta-memoria'
import { k, redis } from './redis'
import { rotear } from './router'

/**
 * LABORATÓRIO (Central › Teste): conversa com a Lia de verdade (mesmo cérebro,
 * mesmas ferramentas e travas) numa porta em MEMÓRIA. Nada vai para o Kommo,
 * para a agenda nem para o WhatsApp. A sessão vive 6 h no Redis.
 * Pode usar a versão no ar ou o rascunho da base (antes de publicar).
 */

export interface Opcoes {
  /** novo: lead do Funil/SDR · cliente: já é cliente do escritório (porta de 24 horas) */
  perfil: 'novo' | 'cliente'
  versao: 'vigente' | 'rascunho'
}

export interface Detalhe { tools: string[]; log: string[]; guard: string[]; ms: number; custoUsd: number; handoff: boolean }

export interface Sessao {
  id: string
  criadoEm: string
  opcoes: Opcoes
  history: ChatMsg[]
  /** o que aconteceria no Kommo */
  mundo: { statusId: number; tags: string[]; notes: string[]; tasks: World['tasks']; state: World['state']; ocupados: number[] }
  detalhes: Record<string, Detalhe>
  turnos: number
  custoUsd: number
}

const TTL = 6 * 3600
const MAX_TURNOS = 40
const MAX_DIA = 300
const K = (id: string) => k('teste', id)
const GATE = 'lia'

export const opcoesPadrao = (): Opcoes => ({ perfil: 'novo', versao: 'vigente' })

function nova(id: string, opcoes: Opcoes): Sessao {
  return {
    id, criadoEm: new Date().toISOString(), opcoes, history: [],
    mundo: { statusId: opcoes.perfil === 'cliente' ? 86791959 : 85921939, tags: [GATE], notes: [], tasks: [], state: {}, ocupados: [] },
    detalhes: {}, turnos: 0, custoUsd: 0,
  }
}

export async function lerSessao(id: string): Promise<Sessao | null> {
  return redis.get<Sessao>(K(id))
}

export async function recomecar(id: string, opcoes?: Partial<Opcoes>): Promise<Sessao> {
  const atual = await lerSessao(id)
  const s = nova(id, { ...opcoesPadrao(), ...(atual?.opcoes || {}), ...(opcoes || {}) })
  await redis.set(K(id), s, { ex: TTL })
  return s
}

export async function falar(id: string, texto: string): Promise<{ sessao?: Sessao; erro?: string }> {
  const msg = String(texto || '').trim().slice(0, 6000)
  if (!msg) return { erro: 'Mensagem vazia.' }
  if (/^\s*#?reset\s*$/i.test(msg)) return { sessao: await recomecar(id) }

  if (!(await redis.set(k('teste', 'lock', id), '1', { nx: true, ex: 120 }))) return { erro: 'A Lia ainda está respondendo a mensagem anterior.' }
  try {
    const s = (await lerSessao(id)) || nova(id, opcoesPadrao())
    if (s.mundo.state.finalizado) return { erro: 'A Lia já encerrou este atendimento (no WhatsApp ela para de responder aqui). Clique em Recomeçar para testar de novo.' }
    if (s.turnos >= MAX_TURNOS) return { erro: `Esta conversa chegou a ${MAX_TURNOS} mensagens. Clique em Recomeçar.` }
    const dia = k('teste', 'dia', new Date().toISOString().slice(0, 10))
    const usados = await redis.incr(dia)
    if (usados === 1) await redis.expire(dia, 2 * 86400)
    if (usados > MAX_DIA) return { erro: `O laboratório chegou ao limite de ${MAX_DIA} mensagens hoje (protege o custo). Volta amanhã.` }

    const { prompts, textos } = s.opcoes.versao === 'rascunho'
      ? await candidata().then(c => ({ textos: c.textos as Textos, prompts: renderPrompts(c.textos, c.extras) }))
      : await baseVigente()

    const t0 = Date.now()
    s.history.push({ id: `l${s.history.length}`, dir: 'in', text: msg, ts: Date.now() })
    const w: World = novoMundo({ gateTag: GATE, statusId: s.mundo.statusId, ocupados: s.mundo.ocupados, state: s.mundo.state })
    w.tags = new Set(s.mundo.tags)
    w.notes = [...s.mundo.notes]
    w.tasks = [...s.mundo.tasks]

    const iOut = s.history.map(m => m.dir).lastIndexOf('out')
    const bloco = s.history.slice(iOut + 1).filter(m => m.dir === 'in').map(m => m.text).join('\n') || msg
    // Mesmo roteamento do WhatsApp: cliente (perfil ou "meu processo") recebe a mensagem de 24 horas, sem LLM
    const rota = s.opcoes.perfil === 'cliente' ? 'atendimento' : (() => { const r = rotear(w.state, bloco); return r.tipo === 'porta' ? r.porta.id : 'superendividamento' })()
    let resposta: string
    let det: Detalhe
    if (rota === 'atendimento') {
      resposta = `Oi! ${textos.enc_atendimento}`
      w.state.finalizado = { motivo: 'porta_sem_agente', em: new Date().toISOString(), resumo: 'Cliente do escritório' }
      w.tags.delete(GATE)
      w.log.push('porta atendimento: mensagem fixa de 24 horas, tarefa de retorno para a equipe, Lia sai da conversa')
      det = { tools: ['trava:atendimento-24h'], log: w.log, guard: [], ms: Date.now() - t0, custoUsd: 0, handoff: true }
    } else {
      w.state.porta = 'superendividamento'
      const porta = portaById('superendividamento')!
      const brain = createBrain({
        apiKey: CONFIG.openaiApiKey, model: CONFIG.llmModel, promptOverride: prompts,
        onTool: (nome, input, out) => { w.log.push(`${nome}(${JSON.stringify(input).slice(0, 300)}) → ${out.isError ? 'NÃO FEZ: ' : ''}${out.content.slice(0, 220)}`) },
      })
      const reply = await brain.generateReply({
        port: memoryPort(w), porta, gateTag: GATE, textos,
        leadText: s.history.filter(m => m.dir === 'in').map(m => m.text).join('\n'),
        lastLeadText: bloco,
        lastAgentText: iOut >= 0 ? s.history[iOut].text : '',
      }, { nomeContato: 'Teste', primeiroContatoDaPorta: !s.history.some(m => m.dir === 'out') }, s.history)
      resposta = reply?.text || '(a Lia não gerou resposta)'
      const custo = reply ? costUsd(CONFIG.llmModel, reply.usage) || 0 : 0
      det = { tools: reply?.toolsUsed || [], log: w.log, guard: reply?.guard || [], ms: Date.now() - t0, custoUsd: custo, handoff: !!reply?.handoff }
    }
    const rid = `r${s.history.length}`
    s.history.push({ id: rid, dir: 'out', text: resposta, ts: Date.now() })
    s.detalhes[rid] = det
    s.mundo = { statusId: w.statusId, tags: [...w.tags], notes: w.notes, tasks: w.tasks, state: w.state, ocupados: w.ocupados }
    s.turnos++
    s.custoUsd = Math.round((s.custoUsd + det.custoUsd) * 1e6) / 1e6
    await redis.set(K(id), s, { ex: TTL })
    const kc = k('teste', 'custo', new Date().toISOString().slice(0, 10))
    await redis.incrbyfloat(kc, det.custoUsd)
    await redis.expire(kc, 40 * 86400)
    return { sessao: s }
  } finally {
    await redis.del(k('teste', 'lock', id))
  }
}

export async function custoHoje(): Promise<{ mensagens: number; custoUsd: number; limite: number; usdBrl: number }> {
  const d = new Date().toISOString().slice(0, 10)
  const [m, c] = await Promise.all([redis.get<number>(k('teste', 'dia', d)), redis.get<number>(k('teste', 'custo', d))])
  return { mensagens: Number(m || 0), custoUsd: Math.round(Number(c || 0) * 10000) / 10000, limite: MAX_DIA, usdBrl: CONFIG.usdBrl }
}
