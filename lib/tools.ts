import type OpenAI from 'openai'
import { CRM_MAP, campoByKey, type Campo, type Porta } from './crm-map'
import { DISSE_NAO_SEI, evidenceFound, matchOption, overlap, parseNumeroBR } from './guards'
import type { KommoFieldValue } from './kommo'
import { classificar } from './router'
import type { LeadState } from './state'
import { duasOpcoes, horariosLivres, naGrade, ocupado, slotDeIso, type Slot } from './agenda'
import { analisarContracheque, type ResultadoAnalise } from './analise-contracheque'
import { extrairContracheque } from './contracheque-texto'
import { PADRAO_CODIGO, confirmacao, type Textos } from './base-core'

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
  /** Monteiro & Lins */
  createTask(typeId: number, text: string, completeTill: number): Promise<void>
  markLost(lossReasonId?: number): Promise<void>
  /** epoch (s) das reuniões já marcadas na conta */
  horariosOcupados(): Promise<number[]>
  /** reserva atômica do horário (false = outro lead acabou de pegar) */
  reservarHorario(inicio: number): Promise<boolean>
  /** cria o evento na Google Agenda; devolve o id, ou null se a agenda não está ligada */
  criarEventoAgenda(inicio: number, fim: number, titulo: string, descricao: string, local?: string): Promise<string | null>
  agoraS(): number
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
  /** textos da base vigente (Central › Ensinar); sem isso, os padrões do código */
  textos?: Partial<Textos>
}

const texto = (ctx: ToolCtx, id: 'enc_renda_abaixo' | 'enc_alivio_baixo' | 'enc_revisao' | 'enc_atendimento') => ctx.textos?.[id] ?? PADRAO_CODIGO[id]!

export interface ToolOutcome {
  content: string
  isError: boolean
  handoff?: boolean
  urgente?: boolean
  /** texto aprovado que o CÓDIGO envia ao lead, sem passar pelo modelo (desqualificação, revisão, confirmação) */
  textoFinal?: string
}

const ok = (content: string, extra: Partial<ToolOutcome> = {}): ToolOutcome => ({ content, isError: false, ...extra })
const err = (content: string): ToolOutcome => ({ content, isError: true })

export const MOTIVOS = ['advogado_ativo', 'menor_de_idade', 'urgencia', 'fora_do_escopo', 'pediu_humano', 'desistiu', 'discordou_analise'] as const
type Motivo = typeof MOTIVOS[number]

/** Sinal mínimo que a evidência precisa ter para cada motivo de finalização. */
const SINAL_MOTIVO: Partial<Record<Motivo, RegExp>> = {
  advogado_ativo: /advogad|processo|recurso|escrit[oó]rio|a[cç][aã]o/i,
  menor_de_idade: /\b(1[0-7]|[5-9])\s*anos\b|menor|col[eé]gio|escola|minha m[aã]e|meu pai/i,
  urgencia: /comida|fome|comer|rem[eé]dio|medica|despej|aluguel atrasad|na rua|intern|hospital|urgent|desesper/i,
  desistiu: /desist|n[aã]o (quero|tenho interesse|preciso) mais|deixa (pra|para) l[aá]|pode encerrar|n[aã]o quero continuar|n[aã]o vou (querer|continuar)/i,
  pediu_humano: /humano|pessoa|atendente|advogad|doutor|dra?\b|falar com|me liga|liga[cç][aã]o|reclam/i,
  discordou_analise: /n[aã]o concordo|discord|errad|n[aã]o (est[aá]|t[aá]) certo|refaz|olha de novo|confere de novo|revis|esfor[cç]o|n[aã]o pode ser/i,
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
        description: 'Encerra a participação da IA nesta conversa e passa para a equipe. Chame ANTES de escrever a mensagem de encerramento. Use quando: o lead tem advogado ativo na mesma dívida; quem escreve é menor de idade; há urgência humanitária; o assunto está fora do escopo; o lead pediu para falar com uma pessoa; desistiu; ou discorda do resultado da análise. Depois disso envie a mensagem de encerramento e NÃO faça perguntas.',
        parameters: {
          type: 'object',
          properties: {
            motivo: { type: 'string', enum: [...MOTIVOS] },
            evidencia: { type: 'string', description: 'Trecho literal do lead que justifica o motivo' },
            resumo: { type: 'string', description: '2 a 4 frases para a equipe: quem é, a situação e o que busca' },
          },
          required: ['motivo', 'evidencia', 'resumo'],
          additionalProperties: false,
        },
      },
    },
  )
  const extras = porta.ferramentas || []
  if (extras.includes('analisar_contracheque')) {
    tools.push({
      type: 'function',
      function: {
        name: 'analisar_contracheque',
        description: 'Faz a análise do contracheque que o lead mandou (a transcrição "CONTRACHEQUE | ..." já está na conversa). O cálculo e a decisão são feitos pelo sistema com a planilha do escritório. Chame assim que o contracheque legível chegar. Não precisa de parâmetros.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    })
  }
  if (extras.includes('consultar_horarios')) {
    tools.push({
      type: 'function',
      function: {
        name: 'consultar_horarios',
        description: 'Devolve as DUAS opções de horário livres para oferecer ao lead (e outras de reserva). Chame antes de oferecer horário e de novo se o lead recusar as duas.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    })
  }
  if (extras.includes('agendar_reuniao')) {
    tools.push({
      type: 'function',
      function: {
        name: 'agendar_reuniao',
        description: 'Marca a reunião no horário que o lead escolheu. Só use horário devolvido por consultar_horarios ou que o lead pediu explicitamente. A confirmação ao lead sai pelo sistema.',
        parameters: {
          type: 'object',
          properties: {
            data_hora: { type: 'string', description: 'Horário de Brasília no formato AAAA-MM-DDTHH:MM, ex.: 2026-10-16T10:00' },
            formato: { type: 'string', enum: ['online', 'presencial'] },
            evidencia: { type: 'string', description: 'Trecho literal do lead escolhendo o horário' },
          },
          required: ['data_hora', 'formato', 'evidencia'],
          additionalProperties: false,
        },
      },
    })
  }
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
  const sdr = CRM_MAP.sdr
  if (resumo) await port.writeFields([{ field_id: sdr.campos.resumo, values: [{ value: `${motivo}: ${resumo}`.slice(0, 2000) }] }])
  if (sdr.tarefas.motivosComRetorno.includes(motivo)) {
    const prazo = port.agoraS() + sdr.tarefas.horasRetorno * 3600
    await port.createTask(sdr.tarefas.tipoRetorno, `Lia: responder o lead em até ${sdr.tarefas.horasRetorno}h (${motivo}). ${resumo}`, prazo)
  }
  await port.patchState({ finalizado: { motivo, resumo, em: new Date().toISOString() } })
}

// ---------- Monteiro & Lins: funil SDR, contracheque e agenda ----------

/** Move dentro do Funil/SDR, fail-closed: outro funil ou etapa fora da alçada = não mexe. */
export async function moverSdr(port: LeadPort, alvo: number): Promise<boolean> {
  const lead = await port.getLead()
  if (lead.pipelineId !== CRM_MAP.sdr.pipelineId) return false
  if (!CRM_MAP.sdr.etapasDaIA.includes(lead.statusId)) return false
  if (lead.statusId !== alvo) await port.moveStage(alvo, CRM_MAP.sdr.pipelineId)
  return true
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (n: number) => `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const listaSlots = (ss: Slot[]) => ss.map(x => `${x.rotulo} [${x.iso}]`).join(' · ')

async function analisar(ctx: ToolCtx): Promise<ToolOutcome> {
  const { port } = ctx
  const sdr = CRM_MAP.sdr
  const lido = extrairContracheque(ctx.leadText)
  if (!lido || !lido.rubricas.length) return err('Ainda não há contracheque legível na conversa. Peça ao lead uma foto ou PDF do contracheque mais recente, inteiro e legível.')
  if (/n[aã]o/.test(lido.legivel) || !lido.rubricas.some(r => r.tipo === 'P')) return err('O contracheque veio ilegível ou cortado (sem os proventos). Peça ao lead outra foto, com o documento inteiro e bem iluminado.')

  const assinatura = `${lido.competencia}|${lido.rubricas.map(r => `${r.descricao}:${r.valor}`).join(';')}`
  const state = await port.getState()
  if (state.analise?.assinatura === assinatura) {
    return ok(`Este contracheque já foi analisado: ${state.analise.decisao}, comprometimento ${pct(state.analise.comprometimento)}, redução estimada ${brl(state.analise.reducaoMensal)}/mês. Siga o roteiro a partir daí.`)
  }

  let r: ResultadoAnalise = analisarContracheque(lido.rubricas)
  // Valor ilegível pode virar o jogo: só desqualifica com o documento todo lido
  if (lido.ilegiveis.length && r.decisao !== 'qualificado' && r.decisao !== 'revisao_humana') {
    r = { ...r, decisao: 'revisao_humana', motivo: `valores ilegíveis: ${lido.ilegiveis.join(', ')}` }
  }

  await port.patchState({ analise: { decisao: r.decisao, comprometimento: r.totais.comprometimento, reducaoMensal: r.reducaoMensal, competencia: lido.competencia, assinatura, em: new Date().toISOString() } })
  await port.addNote(`🤖 Lia · análise do contracheque ${lido.orgao} ${lido.competencia}\n${r.observacao}${lido.ilegiveis.length ? `\nIlegíveis: ${lido.ilegiveis.join(', ')}` : ''}`)
  const corp = sdr.corporacaoPorOrgao.find(c => c.re.test(lido.orgao))
  if (corp) await port.writeFields([{ field_id: sdr.campos.corporacao, values: [{ enum_id: corp.enumId }] }])

  const resumo = `Análise: ${r.decisao} (${r.motivo}). Comprometimento ${pct(r.totais.comprometimento)}, redução estimada ${brl(r.reducaoMensal)}/mês.`
  switch (r.decisao) {
    case 'qualificado': {
      await moverSdr(port, sdr.etapas.qualificado)
      // Os horários já vão junto: o modelo às vezes perguntava "posso passar os horários?" e gastava um turno do lead
      const agenda = await consultarHorarios(ctx).catch(e => agendaIndisponivel(ctx, e))
      if (agenda.handoff) return ok(`QUALIFICADO. Comprometimento ${pct(r.totais.comprometimento)}, redução mensal estimada ${brl(r.reducaoMensal)}. Mostre esses dois números com "pode baixar cerca de". ${agenda.content}`, { handoff: true })
      return ok(`QUALIFICADO. Comprometimento da renda líquida com consignado: ${pct(r.totais.comprometimento)}. Redução mensal estimada (teto de 40%): ${brl(r.reducaoMensal)}. Na MESMA mensagem: mostre esses dois números com "pode baixar cerca de", diga que o próximo passo é a conversa com o advogado e já ofereça os dois horários abaixo, perguntando qual o lead prefere. ${agenda.content}`)
    }
    case 'renda_abaixo':
    case 'alivio_baixo': {
      await port.addTags([sdr.desqualificacao.tag])
      await aplicarFinalizacao(ctx, r.decisao, resumo)
      if (sdr.desqualificacao.moverParaPerdido) {
        const lead = await port.getLead()
        if (lead.pipelineId === sdr.pipelineId && sdr.etapasDaIA.includes(lead.statusId)) await port.markLost(sdr.desqualificacao.motivoPerda[r.decisao])
      }
      return ok(`Desqualificado (${r.decisao}). A mensagem aprovada já sai pelo sistema.`, { handoff: true, textoFinal: texto(ctx, r.decisao === 'renda_abaixo' ? 'enc_renda_abaixo' : 'enc_alivio_baixo') })
    }
    default:
      await moverSdr(port, sdr.etapas.revisao)
      await aplicarFinalizacao(ctx, 'revisao_humana', resumo)
      return ok('Revisão humana. A mensagem aprovada já sai pelo sistema.', { handoff: true, textoFinal: texto(ctx, 'enc_revisao') })
  }
}

/** Agenda fora do ar (Kommo ou Google): a Lia não chuta horário, a equipe propõe em até 24h. */
async function agendaIndisponivel(ctx: ToolCtx, e: unknown): Promise<ToolOutcome> {
  await ctx.port.addNote(`⚠️ Lia não conseguiu ler a agenda: ${e instanceof Error ? e.message : String(e)}`)
  await aplicarFinalizacao(ctx, 'agenda_indisponivel', 'Lead qualificado; a agenda não respondeu. Propor horário ao lead.')
  return ok('A agenda não respondeu agora. Diga que a equipe vai propor o horário da reunião por aqui em até 24 horas. Não ofereça horário e não faça pergunta.', { handoff: true })
}

async function consultarHorarios(ctx: ToolCtx): Promise<ToolOutcome> {
  const { port } = ctx
  const cfg = CRM_MAP.agenda
  const state = await port.getState()
  if (state.analise?.decisao !== 'qualificado') return err('Só ofereça horário depois que analisar_contracheque devolver QUALIFICADO.')
  const livres = horariosLivres(port.agoraS(), await port.horariosOcupados(), cfg)
  const ofertados = state.ofertados || []
  let opcoes = duasOpcoes(livres, cfg, ofertados)
  if (!opcoes.length) opcoes = duasOpcoes(livres, cfg)
  if (!opcoes.length) return err('Não há horário livre nos próximos dias. Diga que a equipe vai propor um horário e chame finalizar_atendimento(pediu_humano) com a fala do lead como evidência.')
  await port.patchState({ ofertados: [...new Set([...ofertados, ...opcoes.map(o => o.inicio)])] })
  const reserva = livres.filter(l => !opcoes.some(o => o.inicio === l.inicio)).slice(0, 6)
  return ok(`Ofereça exatamente estas duas opções: ${listaSlots(opcoes)}. Outras livres, só se o lead pedir dia ou turno diferente: ${listaSlots(reserva) || 'nenhuma'}. Dias de reunião: quinta o dia todo, terça e quarta só à tarde.`)
}

async function agendar(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolOutcome> {
  const { port } = ctx
  const cfg = CRM_MAP.agenda
  const sdr = CRM_MAP.sdr
  const state = await port.getState()
  if (state.analise?.decisao !== 'qualificado') return err('Só agende depois que analisar_contracheque devolver QUALIFICADO.')
  if (!evidenceFound(String(input.evidencia || ''), ctx.lastLeadText)) return err('O lead ainda não escolheu um horário nesta mensagem. Ofereça as opções e espere a resposta.')
  const slot = slotDeIso(String(input.data_hora || ''), cfg)
  if (!slot) return err('data_hora inválida. Use AAAA-MM-DDTHH:MM, horário de Brasília.')
  if (!naGrade(slot, cfg)) return err(`${slot.rotulo} não está na agenda (quinta o dia todo, terça e quarta só à tarde). Chame consultar_horarios e ofereça as opções válidas.`)
  if (slot.inicio < port.agoraS() + 3600) return err('Esse horário já passou ou é muito em cima. Ofereça outro com consultar_horarios.')
  if (ocupado(slot, await port.horariosOcupados(), cfg) || !(await port.reservarHorario(slot.inicio))) {
    return err(`${slot.rotulo} acabou de ser ocupado. Peça desculpas e chame consultar_horarios para oferecer outros.`)
  }
  const formato = input.formato === 'presencial' ? 'presencial' : 'online'
  const onde = formato === 'presencial' ? `presencial na ${sdr.endereco}` : 'por videochamada aqui no WhatsApp'
  await port.writeFields([{ field_id: sdr.campos.agendamento, values: [{ value: slot.inicio }] }])
  // Google Agenda: falha aqui NÃO desfaz o agendamento (o Kommo já tem campo + tarefa); fica registrada no card
  try {
    const lead = await port.getLead()
    const id = await port.criarEventoAgenda(
      slot.inicio, slot.inicio + cfg.duracaoMin * 60,
      `Reunião ${formato} · lead ${lead.id} (Lia)`,
      `Marcada pela Lia no WhatsApp.\nComprometimento ${pct(state.analise.comprometimento)} · redução estimada ${brl(state.analise.reducaoMensal)}/mês.\nLead no Kommo: ${lead.id}`,
      formato === 'presencial' ? sdr.endereco : 'Videochamada pelo WhatsApp',
    )
    if (id) await port.addNote(`🗓️ Evento criado na Google Agenda: ${slot.rotulo} (${formato}).`)
  } catch (e) {
    await port.addNote(`⚠️ Lia marcou ${slot.rotulo}, mas NÃO conseguiu criar o evento na Google Agenda: ${e instanceof Error ? e.message : String(e)}. Criar à mão.`)
  }
  await port.createTask(sdr.tarefas.tipoAgendamento, `Reunião ${formato} marcada pela Lia: ${slot.rotulo}. Análise: comprometimento ${pct(state.analise.comprometimento)}, redução estimada ${brl(state.analise.reducaoMensal)}/mês.`, slot.inicio)
  await moverSdr(port, sdr.etapas.agendada)
  await aplicarFinalizacao(ctx, 'agendou', `Reunião ${formato} em ${slot.rotulo}.`)
  return ok(`Reunião marcada: ${slot.rotulo}, ${formato}. A confirmação já sai pelo sistema.`, { handoff: true, textoFinal: confirmacao(ctx.textos || {}, slot.rotulo, onde) })
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
        const ev = String(input.evidencia || '')
        const sinal = SINAL_MOTIVO[motivo]
        if (!evidenceFound(ev, ctx.leadText) || (sinal && !sinal.test(ev))) {
          return err(`NÃO finalizado: a evidência "${ev}" não comprova "${motivo}" no que o lead escreveu. Continue o atendimento.`)
        }
        const urgente = motivo === 'urgencia'
        await aplicarFinalizacao(ctx, motivo, String(input.resumo || ''), urgente)
        const comRetorno = CRM_MAP.sdr.tarefas.motivosComRetorno.includes(motivo)
        return ok(`Atendimento da IA finalizado (${motivo}). Envie a mensagem de encerramento prevista no prompt para este caso. NÃO faça perguntas.${comRetorno ? ' A equipe responde em até 24 horas: diga isso ao lead.' : ' NÃO prometa contato em prazo específico.'}`, { handoff: true, urgente })
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

      case 'analisar_contracheque': return await analisar(ctx)
      case 'consultar_horarios': return await consultarHorarios(ctx).catch(e => agendaIndisponivel(ctx, e))
      case 'agendar_reuniao': return await agendar(ctx, input).catch(e => agendaIndisponivel(ctx, e))

      default:
        return err(`Tool desconhecida "${name}".`)
    }
  } catch (e) {
    return err(`Falha ao executar ${name}: ${e instanceof Error ? e.message : String(e)}`)
  }
}
