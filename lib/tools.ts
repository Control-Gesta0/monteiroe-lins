import type OpenAI from 'openai'
import { CRM_MAP, campoByKey, type Campo, type Porta } from './crm-map'
import { DISSE_NAO_SEI, evidenceFound, matchOption, overlap, parseNumeroBR } from './guards'
import type { KommoFieldValue } from './kommo'
import { classificar } from './router'
import type { LeadState } from './state'

/**
 * As tools falam com o CRM por uma PORTA DE DADOS. Produção = Kommo + Redis
 * (lib/port.ts); evals/testes = memória. A regra de negócio é a MESMA.
 */

export interface LeadView { id: number; statusId: number; pipelineId: number; fields: Record<number, { value?: unknown; enumIds: number[] }>; tags: string[] }

export interface LeadPort {
  getLead(): Promise<LeadView>
  writeFields(values: KommoFieldValue[]): Promise<void>
  moveStage(statusId: number, pipelineId: number): Promise<void>
  addTags(tags: string[]): Promise<void>
  removeTags(tags: string[]): Promise<void>
  addNote(text: string): Promise<void>
  getState(): Promise<LeadState>
  patchState(p: Partial<LeadState>): Promise<LeadState>
}

export interface ToolCtx {
  port: LeadPort
  porta: Porta
  gateTag: string
  /** tudo que o lead escreveu (trava anti-invenção) */
  leadText: string
  /** último bloco do lead (o turno atual) */
  lastLeadText: string
  /** última mensagem do escritório antes do turno (a pergunta respondida) */
  lastAgentText: string
}

export interface ToolOutcome { content: string; isError: boolean; handoff?: boolean; urgente?: boolean }

const ok = (content: string, extra: Partial<ToolOutcome> = {}): ToolOutcome => ({ content, isError: false, ...extra })
const err = (content: string): ToolOutcome => ({ content, isError: true })

export const MOTIVOS = ['qualificado', 'advogado_ativo', 'menor_de_idade', 'urgencia', 'fora_do_escopo', 'pediu_humano', 'desistiu'] as const
type Motivo = typeof MOTIVOS[number]

/** Sinal mínimo que a evidência precisa ter para cada motivo de finalização. */
const SINAL_MOTIVO: Partial<Record<Motivo, RegExp>> = {
  advogado_ativo: /advogad|processo|recurso|escrit[oó]rio|a[cç][aã]o/i,
  menor_de_idade: /\b(1[0-7]|[5-9])\s*anos\b|menor|col[eé]gio|escola|minha m[aã]e|meu pai/i,
  urgencia: /comida|fome|comer|rem[eé]dio|medica|despej|aluguel atrasad|na rua|intern|hospital|urgent|desesper/i,
  desistiu: /desist|n[aã]o (quero|tenho interesse|preciso) mais|deixa (pra|para) l[aá]|pode encerrar|n[aã]o quero continuar|n[aã]o vou (querer|continuar)/i,
  pediu_humano: /humano|pessoa|atendente|advogad|doutor|dra?\b|falar com|me liga|liga[cç][aã]o|reclam/i,
}

export function buildTools(porta: Porta): OpenAI.Chat.ChatCompletionTool[] {
  const tools: OpenAI.Chat.ChatCompletionTool[] = []
  if (porta.roteiro.length) {
    tools.push({
      type: 'function',
      function: {
        name: 'salvar_respostas',
        description: 'Grava TODAS as respostas do roteiro que o lead já deu (várias de uma vez se ele respondeu muita coisa numa mensagem). Chame ANTES de fazer a próxima pergunta. O retorno diz o que falta.',
        parameters: {
          type: 'object',
          properties: {
            respostas: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  campo: { type: 'string', enum: porta.roteiro },
                  evidencia: { type: 'string', description: 'Trecho LITERAL do que o lead escreveu que comprova a resposta. Sem trecho do lead = não salve.' },
                  valor: { type: 'string', description: 'Opção: o texto EXATO de uma das opções. Número: algarismos. Texto: como o lead disse. "Não sabe" só se ele disse que não sabe.' },
                },
                required: ['campo', 'evidencia', 'valor'],
                additionalProperties: false,
              },
            },
          },
          required: ['respostas'],
          additionalProperties: false,
        },
      },
    })
  }
  tools.push(
    {
      type: 'function',
      function: {
        name: 'registrar_respondente',
        description: 'Registra QUEM está digitando quando não é o próprio interessado (ex.: a mãe falando pelo filho). Depois chame a pessoa pelo nome dela.',
        parameters: {
          type: 'object',
          properties: { nome: { type: 'string' }, relacao: { type: 'string', description: 'mãe, filho, cônjuge, cuidador, o próprio...' } },
          required: ['nome', 'relacao'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'registrar_outro_assunto',
        description: 'O lead trouxe um assunto de OUTRA ÁREA atendida pelo escritório (outro serviço, não uma dúvida do assunto atual). Registra para a equipe; você continua no assunto atual.',
        parameters: {
          type: 'object',
          properties: { assunto: { type: 'string' }, evidencia: { type: 'string', description: 'Trecho literal do lead' } },
          required: ['assunto', 'evidencia'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'finalizar_atendimento',
        description: 'Encerra a participação da IA nesta conversa. Chame ANTES de escrever a mensagem de encerramento. Use quando: o roteiro obrigatório está completo (qualificado); o lead tem advogado ativo no caso; quem escreve é menor de idade; há urgência humanitária; o assunto está fora do escopo; o lead pediu humano; ou desistiu. Depois disso envie a mensagem de encerramento e NÃO faça perguntas.',
        parameters: {
          type: 'object',
          properties: {
            motivo: { type: 'string', enum: [...MOTIVOS] },
            evidencia: { type: 'string', description: 'Trecho literal do lead que justifica o motivo (dispensado para "qualificado")' },
            resumo: { type: 'string', description: '2 a 4 frases para a equipe: quem é, a situação e o que busca' },
          },
          required: ['motivo', 'resumo'],
          additionalProperties: false,
        },
      },
    },
  )
  if (CRM_MAP.etapas.length) {
    tools.push({
      type: 'function',
      function: {
        name: 'mover_etapa',
        description: `Move o lead de etapa. Opções: ${CRM_MAP.etapas.map(e => `"${e.name}" (${e.quando})`).join('; ')}`,
        parameters: {
          type: 'object',
          properties: { etapa: { type: 'string', enum: CRM_MAP.etapas.map(e => e.name) } },
          required: ['etapa'],
          additionalProperties: false,
        },
      },
    })
  }
  return tools
}

// ---------- Snapshot do roteiro ----------

export interface Snapshot { preenchidos: Array<{ campo: Campo; valor: string }>; abertos: Campo[] }

export function snapshot(porta: Porta, state: LeadState): Snapshot {
  const preenchidos: Snapshot['preenchidos'] = []
  const abertos: Campo[] = []
  for (const key of porta.roteiro) {
    const campo = campoByKey(key)
    if (!campo) continue
    const v = state.respostas?.[key]
    if (v) preenchidos.push({ campo, valor: v })
    else if (!(state.semResposta || []).includes(key)) abertos.push(campo)
  }
  return { preenchidos, abertos }
}

export function describeOpen(porta: Porta, s: Snapshot): string {
  if (!porta.roteiro.length) return ''
  if (!s.abertos.length) return 'Roteiro COMPLETO — faça o fechamento previsto no prompt e chame finalizar_atendimento(qualificado).'
  const prox = s.abertos[0]
  const opc = prox.options ? ` (grave com uma destas opções EXATAS: ${prox.options.map(o => o.value).join(' | ')})` : ''
  return `Faltam ${s.abertos.length}. Próximo assunto do roteiro → ${prox.name}${prox.pergunta ? ` ("${prox.pergunta}")` : ''}${opc}. Se o lead já respondeu algo em aberto, grave com salvar_respostas ANTES de perguntar.`
}

// ---------- Execução ----------

function coerce(campo: Campo, raw: string, atual?: number[]): { values: KommoFieldValue['values']; texto: string } | { error: string } {
  if (campo.type === 'select' || campo.type === 'multiselect') {
    const opts = campo.options || []
    const escolhidas = campo.type === 'multiselect' ? raw.split(/\s*[,;|]\s*/) : [raw]
    const ids: number[] = []
    for (const e of escolhidas) {
      const m = matchOption(e, opts)
      if (!m) return { error: `"${e}" não é opção de "${campo.name}" — use uma destas: ${opts.map(o => o.value).join(' | ')}` }
      ids.push(m.id)
    }
    // multiselect: PATCH substitui → UNION com o que já existe (kommo §2)
    const all = campo.type === 'multiselect' ? [...new Set([...(atual || []), ...ids])] : ids
    return { values: all.map(enum_id => ({ enum_id })), texto: escolhidas.map(e => matchOption(e, opts)!.value).join(', ') }
  }
  if (campo.type === 'numeric') {
    const n = parseNumeroBR(raw)
    return n === null ? { error: `"${raw}" não é número para "${campo.name}"` } : { values: [{ value: n }], texto: String(n) }
  }
  const t = raw.trim().slice(0, campo.type === 'textarea' ? 2000 : 250)
  return t ? { values: [{ value: t }], texto: t } : { error: `valor vazio para "${campo.name}"` }
}

/** Efeitos no CRM ao finalizar. Ordem importa: primeiro desliga (tag), depois marca o estado. */
export async function aplicarFinalizacao(ctx: ToolCtx, motivo: string, resumoRaw: string, urgente = false): Promise<void> {
  const { port, porta } = ctx
  const state = await port.getState()
  const resumo = resumoRaw.trim().slice(0, 1500)
  if (CRM_MAP.finalizar.removerGate && ctx.gateTag) await port.removeTags([ctx.gateTag])
  const extras = [...CRM_MAP.finalizar.tags, ...(urgente && CRM_MAP.finalizar.tagUrgente ? [CRM_MAP.finalizar.tagUrgente] : [])]
  if (extras.length) await port.addTags(extras)
  if (CRM_MAP.finalizar.nota) {
    const linhas = snapshot(porta, state).preenchidos.map(p => `• ${p.campo.name}: ${p.valor}`)
    const quem = state.respondenteNome ? `\nQuem conversou: ${state.respondenteNome} (${state.respondenteRelacao || '—'})` : ''
    const outro = state.outroAssunto ? `\nOutro assunto citado: ${state.outroAssunto}` : ''
    await port.addNote(`🤖 IA finalizou — ${porta.label} · ${motivo}${urgente ? ' · URGENTE' : ''}\n\n${resumo}${quem}${outro}\n\n${linhas.join('\n')}`)
  }
  await port.patchState({ finalizado: { motivo, resumo, em: new Date().toISOString() } })
}

export async function runTool(ctx: ToolCtx, name: string, input: Record<string, unknown>): Promise<ToolOutcome> {
  const { port, porta } = ctx
  try {
    switch (name) {
      case 'salvar_respostas': {
        const state = await port.getState()
        const lead = await port.getLead()
        const lista = Array.isArray(input.respostas) ? input.respostas as Array<Record<string, unknown>> : []
        const writes: KommoFieldValue[] = []
        const respostas = { ...(state.respostas || {}) }
        const semResposta = new Set(state.semResposta || [])
        const salvos: string[] = []
        const erros: string[] = []
        for (const r of lista) {
          const key = String(r.campo || '')
          const campo = porta.roteiro.includes(key) ? campoByKey(key) : undefined
          if (!campo) { erros.push(`"${key}" não é do roteiro desta porta`); continue }
          const ev = String(r.evidencia || '')
          // Já respondido não se regrava (o modelo às vezes reaproveita uma frase qualquer para sobrescrever)
          if (state.respostas?.[key]) { erros.push(`${campo.name} já estava respondido (${state.respostas[key]}) — não pergunte de novo`); continue }
          const valor = String(r.valor ?? '')
          const naoSei = DISSE_NAO_SEI.test(ev)
          // "sim"/"não" curto vale quando responde exatamente a pergunta deste campo
          const respondeuPergunta = !!campo.pergunta && overlap(ctx.lastAgentText, campo.pergunta) >= 0.6 && evidenceFound(ev, ctx.lastLeadText)
          if (!evidenceFound(ev, ctx.leadText)) { erros.push(`${campo.name}: a evidência "${ev}" não aparece no que o lead escreveu — NÃO invente; pergunte`); continue }
          if (campo.sinal && !campo.sinal.test(ev) && !naoSei && !respondeuPergunta) { erros.push(`${campo.name}: a evidência "${ev}" não fala deste assunto — NÃO invente; pergunte`); continue }
          if (/n[aã]o sabe/i.test(valor) && !naoSei) { erros.push(`${campo.name}: "Não sabe" só quando o lead disser que não sabe`); continue }
          if (naoSei && campo.type !== 'select' && campo.type !== 'multiselect') {
            semResposta.add(key)
            salvos.push(`${campo.name} = (não sabe)`)
            continue
          }
          // Texto: guarda as PALAVRAS DO LEAD. Se o modelo resumiu ("Outra pessoa da família"), vale a evidência literal.
          // Texto guarda as PALAVRAS DO LEAD (a evidência literal), nunca o resumo do modelo
          const bruto = campo.type === 'text' || campo.type === 'textarea' ? ev : valor
          const c = coerce(campo, bruto, lead.fields[campo.id]?.enumIds)
          if ('error' in c) { erros.push(c.error); continue }
          respostas[key] = c.texto
          salvos.push(`${campo.name} = ${c.texto}`)
          if (campo.id > 0 && !CRM_MAP.camposProibidos.includes(campo.id)) writes.push({ field_id: campo.id, values: c.values })
        }
        if (writes.length) await port.writeFields(writes)
        const next = await port.patchState({ respostas, semResposta: [...semResposta] })
        return {
          isError: erros.length > 0 && salvos.length === 0,
          content: [salvos.length ? `Salvo: ${salvos.join(' · ')}.` : '', erros.length ? `Não salvo: ${erros.join(' · ')}.` : '', describeOpen(porta, snapshot(porta, next))].filter(Boolean).join(' '),
        }
      }

      case 'registrar_respondente': {
        const nome = String(input.nome || '').trim().slice(0, 60)
        if (!nome || !evidenceFound(nome, ctx.leadText)) return err('Nome não registrado: ele não aparece no que o lead escreveu.')
        await port.patchState({ respondenteNome: nome, respondenteRelacao: String(input.relacao || '').trim().slice(0, 60) })
        return ok(`Anotado: quem está falando é ${nome}. Chame por este nome.`)
      }

      case 'registrar_outro_assunto': {
        const citado = `${input.assunto || ''} ${input.evidencia || ''}`
        if (!evidenceFound(String(input.evidencia || ''), ctx.leadText)) return err('Não registrado: o lead não citou esse assunto.')
        // Só vale assunto de OUTRA área atendida (sinal de outra porta). Renda, saúde, dúvida do roteiro NÃO são outro assunto.
        if (!classificar(citado).some(p => p.id !== porta.id)) return err('Não registrado: isso faz parte do assunto atual, não de outra área. Responda dentro do roteiro.')
        await port.patchState({ outroAssunto: String(input.assunto || '').slice(0, 200) })
        return ok('Registrado para a equipe. Diga ao lead que a equipe também verá esse assunto e SIGA o roteiro atual.')
      }

      case 'finalizar_atendimento': {
        const motivo = String(input.motivo || '') as Motivo
        if (!MOTIVOS.includes(motivo)) return err(`Motivo inválido: ${motivo}`)
        const state = await port.getState()
        if (motivo === 'qualificado') {
          // "Não sabe" só vale se foi registrado por salvar_respostas com a fala do lead — nunca declarado na finalização
          const sem = new Set(state.semResposta || [])
          const faltando = porta.obrigatorios.filter(key => !state.respostas?.[key] && !(sem.has(key) && !campoByKey(key)?.options))
          if (faltando.length) return err(`Ainda falta: ${faltando.map(key => campoByKey(key)?.name || key).join('; ')}. ${describeOpen(porta, snapshot(porta, state))} Se o lead disse que não sabe, grave com salvar_respostas usando a fala dele como evidência.`)
        } else {
          const ev = String(input.evidencia || '')
          const sinal = SINAL_MOTIVO[motivo]
          if (!evidenceFound(ev, ctx.leadText) || (sinal && !sinal.test(ev))) {
            return err(`NÃO finalizado: a evidência "${ev}" não comprova "${motivo}" no que o lead escreveu. Continue o atendimento.`)
          }
        }
        const urgente = motivo === 'urgencia'
        await aplicarFinalizacao(ctx, motivo, String(input.resumo || ''), urgente)
        return ok(`Atendimento da IA finalizado (${motivo}). Envie a mensagem de encerramento prevista no prompt para este caso. NÃO faça perguntas e NÃO prometa contato em prazo específico.`, { handoff: true, urgente })
      }

      case 'mover_etapa': {
        const etapa = CRM_MAP.etapas.find(e => e.name === input.etapa)
        if (!etapa) return err('Etapa fora da alçada.')
        const lead = await port.getLead()
        // Fail-closed: outro funil ou etapa protegida = não mexe
        if (lead.pipelineId !== etapa.pipelineId) return err('O lead está em outro funil — não vou mover.')
        if (CRM_MAP.etapasProtegidas.includes(lead.statusId)) return err('O lead já está numa etapa da equipe — não vou mover.')
        if (lead.statusId !== etapa.id) await port.moveStage(etapa.id, etapa.pipelineId)
        return ok(`Lead em "${etapa.name}".`)
      }

      default:
        return err(`Tool desconhecida "${name}".`)
    }
  } catch (e) {
    return err(`Falha ao executar ${name}: ${e instanceof Error ? e.message : String(e)}`)
  }
}
