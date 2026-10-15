/**
 * Contrato de dados Agente → Central. ESPELHO de ../lib/central-data.ts
 * (o agente é a fonte). Mudou lá, mude aqui.
 */

export type Marco = 'agendou' | 'desqualificou' | 'revisao' | 'passou'
export type Perfil = 'cliente' | 'nao_cliente'

export interface Execution {
  ts: string
  contactId: string
  nome: string
  tipo: 'resposta' | 'menu' | 'finalizou' | 'pulou' | 'erro' | 'reset'
  resultado: 'respondeu' | 'erro' | 'pulou'
  detalhe: string
  duracaoMs: number
  tools: string[]
  travas: string[]
  midia?: { audios: number; imagens: number; documentos: number }
  turnoLead?: string
  respostaIA?: string
  marco?: Marco
  motivo?: string
  /** decisão da análise do contracheque nesta execução */
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
  atendidos: number
  /** clientes do escritório (perguntaram do processo) */
  clientes: number
  /** leads novos */
  naoClientes: number
  analisados: number
  qualificados: number
  agendados: number
  desqualificados: number
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

export interface FunilEtapa {
  id: string
  label: string
  n: number
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

// ---------- Base de dados (espelho de ../api/base.ts e ../lib/exame.ts) ----------

export interface BaseItem {
  id: string
  grupo: string
  titulo: string
  ajuda: string
  padrao: string
  noAr: string
  rascunho: string | null
  problemas: string[]
}

export interface Exame {
  id: string
  status: 'rodando' | 'aprovado' | 'reprovado' | 'erro'
  inicio: string
  fim?: string
  nota: string
  mudancas: string[]
  feitos: number
  total: number
  custoUsd?: number
  versao?: number
  falhas?: Array<{ cenario: string; motivos: string[]; conversa: Array<{ lead: string; resposta: string }> }>
  instaveis?: string[]
  erro?: string
}

export interface MudancaBase { tipo: 'trocar' | 'nova' | 'remover'; id: string; titulo: string; antes: string; depois: string }

export interface MsgConversa {
  id: string
  ts: string
  papel: 'equipe' | 'ia'
  texto: string
  origem?: 'base' | 'teste' | 'real'
  correcao?: { fonte?: 'teste' | 'real'; sessao?: string; mensagemId?: string; contato?: string; nome?: string; ts?: string; lead: string; resposta: string; comoDeveria: string; porque: string }
  analise?: { comoDeveria: string; porque: string }
  destino?: 'base' | 'nova_informacao' | 'control_gestao' | 'recusado' | 'pergunta' | 'nenhum'
  mudancas?: MudancaBase[]
  desfeita?: boolean
  custoUsd?: number | null
  /** arquivos e links do pedido, como a IA leu (o arquivo não fica guardado) */
  anexos?: Array<{ nome: string; origem: 'arquivo' | 'link'; tipo: string; caracteres: number; url?: string; erro?: string }>
}

export interface BaseEstado {
  conversa: MsgConversa[]
  pedidosControlGestao: number
  versao: number
  publicadoEm: string | null
  nota: string | null
  rascunhoEm: string | null
  grupos: Record<string, string>
  itens: BaseItem[]
  alteracoes: string[]
  historico: Array<{ versao: number; publicadoEm: string | null; nota: string | null; mudancas: string[] }>
  exame: Exame | null
}

// ---------- Laboratório (espelho de ../lib/teste.ts) ----------

export interface TesteOpcoes { perfil: 'novo' | 'cliente'; versao: 'vigente' | 'rascunho' }

export interface TesteSessao {
  id: string
  criadoEm: string
  opcoes: TesteOpcoes
  history: Array<{ id: string; dir: 'in' | 'out'; text: string; ts: number }>
  mundo: {
    statusId: number
    tags: string[]
    notes: string[]
    tasks: Array<{ typeId: number; text: string; completeTill: number }>
    ocupados: number[]
    state: { analise?: { decisao: string; comprometimento: number; reducaoMensal: number }; finalizado?: { motivo: string; em: string; resumo: string } }
  }
  detalhes: Record<string, { tools: string[]; log: string[]; guard: string[]; ms: number; custoUsd: number; handoff: boolean }>
  turnos: number
  custoUsd: number
}

export interface TesteUso { mensagens: number; custoUsd: number; limite: number; usdBrl: number }

// ---------- Conversas reais para correção (espelho de ../lib/conversas-reais.ts) ----------

export interface ConversaResumo { contato: string; nome: string; ultima: string; respostas: number; previa: string; passou?: string; perfil?: 'cliente' | 'nao_cliente' }

export interface TurnoReal { ts: string; tipo: 'resposta' | 'finalizou'; cliente: string; resposta: string; tools: string[]; travas: string[]; motivo?: string }
