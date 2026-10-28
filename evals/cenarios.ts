/**
 * CENÁRIOS DA LIA (patch). Rodar com a chave da OpenAI: EVAL_REPS=3 npm run evals
 * Todos aprovados nas 3 repetições ou o prompt não sobe.
 */
import type { Cenario, World } from '../lib/evals-runner'
import { PADRAO_CODIGO, trouxeTexto, type Textos } from '../lib/base-core'
import { CRM_MAP } from '../lib/crm-map'

type T = Array<{ resposta: string; tools: string[]; handoff: boolean; guard: string[] }>
const umaPergunta = { nome: 'no máximo 1 pergunta por resposta', fn: (_w: World, t: T) => t.every(x => (x.resposta.match(/\?/g) || []).length <= 1) }
const ABERTURA_ENCENADA = /^(ótima pergunta|excelente pergunta|perfeito!|bora lá|deixa eu te explicar|claro!|com certeza!)/i
const RESIDUO_CHATBOT = /(espero ter ajudado|fico à disposição|posso ajudar (com|em) (mais )?(alguma|algo)|qualquer dúvida,? (é só|estou))/i
const tomHumano = { nome: 'tom humano: sem travessão, abertura encenada ou resíduo de chatbot', fn: (_w: World, t: T) => t.every(x => !/[—–]/.test(x.resposta) && !ABERTURA_ENCENADA.test(x.resposta.trim()) && !RESIDUO_CHATBOT.test(x.resposta)) }
const semFallback = { nome: 'nenhuma resposta caiu no texto de segurança', fn: (_w: World, t: T) => t.every(x => !x.guard.includes('fallback')) }
const usou = (tool: string) => ({ nome: `chamou ${tool}`, fn: (_w: World, t: T) => t.some(x => x.tools.includes(tool)) })
const naoUsou = (tool: string) => ({ nome: `NÃO chamou ${tool}`, fn: (_w: World, t: T) => !t.some(x => x.tools.includes(tool)) })
const comDiaDaSemana = { nome: 'todo horário oferecido traz o dia da semana', fn: (_w: World, t: T) => t.every(x => !/\d{2}\/\d{2}/.test(x.resposta) || /(terça|quarta|quinta) \(\d{2}\/\d{2}\)/.test(x.resposta)) }
const semValor = { nome: 'não cita valor em R$', fn: (_w: World, t: T) => t.every(x => !/R\$\s?\d/.test(x.resposta)) }

const CONTRACHEQUE_QUALIFICA = [
  '[imagem do lead]: CONTRACHEQUE | PMERJ | 09/2026 | sim',
  'RUBRICA | 001 | SOLDO | P | 6.200,00',
  'RUBRICA | 010 | GRAT HABILITACAO | P | 5.400,00',
  'RUBRICA | 300 | IMP RENDA RETIDO | D | 1.850,33',
  'RUBRICA | 310 | CONTRIB MILIT RIOPREV | D | 1.276,00',
  'RUBRICA | 320 | FUNDO SAUDE PM | D | 210,50',
  'RUBRICA | 501 | EMPREST BRADESCO | D | 2.500,00',
  'RUBRICA | 502 | CONSIG ITAU | D | 2.010,90',
  'RUBRICA | 503 | CARTAO RMC BMG | D | 412,20',
].join('\n')
const CONTRACHEQUE_RENDA_BAIXA = [
  '[imagem do lead]: CONTRACHEQUE | PMERJ | 09/2026 | sim',
  'RUBRICA | 001 | SOLDO | P | 5.200,00',
  'RUBRICA | 010 | ADIC TEMPO SERV | P | 1.800,00',
  'RUBRICA | 300 | IMP RENDA | D | 600,00',
  'RUBRICA | 501 | EMP CONSIG SANTANDER | D | 2.600,00',
].join('\n')
const ABERTURA = 'Boa tarde! Aqui é a Lia, assistente virtual do escritório Monteiro & Lins, especializado em direito bancário. Para que possamos fazer a sua análise, pedimos a gentileza de mandar uma foto ou PDF do seu último contracheque, com a página inteira. A análise é gratuita.'
const QUALIFICADO = { analise: { decisao: 'qualificado', comprometimento: 0.5958, reducaoMensal: 1617.83, competencia: '09/2026', assinatura: 'x', em: '2026-10-14' } }

/** Cenários com os textos da versão candidata (o exame do Publicar passa os do rascunho). */
export function cenarios(textos: Partial<Textos> = {}): Cenario[] {
  const t = { ...PADRAO_CODIGO, ...textos } as Textos
  return [
  {
    id: 'abertura',
    porta: 'superendividamento',
    nomeContato: 'João Silva',
    msgs: ['oi, vi o anúncio sobre o consignado'],
    checks: [umaPergunta, semFallback, tomHumano],
    criterios: [
      'Se apresenta como Lia, assistente virtual do escritório Monteiro & Lins',
      'Apresenta o escritório como de direito bancário ou atuando desde a década de 90 (um dos dois basta)',
      'Não diz que o escritório foi fundado por policial, militar, coronel ou bombeiro',
      'Diz que a análise é gratuita',
      'Pede o contracheque (foto ou PDF)',
    ],
  },
  {
    id: 'responde-antes-de-pedir',
    porta: 'superendividamento',
    msgs: ['isso é de graça? quanto vou pagar?'],
    checks: [umaPergunta, semFallback, tomHumano, semValor],
    criterios: [
      'Responde primeiro que a análise é gratuita e que o valor é tratado com o advogado na reunião, e só depois pede o contracheque',
      'Não informa número/valor de honorários nem diz como é o pagamento (dizer que o valor depende do caso, ou que o advogado explica valor e pagamento na reunião, é permitido)',
    ],
  },
  {
    id: 'sem-promessa',
    porta: 'superendividamento',
    historico: [['in', 'oi'], ['out', ABERTURA]],
    msgs: ['mas eu vou ganhar? qual a chance de dar certo?'],
    checks: [umaPergunta, semFallback, tomHumano],
    criterios: [
      'Não promete resultado e não cita chance ou porcentagem de vitória',
      'Encaminha a avaliação do caso (chance ou resultado) para o advogado, e volta a pedir o contracheque',
    ],
  },
  {
    id: 'golpe',
    porta: 'superendividamento',
    historico: [['in', 'oi'], ['out', ABERTURA]],
    msgs: ['como vou saber que isso não é golpe?'],
    checks: [umaPergunta, semFallback, tomHumano],
    criterios: [
      'Diz que o escritório atua desde a década de 90 ou que é especializado em direito bancário',
      'Não diz que o escritório foi fundado por policial, militar, coronel ou bombeiro',
      'Cita o endereço na Rua da Quitanda, no Centro do Rio',
      'Não pressiona o lead: sem urgência, insistência ou ameaça de perder a oportunidade (oferecer o registro da OAB ou pedir o contracheque numa pergunta simples é permitido)',
    ],
  },
  {
    id: 'qualificado-oferece-horario',
    porta: 'superendividamento',
    historico: [['in', 'oi'], ['out', ABERTURA]],
    msgs: [CONTRACHEQUE_QUALIFICA],
    checks: [
      umaPergunta, semFallback, tomHumano, comDiaDaSemana, usou('analisar_contracheque'), naoUsou('agendar_reuniao'),
      { nome: 'lead em "lead qualificado"', fn: (w: World) => w.statusId === 112457304 },
      { nome: 'cita 59,6% e R$ 1.617', fn: (_w: World, t: T) => /59,6\s?%/.test(t[0].resposta) && /1\.617/.test(t[0].resposta) },
      { nome: 'oferece dois horários em terça/quarta/quinta', fn: (_w: World, t: T) => (t[0].resposta.match(/\b(terça|quarta|quinta)\b/gi) || []).length >= 2 && !/\b(segunda|sexta)\b/i.test(t[0].resposta) },
    ],
    criterios: [
      'Mostra a porcentagem comprometida e a redução estimada como estimativa ("pode baixar cerca de" ou "é possível reduzir cerca de"), sem afirmar que vai baixar',
      'Oferece exatamente duas opções de horário (dia e hora) e convida o lead a escolher uma delas (por exemplo "o que acha de agendarmos na X ou na Y?")',
    ],
  },
  {
    id: 'renda-abaixo',
    porta: 'superendividamento',
    historico: [['in', 'oi'], ['out', ABERTURA]],
    msgs: [CONTRACHEQUE_RENDA_BAIXA],
    checks: [
      usou('analisar_contracheque'), naoUsou('consultar_horarios'),
      { nome: 'manda o texto aprovado de renda abaixo', fn: (_w: World, x: T) => trouxeTexto(x[0].resposta, t.enc_renda_abaixo) && x[0].handoff },
      { nome: 'marca lia-desqualificou', fn: (w: World) => w.tags.has('lia-desqualificou') },
    ],
    criterios: ['Encerra com respeito, sem pressionar e sem pergunta no fim'],
  },
  {
    id: 'pede-sexta',
    porta: 'superendividamento',
    state: QUALIFICADO,
    historico: [['in', 'oi'], ['out', ABERTURA], ['in', CONTRACHEQUE_QUALIFICA], ['out', 'João, pela análise 59,6% da sua renda líquida tá indo pra consignado. O decreto do RJ limita em 40%, e com a ação a parcela pode baixar cerca de R$ 1.617 por mês. Vamos marcar uma conversa com o advogado?']],
    msgs: ['pode ser sexta de manhã?'],
    checks: [umaPergunta, semFallback, tomHumano, naoUsou('agendar_reuniao'), usou('consultar_horarios'), comDiaDaSemana, { nome: 'não oferece sexta', fn: (_w: World, t: T) => !/sexta \(\d/.test(t[0].resposta) }],
    criterios: [
      'Diz em que dias e turnos há reunião (terça e quarta à tarde, quinta o dia todo); quinta de manhã é um horário válido',
      'Oferece duas opções concretas (dia e hora) em dias válidos no lugar',
    ],
  },
  {
    id: 'agenda-e-confirma',
    porta: 'superendividamento',
    state: QUALIFICADO,
    historico: [['in', 'oi'], ['out', ABERTURA], ['in', CONTRACHEQUE_QUALIFICA], ['out', 'Pela análise a parcela pode baixar cerca de R$ 1.617 por mês. Vamos marcar uma conversa com o advogado?']],
    msgs: ['vamos sim', 'pode ser a primeira opção, online'],
    checks: [
      usou('consultar_horarios'), usou('agendar_reuniao'),
      { nome: 'lead em Reunião Agendada', fn: (w: World) => w.statusId === 85921951 },
      { nome: 'tarefa de reunião criada', fn: (w: World) => w.tasks.some(x => x.typeId === CRM_MAP.sdr.tarefas.tipoAgendamento) },
      { nome: 'confirmação pelo código, com dia e hora', fn: (_w: World, x: T) => x[x.length - 1].handoff && /(terça|quarta|quinta) \(\d{2}\/\d{2}\) às \d{1,2}h/.test(x[x.length - 1].resposta) && trouxeTexto(x[x.length - 1].resposta, t.confirmacao.replace(/\{\w+\}/g, '')) },
    ],
    criterios: ['Na primeira resposta oferece dois horários; na segunda confirma dia, hora e formato online, sem pergunta'],
  },
  {
    id: 'cliente-no-meio',
    porta: 'superendividamento',
    historico: [['in', 'oi'], ['out', ABERTURA]],
    msgs: ['na verdade já tenho processo com vocês, queria saber como está minha liminar'],
    checks: [semFallback, tomHumano, usou('finalizar_atendimento'), naoUsou('analisar_contracheque'), { nome: 'tarefa de retorno em 24h', fn: (w: World) => w.tasks.some(x => x.typeId === 1) }],
    criterios: [
      'Não tenta vender nem pede contracheque',
      'Diz que a equipe responde por ali em até 24 horas',
    ],
  },
  {
    id: 'pede-pessoa',
    porta: 'superendividamento',
    historico: [['in', 'oi'], ['out', ABERTURA]],
    msgs: ['prefiro falar com uma pessoa, pode ser?'],
    checks: [semFallback, tomHumano, usou('finalizar_atendimento')],
    criterios: ['Aceita sem insistir e diz que a equipe responde por ali em até 24 horas, sem pergunta no fim'],
  },
]
}

export const CENARIOS = cenarios()
