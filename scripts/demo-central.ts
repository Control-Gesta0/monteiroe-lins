// npx tsx scripts/demo-central.ts — gera central/lib/demo-data.json (dados FICTÍCIOS)
// com as mesmas funções que o agente usa em /api/central. Só para CENTRAL_DEMO=1.
import { readFileSync, writeFileSync } from 'fs'
import { buildConversas, buildExecutionData, buildFunil, type KommoLeadResumo } from '../lib/central-data'
import { listarConversas, turnosDoContato } from '../lib/conversas-reais'
import type { ExecEntry } from '../lib/execlog'
import { GRUPOS, ITENS, textosPadrao, validarTexto } from '../lib/base-core'

const NOW = Date.now()
const min = (m: number) => new Date(NOW - m * 60_000).toISOString()
const u = (i: number, o: number) => ({ input: i, cached: Math.round(i * 0.7), output: o, calls: 2 })
const custo = (i: number, o: number) => Math.round(((i * 0.3 * 0.75 + i * 0.7 * 0.075 + o * 4.5) / 1e6) * 1e6) / 1e6

const NOMES = ['Sgt. Marcos Teixeira', 'Cb. Renata Alves', 'Sd. Bruno Lima', 'Ten. Carla Souza', 'Sgt. André Moraes', 'Cb. Fábio Nunes',
  'Sd. Paulo Ramos', 'Sgt. Luciana Melo', 'Cb. Diego Faria', 'Sub. Ricardo Pinto', 'Sd. Aline Costa', 'Sgt. Júlio Barros']

type Roteiro = Array<Omit<ExecEntry, 'at' | 'leadId' | 'nome'> & { depois: number }>
const ABRE = 'Oi! Aqui é a Lia, assistente virtual da Monteiro & Lins, escritório de direito bancário que atua desde a década de 90. A gente cuida de quem tá com o salário preso em consignado. A análise é gratuita: me manda uma foto ou PDF do seu último contracheque?'
const CC = '[imagem do lead]: CONTRACHEQUE | PMERJ | 09/2026 | sim\nRUBRICA | 001 | SOLDO | P | 6.200,00\n…'

const ROTEIROS: Roteiro[] = [
  [ // qualifica e agenda
    { tipo: 'resposta', perfil: 'nao_cliente', turnoLead: 'vi o anúncio do consignado', respostaIA: ABRE, depois: 0 },
    { tipo: 'resposta', perfil: 'nao_cliente', decisao: 'qualificado', turnoLead: CC, respostaIA: 'Pela análise, *59,6%* da sua renda líquida tá indo pra consignado, e a parcela pode baixar cerca de *R$ 1.617* por mês. O próximo passo é a conversa com o advogado: *quinta (16/10) às 10h* ou *terça (21/10) às 14h30*?', tools: ['analisar_contracheque'], depois: 4, midia: { audios: 0, imagens: 1, documentos: 0 } },
    { tipo: 'finalizou', perfil: 'nao_cliente', motivo: 'agendou', turnoLead: 'quinta 10h, online', respostaIA: 'Fechado: quinta (16/10) às 10h, por videochamada aqui no WhatsApp. Até lá!', tools: ['agendar_reuniao', 'trava:texto-aprovado'], detalhe: 'Reunião online em quinta (16/10) às 10h.', depois: 3 },
  ],
  [ // renda abaixo
    { tipo: 'resposta', perfil: 'nao_cliente', turnoLead: 'oi quero saber da ação', respostaIA: ABRE, depois: 0 },
    { tipo: 'finalizou', perfil: 'nao_cliente', decisao: 'renda_abaixo', motivo: 'renda_abaixo', turnoLead: CC, respostaIA: 'Olhando a sua situação com cuidado, pelas exigências da lei e pelos custos do processo, a ação não seria vantajosa pra você agora. A Defensoria Pública do RJ atende de graça e pode te orientar nesse caso.', tools: ['analisar_contracheque', 'trava:texto-aprovado'], detalhe: 'Análise: renda_abaixo (renda bruta R$ 7.000,00).', depois: 6, midia: { audios: 0, imagens: 1, documentos: 0 } },
  ],
  [ // revisão
    { tipo: 'resposta', perfil: 'nao_cliente', turnoLead: 'boa tarde, é sobre o contracheque', respostaIA: ABRE, depois: 0 },
    { tipo: 'finalizou', perfil: 'nao_cliente', decisao: 'revisao_humana', motivo: 'revisao_humana', turnoLead: CC, respostaIA: 'Recebi tudo. Tem uns descontos no seu contracheque que a equipe precisa conferir, e eles te respondem por aqui em até 24 horas.', tools: ['analisar_contracheque', 'trava:texto-aprovado'], detalhe: 'Análise: revisao_humana (rubricas não reconhecidas podem mudar o resultado: DESC DIVERSOS R$ 900,00).', depois: 5, midia: { audios: 0, imagens: 0, documentos: 1 } },
  ],
  [ // cliente do escritório
    { tipo: 'finalizou', perfil: 'cliente', motivo: 'porta_sem_agente', turnoLead: 'bom dia, como está o andamento do meu processo?', respostaIA: 'Oi! Vou passar a sua mensagem pra equipe do escritório, e eles te respondem por aqui em até 24 horas.', tools: ['trava:atendimento-24h'], detalhe: 'Cliente do escritório perguntou do andamento do processo.', depois: 0 },
  ],
  [ // qualificado, ainda escolhendo horário
    { tipo: 'resposta', perfil: 'nao_cliente', turnoLead: 'isso é de graça?', respostaIA: 'A análise do contracheque é gratuita, e o valor da ação o advogado apresenta na reunião. Me manda uma foto ou PDF do seu último contracheque?', depois: 0 },
    { tipo: 'resposta', perfil: 'nao_cliente', decisao: 'qualificado', turnoLead: CC, respostaIA: 'Pela análise, *52,3%* da sua renda líquida tá indo pra consignado, e a parcela pode baixar cerca de *R$ 1.108* por mês. Vamos marcar a conversa com o advogado: *quarta (22/10) às 15h* ou *quinta (23/10) às 9h30*?', tools: ['analisar_contracheque'], depois: 7 },
  ],
  [ // pede pessoa
    { tipo: 'finalizou', perfil: 'nao_cliente', motivo: 'pediu_humano', turnoLead: 'prefiro falar com um advogado direto', respostaIA: 'Vou passar a sua mensagem pra equipe do escritório, e eles te respondem por aqui em até 24 horas.', tools: ['finalizar_atendimento'], detalhe: 'Pediu para falar direto com o advogado antes de mandar o contracheque.', depois: 0 },
  ],
  [ // alívio baixo
    { tipo: 'resposta', perfil: 'nao_cliente', turnoLead: 'olá', respostaIA: ABRE, depois: 0 },
    { tipo: 'finalizou', perfil: 'nao_cliente', decisao: 'alivio_baixo', motivo: 'alivio_baixo', turnoLead: CC, respostaIA: 'Fiz a análise e a redução na parcela seria pequena, não compensaria o custo de entrar com a ação. Prefiro ser sincera com você do que te indicar algo que não vai trazer retorno.', tools: ['analisar_contracheque', 'trava:texto-aprovado'], detalhe: 'Análise: alivio_baixo (comprometimento 43,2%).', depois: 9 },
  ],
]

const entries: ExecEntry[] = []
let c = 0
for (let dia = 13; dia >= 0; dia--) {
  const porDia = dia === 0 ? 4 : 2 + (dia % 4)
  for (let j = 0; j < porDia; j++) {
    const r = ROTEIROS[(c + j) % ROTEIROS.length]
    const leadId = 900000 + c
    const nome = NOMES[c % NOMES.length]
    let t = dia * 1440 + 60 + j * 95 + (c % 7) * 11
    if (dia === 0) t = 25 + j * 70
    for (const passo of r) {
      t -= passo.depois
      const { depois: _d, ...resto } = passo
      const i = 7200 + ((c * 37) % 1800)
      const o = 140 + ((c * 13) % 140)
      const semModelo = (resto.tools || []).includes('trava:atendimento-24h')
      entries.push({ ...resto, at: min(t), leadId, nome, ms: 11_500 + ((c * 911) % 4200), ...(semModelo ? {} : { usage: u(i, o), custoUsd: custo(i, o) }), detalhe: resto.detalhe || 'salesbot/run disparado' })
    }
    c++
  }
}
entries.push({ at: min(190), leadId: 899001, nome: 'Sgt. Rafael Souza', tipo: 'pulou', detalhe: 'humano falou pelo Kommo nas últimas 6h — a IA não atropela' })
entries.push({ at: min(3000), leadId: 899002, nome: 'Cb. Gustavo Pires', tipo: 'erro', ms: 4100, detalhe: 'Kommo 429: limite de requisições (o próximo webhook responde)' })

const execucoes = buildExecutionData(entries, 5.5, 'gpt-5.4-mini-2026-03-17', NOW, 'https://demo.kommo.com')
const etapas = [
  [85921939, 'Leads de entrada'], [85921943, 'Qualificação'], [112779736, 'follow - não responde'], [85921947, 'Retorno Imediato/Fazer analise'],
  [112457304, 'lead qualificado'], [85921951, 'Reunião Agendada'], [86687847, 'Não compareceu'], [88985691, 'Reunião Presencial'], [85921955, 'Pós Reunião'],
  [86854727, 'Fila Presencial'], [97779631, 'fila online'], [86791959, 'Repescar'], [142, 'Venda ganha'], [143, 'Venda perdida'],
].map(([id, name], i) => ({ id: id as number, name: name as string, sort: (i + 1) * 10 }))
const dist: Record<number, number> = { 85921939: 6, 85921943: 18, 112779736: 4, 85921947: 2, 112457304: 3, 85921951: 9, 86687847: 2, 85921955: 11, 86791959: 40, 142: 3, 143: 20 }
const leads: KommoLeadResumo[] = []
let n = 0
for (const [status, q] of Object.entries(dist)) for (let k = 0; k < q; k++) {
  leads.push({ id: 800000 + n, name: NOMES[n % NOMES.length], status_id: Number(status), price: 0, updated_at: Math.floor((NOW - (k % 3 === 0 ? 12 : 2) * 86400_000) / 1000), _embedded: { tags: k % 2 ? [{ name: 'lia' }] : [] } })
  n++
}
const live = {
  geradoEm: new Date(NOW).toISOString(),
  ...buildConversas(execucoes.execucoes, NOW),
  pipeline: { nome: 'Funil/SDR' },
  ...buildFunil(etapas, leads, 'lia', [85921939, 85921943, 112779736, 85921947, 112457304]),
  regras: { modoGate: 'tag', gateTag: 'lia', humanTag: 'atendimento-humano', expediente: 'a Lia responde a qualquer hora; reuniões só quinta o dia todo e terça e quarta à tarde' },
  saude: { crmOk: true, problemas: [] },
}

// Base: os textos reais, com um rascunho de exemplo
const padrao = textosPadrao([readFileSync('prompts/nucleo.md', 'utf-8'), readFileSync('prompts/portas/superendividamento.md', 'utf-8')])
const fundador = padrao.escritorio.replace('fundada na década de 90', 'fundada em 1995')
const rascunho: Record<string, string> = { escritorio: fundador }
const base = {
  versao: 1, publicadoEm: new Date(NOW - 3 * 86400_000).toISOString(), nota: 'Mensagem de renda abaixo mais acolhedora', rascunhoEm: new Date(NOW - 3600_000).toISOString(),
  grupos: { ...GRUPOS, extras: 'Informações acrescentadas pela equipe' },
  itens: [
    ...ITENS.map(i => ({ id: i.id, grupo: i.grupo as string, titulo: i.titulo, ajuda: i.ajuda, padrao: padrao[i.id], noAr: padrao[i.id], rascunho: rascunho[i.id] ?? null, problemas: rascunho[i.id] ? validarTexto(i.id, rascunho[i.id]) : [] })),
    { id: 'extra_demo0001', grupo: 'extras', titulo: 'Estacionamento', ajuda: 'Informação nova: entra quando o rascunho for publicado.', padrao: '', noAr: '', rascunho: 'Tem estacionamento rotativo na Rua da Quitanda e um estacionamento pago na esquina com a Rua do Ouvidor.', problemas: [] },
  ],
  alteracoes: ['escritorio', 'extra_demo0001'],
  historico: [
    { versao: 0, publicadoEm: null, nota: null, mudancas: [] },
  ],
  conversa: [
    { id: 'c1', ts: new Date(NOW - 5 * 3600_000).toISOString(), papel: 'equipe', origem: 'base', texto: 'O escritório foi fundado em 1995, pode colocar o ano certo.' },
    { id: 'c2', ts: new Date(NOW - 5 * 3600_000 + 9000).toISOString(), papel: 'ia', origem: 'base', destino: 'base', custoUsd: 0.0021,
      texto: 'Troquei a década pelo ano de fundação no texto Quem é o escritório. Está no rascunho: teste e publique com o exame para valer no WhatsApp.',
      mudancas: [{ tipo: 'trocar', id: 'escritorio', titulo: 'Quem é o escritório', antes: padrao.escritorio, depois: fundador }] },
    { id: 'c3', ts: new Date(NOW - 2 * 3600_000).toISOString(), papel: 'equipe', origem: 'base', texto: 'Acrescenta que tem estacionamento rotativo na Rua da Quitanda e um pago na esquina com a Rua do Ouvidor.' },
    { id: 'c4', ts: new Date(NOW - 2 * 3600_000 + 8000).toISOString(), papel: 'ia', origem: 'base', destino: 'nova_informacao', custoUsd: 0.0019,
      texto: 'Acrescentei a informação "Estacionamento". Está no rascunho: teste e publique com o exame para valer no WhatsApp.',
      mudancas: [{ tipo: 'nova', id: 'extra_demo0001', titulo: 'Estacionamento', antes: '', depois: 'Tem estacionamento rotativo na Rua da Quitanda e um estacionamento pago na esquina com a Rua do Ouvidor.' }] },
    { id: 'c5', ts: new Date(NOW - 3600_000).toISOString(), papel: 'equipe', origem: 'base', texto: 'Pode colocar que os honorários são 12x de R$ 1.000?' },
    { id: 'c6', ts: new Date(NOW - 3600_000 + 6000).toISOString(), papel: 'ia', origem: 'base', destino: 'recusado', custoUsd: 0.0008,
      texto: 'Não mudei nada. A Lia nunca informa valor de honorários nem forma de pagamento: isso é apresentado pelo advogado na reunião.' },
    { id: 'c7', ts: new Date(NOW - 1800_000).toISOString(), papel: 'equipe', origem: 'base', texto: 'Quero que ela ofereça reunião na segunda de manhã também.' },
    { id: 'c8', ts: new Date(NOW - 1800_000 + 6000).toISOString(), papel: 'ia', origem: 'base', destino: 'control_gestao', custoUsd: 0.0007,
      texto: 'Dias e horários da agenda são regra de atendimento, então não mexi na base. Nada mudou na base: ficou registrado como pedido para a Control Gestão.' },
  ],
  pedidosControlGestao: 1,
  exame: { id: 'exdemo', status: 'aprovado', inicio: new Date(NOW - 3 * 86400_000 - 60_000).toISOString(), fim: new Date(NOW - 3 * 86400_000).toISOString(), nota: 'Mensagem de renda abaixo mais acolhedora', mudancas: ['enc_renda_abaixo'], feitos: 10, total: 10, custoUsd: 0.04, versao: 1, falhas: [] },
}

// Laboratório: uma conversa de exemplo
const h = (id: string, dir: 'in' | 'out', text: string, m: number) => ({ id, dir, text, ts: NOW - m * 60_000 })
const teste = {
  sessao: {
    id: 'tdemo', criadoEm: new Date(NOW - 600_000).toISOString(), opcoes: { perfil: 'novo', versao: 'vigente' },
    history: [
      h('l0', 'in', 'oi, vi o anúncio do consignado', 9),
      h('r1', 'out', ABRE, 9),
      h('l2', 'in', CC, 8),
      h('r3', 'out', 'Pela análise, *59,6%* da sua renda líquida tá indo pra consignado, e a parcela pode baixar cerca de *R$ 1.617* por mês. O próximo passo é a conversa com o advogado: *quinta (16/10) às 10h* ou *terça (21/10) às 14h30*?', 8),
      h('l4', 'in', 'quinta 10h, online', 7),
      h('r5', 'out', 'Fechado: quinta (16/10) às 10h, por videochamada aqui no WhatsApp. Até lá!', 7),
    ],
    mundo: {
      statusId: 85921951, tags: ['lia-finalizou'], ocupados: [],
      tasks: [{ typeId: 2, text: 'Reunião online marcada pela Lia: quinta (16/10) às 10h.', completeTill: Math.floor(NOW / 1000) + 86400 }],
      notes: ['🤖 Lia · análise do contracheque PMERJ 09/2026\nAnálise IA (qualificado): comprometimento e redução acima do mínimo', '🤖 IA finalizou: Análise do contracheque e reunião · agendou\n\nReunião online em quinta (16/10) às 10h.'],
      state: { analise: { decisao: 'qualificado', comprometimento: 0.5958, reducaoMensal: 1617.83 }, finalizado: { motivo: 'agendou', em: new Date(NOW - 420_000).toISOString(), resumo: 'Reunião online em quinta (16/10) às 10h.' } },
    },
    detalhes: {
      r1: { tools: [], log: [], guard: [], ms: 6800, custoUsd: 0.0009, handoff: false },
      r3: { tools: ['analisar_contracheque'], log: ['analisar_contracheque({}) → QUALIFICADO. Comprometimento 59,6%. Redução mensal estimada (teto de 40%): R$ 1.617,83.', 'etapa → 112457304'], guard: [], ms: 11200, custoUsd: 0.0017, handoff: false },
      r5: { tools: ['agendar_reuniao', 'trava:texto-aprovado'], log: ['agendar_reuniao({"data_hora":"2026-10-16T10:00","formato":"online"}) → Reunião marcada', 'tarefa 2', 'etapa → 85921951'], guard: [], ms: 9900, custoUsd: 0.0012, handoff: true },
    },
    turnos: 3, custoUsd: 0.0038,
  },
  uso: { mensagens: 3, custoUsd: 0.0038, limite: 300, usdBrl: 5.5 },
}
const conversas = listarConversas(entries, 30)
const reais = { conversas, turnos: Object.fromEntries(conversas.map(c => [c.contato, turnosDoContato(entries, c.contato)])) }
writeFileSync('central/lib/demo-data.json', JSON.stringify({ execucoes, live, base, teste, reais }))
console.log(`demo: ${entries.length} execuções, ${leads.length} leads → central/lib/demo-data.json`)
