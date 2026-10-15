import { brl } from './format'
import type { ExecutionData, LiveData } from './types'

/**
 * Briefing e "Pergunte à Central": interpretação calculada em código, zero
 * tokens. Sem as duas fontes, nenhuma conclusão é inventada.
 */

export type SignalTone = 'calm' | 'attention' | 'critical' | 'opportunity' | 'learning'

export interface DecisionCard { id: string; tone: SignalTone; title: string; evidence: string; impact: string; action: string; href: string }
/** `ritmo` completa os quatro números da Visão geral (não repete nenhum deles). */
export interface ExecutiveBriefing { ritmo: string; decisions: DecisionCard[] }

const plural = (n: number, s: string, p: string) => (n === 1 ? s : p)
const DIA = 86400_000

export function buildBriefing(live: LiveData | null, data: ExecutionData | null): ExecutiveBriefing {
  if (!live || !data) {
    return { ritmo: 'Reunindo o CRM e o diário. Nenhuma conclusão aparece antes das duas fontes responderem.', decisions: [] }
  }
  const decisions: DecisionCard[] = []
  const erros = data.saude24h.erros
  const agora = Date.now()
  const passagens24h = data.passagens.filter(p => agora - Date.parse(p.ts) <= DIA)

  if (!live.saude.crmOk) {
    decisions.push({
      id: 'crm', tone: 'critical', title: 'O mapa do CRM precisa de conferência',
      evidence: live.saude.problemas[0] || 'A leitura do CRM falhou.',
      impact: 'Com etapa ou campo divergente, a Lia não move o lead nem grava a reunião no lugar certo.',
      action: 'Ver detalhes', href: '/configuracoes',
    })
  }
  if (erros > 0) {
    decisions.push({
      id: 'erros', tone: erros >= 3 ? 'critical' : 'attention',
      title: `${erros} ${plural(erros, 'execução pede', 'execuções pedem')} investigação`,
      evidence: `${erros} ${plural(erros, 'erro apareceu', 'erros apareceram')} no diário nas últimas 24 horas.`,
      impact: 'Pode haver lead esperando resposta.', action: 'Abrir o histórico', href: '/operacao?aba=historico',
    })
  }
  const urgentes = passagens24h.filter(p => p.urgente)
  if (urgentes.length) {
    decisions.push({
      id: 'urgentes', tone: 'critical',
      title: `${urgentes.length} ${plural(urgentes.length, 'contato com urgência', 'contatos com urgência')} com a equipe`,
      evidence: `${urgentes.map(p => p.nome).slice(0, 3).join(', ')}: a Lia identificou urgência e passou para a equipe.`,
      impact: 'Quanto antes alguém do escritório responder, melhor.', action: 'Ver passagens', href: '/operacao?aba=passagens',
    })
  }
  const outras = passagens24h.filter(p => !p.urgente)
  if (outras.length) {
    const porMotivo = new Map<string, number>()
    for (const p of outras) porMotivo.set(p.rotulo, (porMotivo.get(p.rotulo) || 0) + 1)
    decisions.push({
      id: 'passagens', tone: 'opportunity',
      title: `${outras.length} ${plural(outras.length, 'atendimento espera', 'atendimentos esperam')} a equipe (prazo de 24 horas)`,
      evidence: [...porMotivo.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r}: ${n}`).join(' · '),
      impact: 'A Lia prometeu resposta em até 24 horas: cada um tem tarefa no Kommo com esse prazo e uma nota com o resumo.',
      action: 'Ver passagens', href: '/operacao?aba=passagens',
    })
  }
  const parados = live.funil.filter(f => f.parados > 0).sort((a, b) => b.parados - a.parados)[0]
  if (parados) {
    decisions.push({
      id: 'parados', tone: 'opportunity',
      title: `${parados.parados} ${plural(parados.parados, 'lead parado', 'leads parados')} em ${parados.label}`,
      evidence: `Sem atualização há 7 dias ou mais${parados.valor ? `, somando ${brl(parados.valor, 0)} em valor aberto na etapa` : ''}.`,
      impact: 'É onde o Funil/SDR está perdendo ritmo.', action: 'Ver no funil', href: '/operacao?aba=funil',
    })
  }
  if (!data.financeiro.execucoesComCusto) {
    decisions.push({
      id: 'ledger', tone: 'learning', title: 'Custo ainda não medido',
      evidence: 'Nenhuma execução com consumo de tokens registrado apareceu no diário.',
      impact: 'A próxima conversa real inaugura o custo por resposta.', action: 'Entender os custos', href: '/resultados',
    })
  }

  return {
    ritmo: live.respostaMedianaSegundos
      ? `Tempo mediano de ${Math.round(live.respostaMedianaSegundos)}s por resposta, contando a espera de 10s que junta mensagens seguidas.`
      : 'Ainda sem resposta medida nas últimas 24 horas.',
    decisions: decisions.slice(0, 4),
  }
}

export interface MoneySignal { id: string; stage: string; count: number; value: number; tone: SignalTone; title: string; samples: LiveData['funil'][number]['amostras'] }

export function buildMoneyRadar(live: LiveData | null): MoneySignal[] {
  if (!live) return []
  return live.funil
    .filter(s => s.parados > 0)
    .map((s, i) => ({
      id: `money-${i}`, stage: s.label, count: s.parados, value: s.valor,
      tone: (/qualificado|Retorno Imediato|Reunião Agendada/i.test(s.label) ? 'critical' : 'opportunity') as SignalTone,
      title: `${s.parados} ${plural(s.parados, 'parada', 'paradas')} em ${s.label}`,
      samples: s.amostras,
    }))
    .sort((a, b) => (b.value || b.count) - (a.value || a.count))
    .slice(0, 6)
}

export interface CentralAnswer { answer: string; evidence: string[]; href?: string; label?: string }

export function answerCentral(raw: string, live: LiveData | null, data: ExecutionData | null): CentralAnswer {
  const q = raw.toLowerCase()
  if (!live || !data) return { answer: 'Ainda estou carregando o CRM e o diário.', evidence: ['Espere as fontes responderem e pergunte de novo.'] }

  if (/custo|gast|token|investimento|quanto custa/.test(q)) {
    const f = data.financeiro
    return {
      answer: f.execucoesComCusto
        ? `Nos últimos 30 dias o modelo custou ${brl(f.trintaDias)}; em média ${brl(f.medioPorExecucao, 3)} por execução.`
        : 'Ainda não há execução com custo registrado.',
      evidence: [`${f.execucoesComCusto} execuções com custo`, `${f.execucoesSemCusto} registros sem custo (antigos ou com erro)`, f.observacao],
      href: '/resultados', label: 'Abrir resultados',
    }
  }
  if (/erro|falha|quebrou|saúde|saude|crm/.test(q)) {
    return {
      answer: data.saude24h.erros ? `Encontrei ${data.saude24h.erros} erro(s) nas últimas 24 horas.` : 'Nenhuma falha no diário nas últimas 24 horas.',
      evidence: [`${data.saude24h.total} execuções analisadas`, live.saude.crmOk ? 'Mapa do CRM conferido sem divergência' : `CRM: ${live.saude.problemas[0]}`],
      href: '/operacao?aba=historico', label: 'Abrir o histórico',
    }
  }
  if (/passag|equipe|humano|cliente do|processo|24/.test(q)) {
    const mot = data.motivos.seteDias
    const m = data.marcos.seteDias
    return {
      answer: `Nos últimos 7 dias a Lia passou ${m.passagens} contato(s) para a equipe; marcou ${m.agendados} reunião(ões) e encerrou ${m.desqualificados} desqualificado(s) sem precisar dela.`,
      evidence: mot.length ? mot.map(m => `${m.rotulo}: ${m.n}`) : ['Nenhuma passagem nos últimos 7 dias'],
      href: '/operacao?aba=passagens', label: 'Ver passagens',
    }
  }
  if (/contracheque|an[aá]lis|qualific|desqualific|reuni|agend|convers|funil|parad|lead/.test(q)) {
    const m = data.marcos.trintaDias
    const radar = buildMoneyRadar(live)
    return {
      answer: `Em 30 dias: ${m.atendidos} contatos atendidos, ${m.analisados} contracheque(s) analisado(s), ${m.qualificados} qualificado(s), ${m.agendados} reunião(ões) marcada(s) e ${m.desqualificados} desqualificado(s).`,
      evidence: radar.length ? radar.slice(0, 3).map(r => `${r.stage}: ${r.count} parado(s) há 7+ dias`) : ['Nenhum lead parado pelo critério de 7 dias'],
      href: '/resultados', label: 'Abrir resultados',
    }
  }
  if (/hor[aá]rio|agenda|quinta|ter[cç]a|quarta|dia/.test(q)) {
    const m = data.marcos.seteDias
    return {
      answer: `Nos últimos 7 dias a Lia marcou ${m.agendados} reunião(ões). Ela só oferece ${live.regras.expediente.replace(/^.*reuniões só /, '')}.`,
      evidence: ['Horário ocupado no Kommo (Reunião Agendada/Presencial) ou na Google Agenda não é oferecido.', 'Mudar dias e horários é pedido para a Control Gestão.'],
      href: '/operacao?aba=historico', label: 'Abrir o histórico',
    }
  }
  return {
    answer: `Nas últimas 24h: ${live.conversas24h} contatos atendidos, ${data.saude24h.erros} erro(s) e tempo mediano de ${live.respostaMedianaSegundos ? `${Math.round(live.respostaMedianaSegundos)}s` : '—'}.`,
    evidence: ['Resposta calculada com os seus dados, sem consumir tokens', 'Pergunte sobre contracheques, reuniões, passagens, agenda, custo ou erros.'],
  }
}
