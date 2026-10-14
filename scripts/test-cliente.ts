/**
 * TESTES DA MONTEIRO & LINS (patch) — rodam junto com `npm test`, sem rede.
 *  1. Réplica da planilha: o código bate com a planilha original recalculada no LibreOffice
 *  2. Regra de qualificação do escritório
 *  3. Leitura da transcrição do contracheque
 *  4. Agenda (quinta o dia todo, terça e quarta à tarde)
 *  5. Roteamento: lead novo × quem já é cliente
 *  6. Travas de texto (OAB, margem de 40%)
 *  7. Ferramentas ponta a ponta numa porta em memória
 */
import fs from 'node:fs'
import path from 'node:path'

type Eq = (nome: string, got: unknown, want: unknown) => void

export default async function testesCliente(eq: Eq): Promise<number> {
  const { analisarContracheque, calcularTotais, classificar, PARAMETROS } = await import('../lib/analise-contracheque')
  type Rubrica = import('../lib/analise-contracheque').Rubrica
  const { extrairContracheque } = await import('../lib/contracheque-texto')
  const { duasOpcoes, horariosLivres, naGrade, slotDeIso } = await import('../lib/agenda')
  const { checkReply } = await import('../lib/guards')
  const { rotear } = await import('../lib/router')
  const { CRM_MAP, portaById } = await import('../lib/crm-map')
  const { runTool, aplicarFinalizacao } = await import('../lib/tools')
  type LeadPort = import('../lib/tools').LeadPort

  // ---------- 1. Planilha ----------
  type Linha = [string, 'P' | 'D', number, string?]
  const fx = (f: string) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tests', 'fixtures', f), 'utf8'))
  const cenarios: Record<string, Linha[]> = fx('cenarios.json')
  const esperado = fx('planilha-esperado.json')
  const rubricas = (linhas: Linha[], comManual = true): Rubrica[] =>
    linhas.map(([descricao, tipo, valor, manual]) => ({ descricao, tipo, valor, ...(comManual && manual ? { classificacaoManual: manual as Rubrica['classificacaoManual'] } : {}) }))
  for (const [nome, linhas] of Object.entries(cenarios)) {
    const r = rubricas(linhas)
    const t = calcularTotais(r) as unknown as Record<string, number>
    const divergentes = Object.keys(t).filter(c => Math.abs(t[c] - esperado[nome][c]) >= 0.005)
    eq(`planilha ${nome}: classificação igual`, r.map(classificar), esperado[nome].classes)
    eq(`planilha ${nome}: números iguais (±R$ 0,005)`, divergentes, [])
  }

  // ---------- 2. Regra do escritório ----------
  const decisao = (nome: string, comManual = true) => analisarContracheque(rubricas(cenarios[nome], comManual)).decisao
  eq('regra: comprometimento 59,6% e redução R$ 1.617 → qualificado', decisao('1_qualifica_comprometimento'), 'qualificado')
  eq('regra: bruto R$ 7.000 → renda_abaixo', decisao('2_renda_abaixo'), 'renda_abaixo')
  eq('regra: Credcesta R$ 1.250 → qualificado', decisao('3_qualifica_credcesta_manual'), 'qualificado')
  eq('regra: Credcesta reconhecido sem classificação manual', decisao('3_qualifica_credcesta_manual', false), 'qualificado')
  eq('regra: 43% → alivio_baixo', decisao('4_alivio_baixo'), 'alivio_baixo')
  eq('regra: tudo dentro da margem → alivio_baixo', decisao('7_tudo_dentro_margem'), 'alivio_baixo')
  eq('regra: tese do escritório é a de 40%', PARAMETROS.tese, 'A')
  eq('regra: redução citada = Cenário A da planilha', Math.round(analisarContracheque(rubricas(cenarios['1_qualifica_comprometimento'])).reducaoMensal * 100), Math.round(esperado['1_qualifica_comprometimento'].reducaoTeseA * 100))
  eq('regra: R$ 10.000 exato não passa (maior que)', analisarContracheque([{ descricao: 'SOLDO', tipo: 'P', valor: 10000 }, { descricao: 'CREDCESTA', tipo: 'D', valor: 3000 }]).decisao, 'renda_abaixo')
  eq('regra: Credcesta R$ 1.000 exato não passa', analisarContracheque([{ descricao: 'SOLDO', tipo: 'P', valor: 10001 }, { descricao: 'CREDCESTA', tipo: 'D', valor: 1000 }]).decisao, 'alivio_baixo')
  const base: Rubrica[] = [{ descricao: 'SOLDO', tipo: 'P', valor: 12000 }, { descricao: 'IMP RENDA', tipo: 'D', valor: 2000 }, { descricao: 'EMPREST BRADESCO', tipo: 'D', valor: 4500 }]
  eq('regra: 45% sem rubrica estranha → alivio_baixo', analisarContracheque(base).decisao, 'alivio_baixo')
  eq('regra: rubrica desconhecida que vira o jogo → revisao_humana', analisarContracheque([...base, { descricao: 'DESC DIVERSOS', tipo: 'D', valor: 900 }]).decisao, 'revisao_humana')
  eq('regra: sem provento → revisao_humana', analisarContracheque([{ descricao: 'EMPREST', tipo: 'D', valor: 900 }]).decisao, 'revisao_humana')

  // ---------- 3. Transcrição do contracheque ----------
  const transcricao = [
    'oi segue',
    '[imagem do lead]: CONTRACHEQUE | PMERJ | 08/2026 | sim',
    'RUBRICA | 001 | SOLDO | P | 9.000,00',
    '[imagem do lead]: CONTRACHEQUE | PMERJ | 09/2026 | sim',
    'RUBRICA | 001 | SOLDO | P | 6.200,00',
    'RUBRICA | 010 | GRAT HABILITACAO | P | 5.400,00',
    'RUBRICA | 300 | IMP RENDA RETIDO | D | 1.850,33',
    '[imagem do lead]: CONTRACHEQUE | PMERJ | 09/2026 | sim',
    'RUBRICA | 300 | IMP RENDA RETIDO | D | 1.850,33',
    'RUBRICA | 310 | CONTRIB MILIT RIOPREV | D | 1.276,00',
    'RUBRICA | 320 | FUNDO SAUDE PM | D | 210,50',
    'RUBRICA | 501 | EMPREST BRADESCO | D | 2.500,00',
    'RUBRICA | 502 | CONSIG ITAU | D | 2.010,90',
    'RUBRICA | 503 | CARTAO RMC BMG | D | 412,20',
  ].join('\n')
  const lido = extrairContracheque(transcricao)
  eq('leitura: competência mais recente', lido?.competencia, '09/2026')
  eq('leitura: junta as páginas e tira a linha repetida', lido?.rubricas.length, 8)
  eq('leitura: mesmo resultado da planilha (cenário 1)', analisarContracheque(lido!.rubricas).decisao, 'qualificado')
  eq('leitura: valor ilegível fica de fora e é avisado', extrairContracheque('CONTRACHEQUE | PMERJ | 09/2026 | parcial\nRUBRICA | 1 | SOLDO | P | 9.000,00\nRUBRICA | 2 | EMPREST X | D | ILEGÍVEL')?.ilegiveis, ['EMPREST X'])
  eq('leitura: conversa sem contracheque', extrairContracheque('[imagem do lead]: foto de um boleto da Light'), null)

  // ---------- 4. Agenda ----------
  const cfg = CRM_MAP.agenda
  const quartaManha = slotDeIso('2026-10-14T10:00', cfg)!.inicio // quarta 14/10, 10h
  const livres = horariosLivres(quartaManha, [], cfg)
  eq('agenda: começa amanhã (quinta 9h30)', livres[0]?.rotulo, 'quinta (15/10) às 9h30')
  eq('agenda: duas opções, em dias diferentes', duasOpcoes(livres, cfg).map(s => s.rotulo), ['quinta (15/10) às 9h30', 'terça (20/10) às 14h30'])
  eq('agenda: nenhuma segunda, sexta ou manhã de terça/quarta', livres.filter(s => /segunda|sexta|sábado|domingo/.test(s.rotulo) || (/terça|quarta/.test(s.rotulo) && Number(s.iso.slice(11, 13)) < 12)).length, 0)
  eq('agenda: horário ocupado sai da lista', horariosLivres(quartaManha, [livres[0].inicio], cfg)[0]?.rotulo, 'quinta (15/10) às 10h')
  eq('agenda: sexta 10h fora da grade', naGrade(slotDeIso('2026-10-16T10:00', cfg)!, cfg), false)
  eq('agenda: terça 10h fora da grade', naGrade(slotDeIso('2026-10-20T10:00', cfg)!, cfg), false)
  eq('agenda: terça 14h30 na grade', naGrade(slotDeIso('2026-10-20T14:30', cfg)!, cfg), true)
  eq('agenda: horário vira o timestamp do Kommo (BRT)', slotDeIso('2026-10-15T15:30', cfg)!.inicio, Date.parse('2026-10-15T18:30:00Z') / 1000)
  eq('agenda: segunda rodada não repete as já oferecidas', duasOpcoes(livres, cfg, duasOpcoes(livres, cfg).map(s => s.inicio))[0]?.rotulo, 'quinta (15/10) às 10h')

  // ---------- 5. Roteamento ----------
  const porta = (t: string) => { const r = rotear({}, t); return r.tipo === 'porta' ? r.porta.id : r.tipo }
  eq('rota: lead novo', porta('oi, vi o anúncio do consignado'), 'superendividamento')
  eq('rota: "como funciona o processo?" é lead novo', porta('como funciona o processo?'), 'superendividamento')
  eq('rota: "meu processo" é cliente', porta('boa tarde, como está o andamento do meu processo?'), 'atendimento')
  eq('rota: "já sou cliente" é cliente', porta('já sou cliente de vocês, preciso falar com a dra'), 'atendimento')
  eq('rota: porta travada não muda', porta.length && (() => { const r = rotear({ porta: 'superendividamento' }, 'e a minha liminar?'); return r.tipo === 'porta' && r.porta.id })(), 'superendividamento')

  // ---------- 6. Travas de texto ----------
  const regras = (t: string) => [...new Set(checkReply(t).map(v => v.regra))]
  eq('trava: "garantido" bloqueia', regras('O resultado é garantido.'), ['prometeu resultado'])
  eq('trava: "você vai ganhar" bloqueia', regras('Com certeza você vai ganhar essa ação.'), ['prometeu resultado'])
  eq('trava: "vai baixar" bloqueia', regras('Sua parcela vai baixar R$ 1.600.'), ['afirmou redução certa'])
  eq('trava: chance de vitória bloqueia', regras('A chance de vitória é de 80%.'), ['citou chance de vitória'])
  eq('trava: "reduzir até 70%" bloqueia', regras('Dá pra reduzir até 70% dos seus empréstimos.'), ['prometeu redução percentual'])
  eq('trava: honorários com valor bloqueia', regras('Os honorários ficam em 12x de R$ 1.000.'), ['falou de honorários com valor'])
  eq('trava: margem de 30% bloqueia', regras('O juiz limita a 30% da sua renda.'), ['margem errada (o teto é 40%)'])
  eq('trava passa: resultado com "pode baixar cerca de"', regras('João, pela análise **59,6%** da sua renda líquida tá indo pra consignado. O decreto do RJ limita em 40%, e com a ação a parcela pode baixar cerca de **R$ 1.617** por mês. Vamos marcar uma conversa com o advogado pra ver os detalhes?'), [])
  eq('trava passa: honorários sem valor', regras('O valor depende do caso, e o advogado apresenta na reunião, já com a sua análise em mãos.'), [])
  for (const [k, t] of Object.entries(CRM_MAP.sdr.textos)) eq(`trava passa: texto aprovado "${k}"`, regras(t), [])

  // ---------- 7. Ferramentas numa porta em memória ----------
  const mundo = (statusId = CRM_MAP.sdr.etapas.qualificacao) => {
    const w = {
      statusId, pipelineId: CRM_MAP.sdr.pipelineId, tags: new Set(['lia']), fields: {} as Record<number, unknown>, notes: [] as string[],
      tasks: [] as Array<{ typeId: number; completeTill: number }>, state: {} as Record<string, any>, ocupados: [] as number[], lost: undefined as number | undefined,
    }
    const port: LeadPort = {
      getLead: async () => ({ id: 1, statusId: w.statusId, pipelineId: w.pipelineId, fields: {}, tags: [...w.tags] }),
      writeFields: async vs => { for (const v of vs) w.fields[v.field_id] = v.values[0]?.value ?? v.values[0]?.enum_id },
      moveStage: async s => { w.statusId = s },
      addTags: async t => { t.forEach(x => w.tags.add(x)) },
      removeTags: async t => { t.forEach(x => w.tags.delete(x)) },
      addNote: async n => { w.notes.push(n) },
      createTask: async (typeId, _t, completeTill) => { w.tasks.push({ typeId, completeTill }) },
      markLost: async r => { w.lost = r; w.statusId = 143 },
      horariosOcupados: async () => [...w.ocupados],
      reservarHorario: async i => { if (w.ocupados.includes(i)) return false; w.ocupados.push(i); return true },
      agoraS: () => quartaManha,
      getState: async () => ({ ...w.state }),
      patchState: async p => Object.assign(w.state, p),
    }
    return { w, port }
  }
  const sdr = portaById('superendividamento') as NonNullable<ReturnType<typeof portaById>>
  function ctx(port: LeadPort, leadText: string, last?: string) {
    return { port, porta: sdr, gateTag: 'lia', leadText, lastLeadText: last ?? leadText, lastAgentText: '' }
  }

  {
    const { w, port } = mundo()
    const out = await runTool(ctx(port, transcricao), 'analisar_contracheque', {})
    eq('fluxo qualificado: não finaliza e manda oferecer horário', [out.isError, !!out.handoff, /consultar_horarios/.test(out.content)], [false, false, true])
    eq('fluxo qualificado: etapa "lead qualificado"', w.statusId, CRM_MAP.sdr.etapas.qualificado)
    eq('fluxo qualificado: corporação PM RJ pelo órgão', w.fields[CRM_MAP.sdr.campos.corporacao], 598404)
    eq('fluxo qualificado: nota com a análise no card', /Lia · análise do contracheque/.test(w.notes[0] || ''), true)
    const repetido = await runTool(ctx(port, transcricao), 'analisar_contracheque', {})
    eq('fluxo qualificado: mesmo contracheque não analisa duas vezes', [w.notes.length, /já foi analisado/.test(repetido.content)], [1, true])

    const c1 = await runTool(ctx(port, transcricao), 'consultar_horarios', {})
    eq('agenda: oferece as duas opções certas', /quinta \(15\/10\) às 9h30.*terça \(20\/10\) às 14h30/.test(c1.content), true)
    let ag = await runTool(ctx(port, `${transcricao}\npode ser sexta às 10h`, 'pode ser sexta às 10h'), 'agendar_reuniao', { data_hora: '2026-10-16T10:00', formato: 'online', evidencia: 'pode ser sexta às 10h' })
    eq('agenda: sexta é recusada', [ag.isError, /não está na agenda/.test(ag.content)], [true, true])
    ag = await runTool(ctx(port, transcricao, 'ok'), 'agendar_reuniao', { data_hora: '2026-10-15T09:30', formato: 'online', evidencia: 'quinta 9h30 então' })
    eq('agenda: sem o lead escolher, não agenda', ag.isError, true)
    w.ocupados.push(slotDeIso('2026-10-15T09:30', cfg)!.inicio)
    ag = await runTool(ctx(port, `${transcricao}\nquinta 9h30 então`, 'quinta 9h30 então'), 'agendar_reuniao', { data_hora: '2026-10-15T09:30', formato: 'online', evidencia: 'quinta 9h30 então' })
    eq('agenda: horário que outro lead pegou é recusado', [ag.isError, /acabou de ser ocupado/.test(ag.content)], [true, true])
    ag = await runTool(ctx(port, `${transcricao}\nquinta 10h presencial`, 'quinta 10h presencial'), 'agendar_reuniao', { data_hora: '2026-10-15T10:00', formato: 'presencial', evidencia: 'quinta 10h presencial' })
    eq('agenda: marca, confirma pelo código e encerra', [ag.isError, ag.handoff, ag.textoFinal], [false, true, 'Fechado: quinta (15/10) às 10h, presencial na Rua da Quitanda, 19, sala 711, Centro. Até lá!'])
    eq('agenda: campo Agendamento = timestamp do horário', w.fields[CRM_MAP.sdr.campos.agendamento], slotDeIso('2026-10-15T10:00', cfg)!.inicio)
    eq('agenda: tarefa "Agendamento IA" no horário', w.tasks.find(t => t.typeId === CRM_MAP.sdr.tarefas.tipoAgendamento)?.completeTill, slotDeIso('2026-10-15T10:00', cfg)!.inicio)
    eq('agenda: etapa Reunião Agendada e IA desligada', [w.statusId, w.tags.has('lia'), w.state.finalizado?.motivo], [CRM_MAP.sdr.etapas.agendada, false, 'agendou'])
  }
  {
    const { w, port } = mundo()
    const out = await runTool(ctx(port, 'CONTRACHEQUE | PMERJ | 09/2026 | sim\nRUBRICA | 1 | SOLDO | P | 5.200,00\nRUBRICA | 2 | GRAT | P | 1.800,00\nRUBRICA | 3 | EMP CONSIG SANTANDER | D | 2.600,00'), 'analisar_contracheque', {})
    eq('fluxo renda abaixo: texto da Defensoria pelo código', [out.handoff, out.textoFinal], [true, CRM_MAP.sdr.textos.renda_abaixo])
    eq('fluxo renda abaixo: tag de conferência, IA desligada, sem tarefa', [w.tags.has('lia-desqualificou'), w.tags.has('lia'), w.tasks.length], [true, false, 0])
    eq('fluxo renda abaixo: na rampagem NÃO move para perdido', [w.lost, w.statusId], [undefined, CRM_MAP.sdr.etapas.qualificacao])
    const c = await runTool(ctx(port, 'oi'), 'consultar_horarios', {})
    eq('fluxo renda abaixo: não oferece horário', c.isError, true)
  }
  {
    const { w, port } = mundo()
    const out = await runTool(ctx(port, 'CONTRACHEQUE | PMERJ | 09/2026 | parcial\nRUBRICA | 1 | SOLDO | P | 12.000,00\nRUBRICA | 2 | IMP RENDA | D | 2.000,00\nRUBRICA | 3 | EMPREST BRADESCO | D | 4.500,00\nRUBRICA | 4 | DESC DIVERSOS | D | 900,00'), 'analisar_contracheque', {})
    eq('fluxo revisão: texto de 24h pelo código', out.textoFinal, CRM_MAP.sdr.textos.revisao_humana)
    eq('fluxo revisão: etapa Retorno Imediato + tarefa em 24h', [w.statusId, w.tasks[0]?.typeId, w.tasks[0]?.completeTill], [CRM_MAP.sdr.etapas.revisao, CRM_MAP.sdr.tarefas.tipoRetorno, quartaManha + 24 * 3600])
  }
  {
    const { port } = mundo()
    const out = await runTool(ctx(port, 'oi, quero entender'), 'analisar_contracheque', {})
    eq('fluxo sem contracheque: pede o documento', [out.isError, /Peça ao lead/.test(out.content)], [true, true])
    const ilegivel = await runTool(ctx(port, 'CONTRACHEQUE | PMERJ | 09/2026 | não\nRUBRICA | 1 | SOLDO | P | 9.000,00'), 'analisar_contracheque', {})
    eq('fluxo ilegível: pede outra foto', /outra foto/.test(ilegivel.content), true)
  }
  {
    const { w, port } = mundo()
    await aplicarFinalizacao({ ...ctx(port, 'como está meu processo'), porta: portaById('atendimento')! }, 'porta_sem_agente', 'Cliente perguntou do processo')
    eq('cliente: tarefa de retorno em 24h e IA desligada', [w.tasks[0]?.completeTill, w.tags.has('lia')], [quartaManha + 24 * 3600, false])
    eq('cliente: mensagem fixa fala das 24h', /até 24 horas/.test(portaById('atendimento')!.mensagemSemAgente || ''), true)
  }
  // ---------- 8. Boas-vindas do Salesbot não pausa a IA; humano pausa ----------
  const automatica = (t: string) => CRM_MAP.saidasAutomaticas.some(re => re.test(t))
  eq('saída: template de boas-vindas com nome é automático', automatica('Oi, João! Aqui é a Lia, assistente virtual da Monteiro & Lins.'), true)
  eq('saída: mensagem do comercial é humana', automatica('Oi João, aqui é a Patrícia do escritório, recebi seu contracheque.'), false)
  return 0
}
