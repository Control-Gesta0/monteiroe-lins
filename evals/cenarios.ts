/**
 * CENÁRIOS DA LIA (patch). Rodar com a chave da OpenAI: EVAL_REPS=3 npm run evals
 * Todos aprovados nas 3 repetições ou o prompt não sobe.
 */
import type { Cenario, World } from '../scripts/evals'

type T = Array<{ resposta: string; tools: string[]; handoff: boolean; guard: string[] }>
const umaPergunta = { nome: 'no máximo 1 pergunta por resposta', fn: (_w: World, t: T) => t.every(x => (x.resposta.match(/\?/g) || []).length <= 1) }
const ABERTURA_ENCENADA = /^(ótima pergunta|excelente pergunta|perfeito!|bora lá|deixa eu te explicar|claro!|com certeza!)/i
const RESIDUO_CHATBOT = /(espero ter ajudado|fico à disposição|posso ajudar (com|em) (mais )?(alguma|algo)|qualquer dúvida,? (é só|estou))/i
const tomHumano = { nome: 'tom humano: sem travessão, abertura encenada ou resíduo de chatbot', fn: (_w: World, t: T) => t.every(x => !/[—–]/.test(x.resposta) && !ABERTURA_ENCENADA.test(x.resposta.trim()) && !RESIDUO_CHATBOT.test(x.resposta)) }
const semFallback = { nome: 'nenhuma resposta caiu no texto de segurança', fn: (_w: World, t: T) => t.every(x => !x.guard.includes('fallback')) }
const usou = (tool: string) => ({ nome: `chamou ${tool}`, fn: (_w: World, t: T) => t.some(x => x.tools.includes(tool)) })
const naoUsou = (tool: string) => ({ nome: `NÃO chamou ${tool}`, fn: (_w: World, t: T) => !t.some(x => x.tools.includes(tool)) })
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
const ABERTURA = 'Oi! Aqui é a Lia, assistente virtual da Monteiro & Lins. O escritório foi fundado por um policial e cuida de quem tá com o salário preso em consignado. A análise é gratuita: me manda uma foto ou PDF do seu último contracheque?'
const QUALIFICADO = { analise: { decisao: 'qualificado', comprometimento: 0.5958, reducaoMensal: 1617.83, competencia: '09/2026', assinatura: 'x', em: '2026-10-14' } }

export const CENARIOS: Cenario[] = [
  {
    id: 'abertura',
    porta: 'superendividamento',
    nomeContato: 'João Silva',
    msgs: ['oi, vi o anúncio sobre o consignado'],
    checks: [umaPergunta, semFallback, tomHumano],
    criterios: [
      'Se apresenta como Lia, assistente virtual do escritório Monteiro & Lins',
      'Diz que o escritório foi fundado por um policial',
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
      'Responde primeiro que a análise é gratuita e que o valor da ação é apresentado na reunião, e só depois pede o contracheque',
      'Não cita nenhum valor de honorários nem forma de pagamento',
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
      'Diz que quem avalia o caso é o advogado, e volta a pedir o contracheque',
    ],
  },
  {
    id: 'golpe',
    porta: 'superendividamento',
    historico: [['in', 'oi'], ['out', ABERTURA]],
    msgs: ['como vou saber que isso não é golpe?'],
    checks: [umaPergunta, semFallback, tomHumano],
    criterios: [
      'Diz que o escritório foi fundado por um policial',
      'Cita o endereço na Rua da Quitanda, no Centro do Rio',
      'Não pressiona o lead',
    ],
  },
  {
    id: 'qualificado-oferece-horario',
    porta: 'superendividamento',
    historico: [['in', 'oi'], ['out', ABERTURA]],
    msgs: [CONTRACHEQUE_QUALIFICA],
    checks: [
      umaPergunta, semFallback, tomHumano, usou('analisar_contracheque'), usou('consultar_horarios'), naoUsou('agendar_reuniao'),
      { nome: 'lead em "lead qualificado"', fn: (w: World) => w.statusId === 112457304 },
      { nome: 'cita 59,6% e R$ 1.617', fn: (_w: World, t: T) => /59,6\s?%/.test(t[0].resposta) && /1\.617/.test(t[0].resposta) },
      { nome: 'oferece dois horários em terça/quarta/quinta', fn: (_w: World, t: T) => (t[0].resposta.match(/\b(terça|quarta|quinta)\b/gi) || []).length >= 2 && !/\b(segunda|sexta)\b/i.test(t[0].resposta) },
    ],
    criterios: [
      'Mostra a porcentagem comprometida e a redução estimada usando "pode baixar cerca de" (sem afirmar que vai baixar)',
      'Oferece exatamente duas opções de horário e pergunta qual fica melhor',
    ],
  },
  {
    id: 'renda-abaixo',
    porta: 'superendividamento',
    historico: [['in', 'oi'], ['out', ABERTURA]],
    msgs: [CONTRACHEQUE_RENDA_BAIXA],
    checks: [
      usou('analisar_contracheque'), naoUsou('consultar_horarios'),
      { nome: 'manda o texto aprovado da Defensoria', fn: (_w: World, t: T) => /Defensoria Pública do RJ/.test(t[0].resposta) && t[0].handoff },
      { nome: 'marca lia-desqualificou', fn: (w: World) => w.tags.has('lia-desqualificou') },
    ],
    criterios: ['Encerra com respeito, indicando a Defensoria Pública, sem pergunta no fim'],
  },
  {
    id: 'pede-sexta',
    porta: 'superendividamento',
    state: QUALIFICADO,
    historico: [['in', 'oi'], ['out', ABERTURA], ['in', CONTRACHEQUE_QUALIFICA], ['out', 'João, pela análise 59,6% da sua renda líquida tá indo pra consignado. O decreto do RJ limita em 40%, e com a ação a parcela pode baixar cerca de R$ 1.617 por mês. Vamos marcar uma conversa com o advogado?']],
    msgs: ['pode ser sexta de manhã?'],
    checks: [umaPergunta, semFallback, tomHumano, naoUsou('agendar_reuniao'), { nome: 'não oferece sexta', fn: (_w: World, t: T) => !/sexta \(\d/.test(t[0].resposta) }],
    criterios: [
      'Explica que as reuniões são quinta o dia todo e terça e quarta à tarde',
      'Oferece duas opções válidas no lugar',
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
      { nome: 'tarefa Agendamento IA criada', fn: (w: World) => w.tasks.some(x => x.typeId === 4231636) },
      { nome: 'confirmação pelo código', fn: (_w: World, t: T) => /^Fechado: (terça|quarta|quinta) \(\d{2}\/\d{2}\) às \d{1,2}h/.test(t[t.length - 1].resposta) },
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
