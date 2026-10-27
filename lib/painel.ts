import { CANAIS } from './canais'
import { CONFIG } from './config'
import { readExecs } from './execlog'
import { googleAtivo } from './google-calendar'
import {
  checarEstrutura, funisAoVivo, GANHO, leadsAbertosDoFunil, leadsFechadosDoFunil, lerCampo, motivosDePerdaAoVivo, norm, PERDIDO,
  tarefasAbertas, usuariosAoVivo, type KommoFunil, type KommoLeadV,
} from './kommo-vivo'
import { k, redis } from './redis'
import { chaveWebhook, statusStevo } from './stevo'
import { filaSemResposta, ultimaAtividade } from './stevo-conversa'

/**
 * PAINEL DE GESTÃO DA MONTEIRO & LINS — ao vivo do Kommo (e do Redis do agente):
 * conexão dos WhatsApps pela Stevo, implantação, cada funil e etapa, operação e a Lia.
 * Montado no servidor (o token do Kommo nunca vai para o navegador) e guardado 90 s
 * no Redis para não estourar o limite da API do Kommo (~7 req/s).
 *
 * Os funis são achados AO VIVO pelo nome: funil novo no Kommo vira aba sozinho.
 */

const CACHE = () => k('painel', 'cache')
const CACHE_S = 90
const DIA = 86400
const PARADO_DIAS = 7
const CARDS_POR_ETAPA = 40

/** Funis que não entram no painel (teste). */
const FORA_DO_PAINEL = ['TESTE PAULA'].map(norm)
const FUNIL_SDR = 'Funil/SDR'

/**
 * Etapas do Funil/SDR que o painel usa pelo nome (a checagem de implantação confere).
 * A etapa de entrada não entra: é a de "leads de entrada" (tipo 1), cujo nome muda com o idioma.
 */
const SDR = {
  qualificacao: 'Qualificação', semResposta: 'follow - não responde',
  analise: 'Retorno Imediato/Fazer analise', qualificado: 'lead qualificado', agendada: 'Reunião Agendada',
  naoCompareceu: 'Não compareceu', presencial: 'Reunião Presencial', posReuniao: 'Pós Reunião', repescar: 'Repescar',
}
const ETAPAS_DA_LIA = [SDR.qualificacao, SDR.semResposta, SDR.analise, SDR.qualificado].map(norm)
const daLia = (s?: { name: string; type: number }) => Boolean(s && (s.type === 1 || ETAPAS_DA_LIA.includes(norm(s.name))))

function linksDeConexao(): Record<string, string> {
  try { return JSON.parse(process.env.STEVO_LINKS || '{}') } catch { return {} }
}

export interface CardPainel { id: number; nome: string; etapa: string; responsavel: string; tags: string; dias: number; valor: number; link: string }
export interface EtapaPainel { nome: string; n: number; valor: number; parados: number; diasMedio: number; ia: boolean; cards: CardPainel[] }
export interface Destaque { rotulo: string; valor: string | number; status?: 'bom' | 'atencao' | 'critico'; dica?: string }
export interface FunilPainel {
  chave: string; nome: string; curto: string; existe: boolean; abertos: number; valor: number; parados: number
  ganhos30: number; perdidos30: number; etapas: EtapaPainel[]; destaques: Destaque[]
  quebras: Array<{ titulo: string; itens: Array<{ rotulo: string; n: number }> }>
}

const agora = () => Math.floor(Date.now() / 1000)
const diasDesde = (ts?: number) => (ts ? Math.max(0, Math.floor((agora() - ts) / DIA)) : 0)
const horasDesde = (ts?: number) => (ts ? Math.max(0, (agora() - ts) / 3600) : 0)
const contatoDe = (l: KommoLeadV) => (l._embedded?.contacts || []).find(c => c.is_main)?.id || l._embedded?.contacts?.[0]?.id || -l.id
const tagsDe = (l: KommoLeadV) => (l._embedded?.tags || []).map(t => t.name)
const st = (ruim: boolean, critico = false): Destaque['status'] => (critico ? 'critico' : ruim ? 'atencao' : 'bom')
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const curto = (nome: string) => nome.replace(/^Funil\s*\/\s*/i, '').replace(/\s*\/\s*/g, ' / ').trim()

export function contar(itens: string[]): Array<{ rotulo: string; n: number }> {
  const m = new Map<string, number>()
  for (const i of itens) m.set(i || 'Não informado', (m.get(i || 'Não informado') || 0) + 1)
  return [...m.entries()].map(([rotulo, n]) => ({ rotulo, n })).sort((a, b) => b.n - a.n)
}

export interface Bruto { funil: KommoFunil; abertos: KommoLeadV[]; fechados: KommoLeadV[] }

export function montarFunil(b: Bruto, usuarios: Map<number, string>, sub: string): FunilPainel {
  const ehSdr = norm(b.funil.name) === norm(FUNIL_SDR)
  const etapas = b.funil._embedded.statuses
    .filter(s => s.id !== GANHO && s.id !== PERDIDO)
    .sort((a, c) => a.sort - c.sort)
    .map(s => {
      const cards = b.abertos.filter(l => l.status_id === s.id).map(l => ({
        id: l.id, nome: l.name, etapa: s.name, responsavel: usuarios.get(l.responsible_user_id) || '—',
        tags: tagsDe(l).slice(0, 3).join(', '), dias: diasDesde(l.updated_at), valor: Number(l.price) || 0,
        link: `https://${sub}/leads/detail/${l.id}`,
      })).sort((a, c) => c.dias - a.dias)
      return {
        nome: s.name, n: cards.length, valor: cards.reduce((t, c) => t + c.valor, 0),
        parados: cards.filter(c => c.dias >= PARADO_DIAS).length,
        diasMedio: cards.length ? Math.round(cards.reduce((t, c) => t + c.dias, 0) / cards.length) : 0,
        ia: ehSdr && daLia(s),
        cards: cards.slice(0, CARDS_POR_ETAPA), tipo: s.type,
      }
    })
    .filter(e => e.tipo !== 1 || e.n > 0) // "Incoming leads" só aparece com card
    .map(({ tipo: _t, ...e }) => e)
  return {
    chave: `f${b.funil.id}`, nome: b.funil.name, curto: curto(b.funil.name), existe: true, abertos: b.abertos.length,
    valor: etapas.reduce((t, e) => t + e.valor, 0), parados: etapas.reduce((t, e) => t + e.parados, 0),
    ganhos30: b.fechados.filter(l => l.status_id === GANHO).length, perdidos30: b.fechados.filter(l => l.status_id === PERDIDO).length,
    etapas, destaques: [], quebras: [],
  }
}

const naEtapa = (b: Bruto, nome: string) => {
  const ids = b.funil._embedded.statuses.filter(s => norm(s.name) === norm(nome)).map(s => s.id)
  return b.abertos.filter(l => ids.includes(l.status_id))
}

/** Indicadores de cada funil: os do processo da Lia no Funil/SDR; os gerais nos outros. */
export function destaquesDoFunil(f: FunilPainel, b: Bruto, usuarios: Map<number, string>): void {
  const novos30 = [...b.abertos, ...b.fechados].filter(l => diasDesde(l.created_at) <= 30).length
  const conv = f.ganhos30 + f.perdidos30 ? Math.round((100 * f.ganhos30) / (f.ganhos30 + f.perdidos30)) : null
  const taxa: Destaque = { rotulo: 'Taxa de fechamento (30 dias)', valor: conv === null ? '—' : `${conv}%`, dica: 'Ganhos ÷ (ganhos + perdidos) fechados nos últimos 30 dias' }
  const base: Destaque[] = [
    { rotulo: 'Cards abertos', valor: f.abertos },
    { rotulo: `Parados há ${PARADO_DIAS}+ dias`, valor: f.parados, status: st(f.parados > 0, f.parados > 10) },
  ]
  const porResponsavel = { titulo: 'Cards abertos por responsável', itens: contar(b.abertos.map(l => usuarios.get(l.responsible_user_id) || '—')).slice(0, 12) }
  if (norm(f.nome) !== norm(FUNIL_SDR)) {
    f.destaques = [{ rotulo: 'Novos (30 dias)', valor: novos30 }, ...base, { rotulo: 'Ganhos (30 dias)', valor: f.ganhos30, status: 'bom' }, { rotulo: 'Perdidos (30 dias)', valor: f.perdidos30 }, taxa]
    f.quebras = [porResponsavel]
    return
  }
  const comLia = b.abertos.filter(l => tagsDe(l).some(t => norm(t) === norm(CONFIG.gateTag || 'lia')) && daLia(b.funil._embedded.statuses.find(s => s.id === l.status_id))).length
  const analise = naEtapa(b, SDR.analise)
  const agendadas = [...naEtapa(b, SDR.agendada), ...naEtapa(b, SDR.presencial)]
  const faltou = naEtapa(b, SDR.naoCompareceu)
  f.destaques = [
    { rotulo: 'Novos (30 dias)', valor: novos30 },
    { rotulo: 'Com a Lia agora', valor: comLia, dica: 'Cards com a tag da Lia nas etapas em que ela conversa' },
    { rotulo: 'Em qualificação', valor: naEtapa(b, SDR.qualificacao).length },
    { rotulo: 'Para analisar (equipe)', valor: analise.length, status: st(analise.length > 0, analise.some(l => horasDesde(l.updated_at) > 24)), dica: 'Retorno Imediato/Fazer análise: crítico quando algum espera há mais de 1 dia' },
    { rotulo: 'Reuniões marcadas', valor: agendadas.length },
    { rotulo: 'Não compareceram', valor: faltou.length, status: st(faltou.length > 0) },
    { rotulo: 'Pós-reunião', valor: naEtapa(b, SDR.posReuniao).length },
    { rotulo: 'Ganhos (30 dias)', valor: f.ganhos30, status: 'bom' },
    taxa,
    { rotulo: 'Em Repescar', valor: naEtapa(b, SDR.repescar).length },
    ...base,
  ]
  f.quebras = [porResponsavel]
}

/** Jornada do Funil/SDR: onde estão hoje os clientes que entraram nos últimos 30 dias. */
export function jornadaSdr(b: Bruto): Array<{ etapa: string; n: number }> {
  const desde = agora() - 30 * DIA
  const recentes = [...b.abertos, ...b.fechados].filter(l => (l.created_at || 0) >= desde)
  const unicos = (ls: KommoLeadV[]) => new Set(ls.map(contatoDe)).size
  const nomeDa = (l: KommoLeadV) => norm(b.funil._embedded.statuses.find(s => s.id === l.status_id)?.name || '')
  const depois = (nomes: string[]) => recentes.filter(l => l.status_id === GANHO || nomes.map(norm).includes(nomeDa(l)))
  const reuniao = [SDR.agendada, SDR.naoCompareceu, SDR.presencial, SDR.posReuniao, 'Fila Presencial', 'fila online']
  return [
    { etapa: 'Entraram', n: unicos(recentes) },
    { etapa: 'Qualificados', n: unicos(depois([SDR.qualificado, ...reuniao])) },
    { etapa: 'Reunião marcada', n: unicos(depois(reuniao)) },
    { etapa: 'Fecharam (Ganho)', n: unicos(recentes.filter(l => l.status_id === GANHO)) },
  ]
}

const diaSP = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const NOMES_FERRAMENTAS: Record<string, string> = {
  analisar_contracheque: 'Analisou contracheque', consultar_horarios: 'Consultou horários', agendar_reuniao: 'Marcou reunião',
  finalizar_atendimento: 'Encerrou ou passou para a equipe', mover_etapa: 'Moveu o card', salvar_respostas: 'Anotou respostas',
  registrar_respondente: 'Registrou quem responde', registrar_outro_assunto: 'Registrou outro assunto',
}

export async function montarPainel(forcar = false): Promise<Record<string, unknown>> {
  if (!forcar) {
    const c = await redis.get<string | Record<string, unknown>>(CACHE())
    if (c) return typeof c === 'string' ? JSON.parse(c) : c
  }
  const sub = CONFIG.kommoDomain.replace(/^https?:\/\//, '')
  const nomes = Object.keys(CANAIS)
  const links = linksDeConexao()
  const [estados, atividade] = await Promise.all([Promise.all(nomes.map(statusStevo)), ultimaAtividade(nomes)])
  const base = CONFIG.selfUrl || 'https://lia-monteiro-lins.vercel.app'
  const conexoes = nomes.map((n, i) => ({
    instancia: n, numero: CANAIS[n].numero, papel: CANAIS[n].papel, ia: CANAIS[n].ia,
    link: links[n] || '', ...estados[i], ultimaMensagem: atividade[n] || null,
    webhook: `${base}/api/canal-hint?canal=${n}&s=${chaveWebhook(n)}`,
  }))

  // ---- Kommo ----
  const desde30 = agora() - 30 * DIA
  let funis: FunilPainel[] = []
  let jornada: Array<{ etapa: string; n: number }> = []
  let perdas: Array<{ rotulo: string; n: number }> = []
  let tarefas = { abertas: 0, vencidas: 0, porResponsavel: [] as Array<{ rotulo: string; n: number }> }
  let estrutura: Awaited<ReturnType<typeof checarEstrutura>> | null = null
  let erroKommo = ''
  try {
    const [todos, users, motivos] = await Promise.all([funisAoVivo(), usuariosAoVivo(), motivosDePerdaAoVivo()])
    const usuarios = new Map(users.map(u => [u.id, u.name]))
    const lista = todos.filter(f => !FORA_DO_PAINEL.includes(norm(f.name)))
      .sort((a, b) => Number(norm(b.name) === norm(FUNIL_SDR)) - Number(norm(a.name) === norm(FUNIL_SDR)))
    const brutos: Bruto[] = []
    for (const funil of lista) brutos.push({ funil, abertos: await leadsAbertosDoFunil(funil.id), fechados: await leadsFechadosDoFunil(funil.id, desde30) })
    funis = brutos.map(b => { const f = montarFunil(b, usuarios, sub); destaquesDoFunil(f, b, usuarios); return f })
    const sdr = brutos.find(b => norm(b.funil.name) === norm(FUNIL_SDR))
    if (sdr) jornada = jornadaSdr(sdr)
    const nomesMotivo = new Map(motivos.map(m => [m.id, m.name]))
    perdas = contar(brutos.flatMap(b => b.fechados).filter(l => l.status_id === PERDIDO)
      .map(l => l._embedded?.loss_reason?.[0]?.name || (l.loss_reason_id ? nomesMotivo.get(l.loss_reason_id) || '' : '') || 'Sem motivo')).slice(0, 12)
    // Tarefas à parte: uma falha aqui não apaga o resto do painel
    try {
      const ts = await tarefasAbertas()
      const vencidas = ts.filter(t => t.complete_till < agora())
      tarefas = { abertas: ts.length, vencidas: vencidas.length, porResponsavel: contar(vencidas.map(t => usuarios.get(t.responsible_user_id) || '—')).slice(0, 12) }
    } catch (e) { erroKommo = `tarefas: ${(e instanceof Error ? e.message : String(e)).slice(0, 150)}` }
  } catch (e) {
    erroKommo = (e instanceof Error ? e.message : String(e)).slice(0, 200)
  }
  try { estrutura = await checarEstrutura({ funis: [FUNIL_SDR], etapas: Object.values(SDR).map(e => [FUNIL_SDR, e] as [string, string]) }) } catch (e) {
    erroKommo = erroKommo || (e instanceof Error ? e.message : String(e)).slice(0, 200)
  }

  // ---- Operação: clientes esperando resposta (conversas pela Stevo) ----
  const semResposta = (await filaSemResposta().catch(() => []))
    .map(s => ({ numero: CANAIS[s.canal]?.numero || s.canal, cliente: `+${s.fone.slice(0, 4)}…${s.fone.slice(-4)}`, minutos: Math.round((Date.now() - s.desde) / 60000) }))
    .sort((a, b) => b.minutos - a.minutos)

  // ---- Lia (diário de execuções) ----
  const hoje = diaSP(new Date())
  const log = (await readExecs(500).catch(() => [])).filter(r => diaSP(new Date(r.at)) === hoje && r.tipo !== 'reset')
  const ia = {
    respostas: log.filter(r => r.tipo === 'resposta' || r.tipo === 'finalizou' || r.tipo === 'menu').length,
    pulou: log.filter(r => r.tipo === 'pulou').length,
    erros: log.filter(r => r.tipo === 'erro').length,
    custoHoje: log.reduce((t, r) => t + (r.custoUsd || 0), 0) * CONFIG.usdBrl,
    ferramentas: contar(log.flatMap(r => r.tools || []).map(t => NOMES_FERRAMENTAS[t] || t)),
    contracheques: log.filter(r => r.decisao).length,
    agendou: log.filter(r => r.motivo === 'agendou').length,
  }

  const conectados = conexoes.filter(c => c.status === 'conectado').length
  const agenda = await googleAtivo().catch(() => false)
  const implantacao = [
    { item: 'WhatsApps conectados na Stevo', ok: conectados === conexoes.length, detalhe: `${conectados} de ${conexoes.length}` },
    { item: 'Mensagens chegando pelo webhook', ok: conexoes.every(c => c.ultimaMensagem), detalhe: `${conexoes.filter(c => c.ultimaMensagem).length} de ${conexoes.length} números já mandaram mensagem` },
    { item: 'Lia atendendo pela Stevo', ok: CONFIG.canalLia === 'stevo', detalhe: CONFIG.canalLia === 'stevo' ? 'CANAL_LIA=stevo' : 'ainda pelo WhatsApp Lite do Kommo (foto não chega para a Lia)' },
    { item: 'Etapas do Funil/SDR no Kommo', ok: estrutura?.ok === true, detalhe: estrutura ? (estrutura.ok ? 'tudo certo' : 'faltam etapas (ver abaixo)') : (erroKommo || 'sem resposta do Kommo') },
    { item: 'Google Agenda ligada', ok: agenda, detalhe: agenda ? 'a Lia vê os horários ocupados' : 'falta autorizar a agenda' },
    { item: 'Lia para todos os leads', ok: !CONFIG.gateTag || CONFIG.stevoTagLia, detalhe: !CONFIG.gateTag || CONFIG.stevoTagLia ? 'rampagem concluída' : `rampagem: só cards com a tag "${CONFIG.gateTag}"` },
  ]

  const sdrF = funis.find(f => norm(f.nome) === norm(FUNIL_SDR))
  const valorDe = (rotulo: string) => sdrF?.destaques.find(d => d.rotulo === rotulo)?.valor ?? 0
  const resumo: Destaque[] = [
    { rotulo: 'Entraram no SDR (30 dias)', valor: jornada[0]?.n ?? 0 },
    { rotulo: 'Reuniões marcadas agora', valor: valorDe('Reuniões marcadas') },
    { rotulo: 'Ganhos no SDR (30 dias)', valor: sdrF?.ganhos30 ?? 0, status: 'bom' },
    { rotulo: 'Clientes esperando resposta', valor: semResposta.length, status: st(semResposta.length > 0, semResposta.some(s => s.minutos > 120)), dica: 'Conversas pela Stevo. Crítico quando alguém espera há mais de 2 horas' },
    { rotulo: 'Tarefas vencidas', valor: tarefas.vencidas, status: st(tarefas.vencidas > 0, tarefas.vencidas > 10) },
    { rotulo: 'Cards abertos (todos os funis)', valor: funis.reduce((t, f) => t + f.abertos, 0) },
    { rotulo: 'Respostas da Lia hoje', valor: ia.respostas },
    { rotulo: 'Custo da Lia hoje', valor: ia.custoHoje.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
  ]

  const painel = {
    geradoEm: new Date().toISOString(), cliente: 'Monteiro & Lins', kommoUrl: `https://${sub}`, kommoLigado: true,
    canalLia: CONFIG.canalLia, erroKommo, conexoes, implantacao, estrutura, resumo, jornada, perdas,
    funis: funis.map(({ valor, ...f }) => ({ ...f, valor, valorTexto: valor ? brl(valor) : '' })),
    tarefas, semResposta: semResposta.slice(0, 30), ia,
  }
  await redis.set(CACHE(), JSON.stringify(painel), { ex: CACHE_S })
  return painel
}
