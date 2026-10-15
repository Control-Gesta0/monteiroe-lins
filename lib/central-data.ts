import type { ExecEntry } from './execlog'

/**
 * Contrato de dados da Central v5 (painel) · Lia / Monteiro & Lins.
 * Tudo calculado em CÓDIGO a partir do diário de execuções e do Kommo: zero
 * tokens, nenhum número inventado. Arquivo puro (sem env) para rodar em `npm test`.
 * O espelho na Central é central/lib/types.ts: mudou aqui, mude lá.
 */

/** O que a execução produziu. */
export type Marco = 'agendou' | 'desqualificou' | 'revisao' | 'passou'
/** cliente: já é cliente do escritório (porta atendimento) · nao_cliente: lead novo (análise do contracheque) */
export type Perfil = 'cliente' | 'nao_cliente'

/** Passagens para a equipe (finalizações que pedem uma pessoa). */
export const MOTIVOS: Record<string, { rotulo: string; urgente?: boolean }> = {
  porta_sem_agente: { rotulo: 'Cliente do escritório' },
  revisao_humana: { rotulo: 'Contracheque para conferir' },
  pediu_humano: { rotulo: 'Pediu uma pessoa' },
  fora_do_escopo: { rotulo: 'Outro assunto' },
  discordou_analise: { rotulo: 'Discordou da análise' },
  agenda_indisponivel: { rotulo: 'Agenda não respondeu' },
  advogado_ativo: { rotulo: 'Já tem advogado' },
  urgencia: { rotulo: 'Urgência', urgente: true },
  menor_de_idade: { rotulo: 'Menor de idade' },
  desistiu: { rotulo: 'Desistiu' },
  outro: { rotulo: 'Outro' },
}
export const rotuloMotivo = (m?: string) => MOTIVOS[m || 'outro']?.rotulo || m || 'Outro'

/** Finalizações que NÃO passam para a equipe (a Lia resolveu sozinha). */
const DESQUALIFICOU = ['renda_abaixo', 'alivio_baixo']

export interface Execution {
  ts: string
  contactId: string
  nome: string
  tipo: ExecEntry['tipo']
  resultado: 'respondeu' | 'erro' | 'pulou'
  detalhe: string
  duracaoMs: number
  tools: string[]
  travas: string[]
  midia?: ExecEntry['midia']
  turnoLead?: string
  respostaIA?: string
  marco?: Marco
  /** passagem: o motivo · desqualificação: renda_abaixo/alivio_baixo · agendou */
  motivo?: string
  /** quando o contracheque foi analisado nesta execução */
  decisao?: string
  perfil?: Perfil
  custo?: {
    totalBrl: number
    modeloUsd: number
    usdBrl: number
    tokens: { input: number; cached: number; output: number; chamadas: number }
  }
}

export interface Marcos {
  /** contatos que receberam resposta da Lia */
  atendidos: number
  /** clientes do escritório (perguntaram do processo) */
  clientes: number
  /** leads novos */
  naoClientes: number
  /** contracheques analisados (qualquer decisão) */
  analisados: number
  /** passaram na regra da planilha */
  qualificados: number
  /** reunião marcada pela Lia */
  agendados: number
  /** renda abaixo ou alívio baixo: mensagem honesta, sem equipe */
  desqualificados: number
  /** passados para a equipe (inclui contracheque para conferir) */
  passagens: number
}

export interface MotivoN { motivo: string; rotulo: string; n: number }

export interface Passagem {
  ts: string
  contactId: string
  nome: string
  motivo: string
  rotulo: string
  perfil?: Perfil
  resumo: string
  urgente: boolean
  link: string
}

export interface Financial {
  hoje: number
  seteDias: number
  trintaDias: number
  totalRegistrado: number
  execucoesComCusto: number
  execucoesSemCusto: number
  medioPorExecucao: number
  porDia: Array<{ data: string; custo: number; execucoes: number }>
  usdBrl: number
  observacao: string
}

export interface ExecutionData {
  execucoes: Execution[]
  saude24h: { total: number; respondeu: number; erros: number; pulou: number }
  marcos: { hoje: Marcos; seteDias: Marcos; trintaDias: Marcos }
  motivos: { hoje: MotivoN[]; seteDias: MotivoN[]; trintaDias: MotivoN[] }
  passagens: Passagem[]
  financeiro: Financial
  cobertura: { desde: string | null; registros: number }
  modelo: string
}

const DIA = 86400_000
const FALOU: Array<ExecEntry['tipo']> = ['resposta', 'finalizou']

/** Data (AAAA-MM-DD) no fuso de São Paulo. */
export function diaSP(iso: string | number | Date): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export function marcoDe(e: Pick<ExecEntry, 'tipo' | 'motivo'>): Marco | undefined {
  if (e.tipo !== 'finalizou') return undefined
  if (e.motivo === 'agendou') return 'agendou'
  if (DESQUALIFICOU.includes(e.motivo || '')) return 'desqualificou'
  if (e.motivo === 'revisao_humana') return 'revisao'
  return 'passou'
}

export function linkLead(dominio: string, leadId: string): string {
  return dominio ? `${dominio.replace(/\/+$/, '')}/leads/detail/${leadId}` : ''
}

export function toExecution(e: ExecEntry, usdBrl: number): Execution {
  const resultado: Execution['resultado'] = e.tipo === 'erro' ? 'erro' : e.tipo === 'pulou' ? 'pulou' : 'respondeu'
  const custoUsd = typeof e.custoUsd === 'number' ? e.custoUsd : null
  return {
    ts: e.at,
    contactId: String(e.leadId),
    nome: e.nome || 'Contato',
    tipo: e.tipo,
    resultado,
    detalhe: e.detalhe || '',
    duracaoMs: e.ms || 0,
    tools: e.tools || [],
    travas: e.guard || [],
    midia: e.midia,
    turnoLead: e.turnoLead,
    respostaIA: e.respostaIA,
    marco: marcoDe(e),
    motivo: e.motivo,
    decisao: e.decisao,
    perfil: e.perfil,
    custo: custoUsd !== null && e.usage
      ? {
          totalBrl: round(custoUsd * usdBrl, 5),
          modeloUsd: custoUsd,
          usdBrl,
          tokens: { input: e.usage.input, cached: e.usage.cached, output: e.usage.output, chamadas: e.usage.calls },
        }
      : undefined,
  }
}

/** Contatos únicos por marco (quem repete a ação conta uma vez). Reset de teste não conta. */
export function contarMarcos(execs: Execution[]): Marcos {
  const contatos = (f: (e: Execution) => boolean) => new Set(execs.filter(f).map(e => e.contactId)).size
  const perfil = new Map<string, Perfil>()
  for (const e of execs) if (e.perfil && !perfil.has(e.contactId)) perfil.set(e.contactId, e.perfil)
  const perfis = [...perfil.values()]
  return {
    atendidos: contatos(e => FALOU.includes(e.tipo)),
    clientes: perfis.filter(p => p === 'cliente').length,
    naoClientes: perfis.filter(p => p === 'nao_cliente').length,
    analisados: contatos(e => !!e.decisao),
    qualificados: contatos(e => e.decisao === 'qualificado'),
    agendados: contatos(e => e.marco === 'agendou'),
    desqualificados: contatos(e => e.marco === 'desqualificou'),
    passagens: contatos(e => e.marco === 'passou' || e.marco === 'revisao'),
  }
}

/** Passagens por motivo: cada par contato + motivo conta uma vez. */
export function contarMotivos(execs: Execution[]): MotivoN[] {
  const pares = new Set<string>()
  const n = new Map<string, number>()
  for (const e of execs) {
    if (e.marco !== 'passou' && e.marco !== 'revisao') continue
    const m = e.motivo || 'outro'
    if (pares.has(`${e.contactId}|${m}`)) continue
    pares.add(`${e.contactId}|${m}`)
    n.set(m, (n.get(m) || 0) + 1)
  }
  return [...n.entries()].map(([motivo, total]) => ({ motivo, rotulo: rotuloMotivo(motivo), n: total })).sort((a, b) => b.n - a.n)
}

export function buildExecutionData(entries: ExecEntry[], usdBrl: number, modelo: string, now = Date.now(), dominio = ''): ExecutionData {
  const execs = entries.map(e => toExecution(e, usdBrl)).sort((a, b) => b.ts.localeCompare(a.ts))
  const reais = execs.filter(e => e.tipo !== 'reset')
  const desde = (ms: number) => reais.filter(e => now - Date.parse(e.ts) <= ms)
  const hojeSP = diaSP(now)
  const deHoje = reais.filter(e => diaSP(e.ts) === hojeSP)
  const h24 = execs.filter(e => now - Date.parse(e.ts) <= DIA)
  const soma = (xs: Execution[]) => round(xs.reduce((s, e) => s + (e.custo?.totalBrl || 0), 0), 4)
  const comCusto = execs.filter(e => e.custo)
  const semCusto = execs.filter(e => !e.custo && FALOU.includes(e.tipo) && e.motivo !== 'porta_sem_agente')

  const porDia = Array.from({ length: 14 }, (_, i) => {
    const data = diaSP(now - (13 - i) * DIA)
    const doDia = execs.filter(e => diaSP(e.ts) === data && e.resultado !== 'pulou')
    return { data, custo: soma(doDia), execucoes: doDia.length }
  })

  return {
    execucoes: execs.slice(0, 200),
    saude24h: {
      total: h24.filter(e => e.resultado !== 'pulou').length,
      respondeu: h24.filter(e => e.resultado === 'respondeu').length,
      erros: h24.filter(e => e.resultado === 'erro').length,
      pulou: h24.filter(e => e.resultado === 'pulou').length,
    },
    marcos: { hoje: contarMarcos(deHoje), seteDias: contarMarcos(desde(7 * DIA)), trintaDias: contarMarcos(desde(30 * DIA)) },
    motivos: { hoje: contarMotivos(deHoje), seteDias: contarMotivos(desde(7 * DIA)), trintaDias: contarMotivos(desde(30 * DIA)) },
    passagens: execs.filter(e => e.marco === 'passou' || e.marco === 'revisao').slice(0, 60).map(e => {
      const motivo = e.motivo || 'outro'
      return {
        ts: e.ts, contactId: e.contactId, nome: e.nome, motivo, rotulo: rotuloMotivo(motivo), perfil: e.perfil,
        resumo: e.detalhe.replace(/ · salesbot\/run disparado$/, '').slice(0, 600), urgente: !!MOTIVOS[motivo]?.urgente, link: linkLead(dominio, e.contactId),
      }
    }),
    financeiro: {
      hoje: soma(execs.filter(e => diaSP(e.ts) === hojeSP)),
      seteDias: soma(execs.filter(e => now - Date.parse(e.ts) <= 7 * DIA)),
      trintaDias: soma(execs.filter(e => now - Date.parse(e.ts) <= 30 * DIA)),
      totalRegistrado: soma(execs),
      execucoesComCusto: comCusto.length,
      execucoesSemCusto: semCusto.length,
      medioPorExecucao: comCusto.length ? round(soma(comCusto) / comCusto.length, 5) : 0,
      porDia,
      usdBrl,
      observacao: `Custo do modelo de linguagem convertido a US$ 1 = R$ ${usdBrl.toFixed(2).replace('.', ',')}. Leitura do contracheque (imagem/PDF), transcrição de áudio e infraestrutura não entram nesta conta.`,
    },
    cobertura: { desde: execs.length ? execs[execs.length - 1].ts : null, registros: execs.length },
    modelo,
  }
}

// ---------- Funil (Kommo, só leitura) ----------

export interface KommoEtapa { id: number; name: string; sort: number }

export interface KommoLeadResumo {
  id: number
  name?: string
  price?: number
  status_id: number
  updated_at?: number
  created_at?: number
  _embedded?: { tags?: Array<{ name: string }> }
}

export interface FunilEtapa {
  id: string
  label: string
  /** leads na etapa */
  n: number
  /** a Lia move leads para esta etapa? */
  ia: boolean
  valor: number
  parados: number
  amostras: Array<{ id: string; nome: string; valor: number; diasParado: number }>
}

export interface LiveData {
  geradoEm: string
  conversas: Array<{ id: string; nome: string; ultimaMsg: string; minutosAtras: number; estado: 'ia' | 'humano' | 'fora' }>
  grupos: { iaAtendendo: number; comHumano: number; foraDaIA: number }
  conversas24h: number
  respostaMedianaSegundos: number | null
  pipeline: { nome: string }
  funil: FunilEtapa[]
  leads: { total: number; abertas: number; ganhas: number; perdidas: number; comIA: number; tagsDisponiveis: boolean }
  regras: { modoGate: string; gateTag: string; humanTag: string; expediente: string }
  saude: { crmOk: boolean; problemas: string[] }
}

const GANHO = 142
const PERDIDO = 143

/** Funil a partir das etapas e dos leads do Funil/SDR. "Parado" = sem atualização há 7 dias ou mais. */
export function buildFunil(etapas: KommoEtapa[], leads: KommoLeadResumo[], gateTag: string, etapasDaIA: number[], now = Date.now()): Pick<LiveData, 'funil' | 'leads'> {
  const funil: FunilEtapa[] = [...etapas].filter(s => s.id !== GANHO && s.id !== PERDIDO).sort((a, b) => a.sort - b.sort).map(s => ({
    id: String(s.id), label: s.name, n: 0, ia: etapasDaIA.includes(s.id), valor: 0, parados: 0, amostras: [],
  }))
  const resumo = { total: leads.length, abertas: 0, ganhas: 0, perdidas: 0, comIA: 0, tagsDisponiveis: true }
  for (const l of leads) {
    const tags = (l._embedded?.tags || []).map(t => t.name.toLowerCase())
    if (gateTag && tags.includes(gateTag)) resumo.comIA++
    if (l.status_id === GANHO) { resumo.ganhas++; continue }
    if (l.status_id === PERDIDO) { resumo.perdidas++; continue }
    const etapa = funil.find(f => f.id === String(l.status_id))
    if (!etapa) continue
    resumo.abertas++
    const valor = Number(l.price || 0)
    etapa.n++
    etapa.valor += valor
    const ref = (l.updated_at || l.created_at || now / 1000) * 1000
    const d = Math.floor((now - ref) / DIA)
    if (d >= 7) {
      etapa.parados++
      if (etapa.amostras.length < 4) etapa.amostras.push({ id: String(l.id), nome: l.name || 'Lead', valor, diasParado: d })
    }
  }
  return { funil, leads: resumo }
}

/** Conversas das últimas 24h e o estado atual de cada contato, a partir do diário. */
export function buildConversas(execs: Execution[], now = Date.now()): Pick<LiveData, 'conversas' | 'grupos' | 'conversas24h' | 'respostaMedianaSegundos'> {
  const h24 = execs.filter(e => now - Date.parse(e.ts) <= DIA)
  const ultimas = new Map<string, Execution>()
  for (const e of h24) if (!ultimas.has(e.contactId)) ultimas.set(e.contactId, e)
  const conversas = [...ultimas.values()].map(e => {
    const estado: 'ia' | 'humano' | 'fora' =
      e.marco === 'passou' || e.marco === 'revisao' || (e.resultado === 'pulou' && /humano/i.test(e.detalhe)) ? 'humano'
      : e.resultado === 'pulou' || e.marco === 'agendou' || e.marco === 'desqualificou' ? 'fora' : 'ia'
    return {
      id: e.contactId,
      nome: e.nome,
      ultimaMsg: e.tipo === 'reset' ? `Reset de teste: ${e.detalhe}` : e.respostaIA || e.turnoLead || e.detalhe,
      minutosAtras: Math.max(0, Math.round((now - Date.parse(e.ts)) / 60000)),
      estado,
    }
  })
  const tempos = h24.filter(e => FALOU.includes(e.tipo) && e.duracaoMs > 0).map(e => e.duracaoMs).sort((a, b) => a - b)
  const mediana = tempos.length ? tempos[Math.floor(tempos.length / 2)] / 1000 : null
  return {
    conversas: conversas.slice(0, 40),
    grupos: {
      iaAtendendo: conversas.filter(c => c.estado === 'ia').length,
      comHumano: conversas.filter(c => c.estado === 'humano').length,
      foraDaIA: conversas.filter(c => c.estado === 'fora').length,
    },
    conversas24h: new Set(h24.filter(e => FALOU.includes(e.tipo)).map(e => e.contactId)).size,
    respostaMedianaSegundos: mediana === null ? null : round(mediana, 1),
  }
}

function round(n: number, casas: number): number {
  const f = 10 ** casas
  return Math.round(n * f) / f
}
