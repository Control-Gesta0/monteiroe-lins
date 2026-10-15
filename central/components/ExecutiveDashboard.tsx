'use client'

import Link from 'next/link'
import { ArrowRight, CalendarCheck, Headset, MessageSquareText, Wallet } from 'lucide-react'
import RefreshButton from './RefreshButton'
import { Metric, PageIntro } from './ProductUI'
import { brl } from '@/lib/format'
import { useExecutions, useLive } from '@/lib/hooks'
import { buildBriefing, type DecisionCard, type SignalTone } from '@/lib/intelligence'

/**
 * Visão geral (v4.1): veredito, o que pede decisão e quatro números. O resto
 * mora nas subabas (Operação, Resultados, Sistema), sem atalhos repetidos aqui.
 */
export default function ExecutiveDashboard() {
  const { data: live, erro: liveErro, carregando: liveCarregando } = useLive()
  const { data, erro: execErro, carregando: execCarregando } = useExecutions()
  const f = data?.financeiro
  const pronto = !liveCarregando && !execCarregando
  // Fail-closed: só declara saúde depois das duas fontes; erro de conector é atenção
  const precisaAtencao = !!liveErro || !!execErro || (data?.saude24h.erros || 0) > 0 || (live ? !live.saude.crmOk : false)
  const briefing = buildBriefing(live, data)
  const [principal, ...secundarias] = briefing.decisions
  const hoje = data?.marcos.hoje
  const sete = data?.marcos.seteDias

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="VISÃO GERAL"
        title="A Lia está"
        accent={!pronto ? 'sendo verificada.' : precisaAtencao ? 'pedindo atenção.' : 'operando bem.'}
        description={briefing.ritmo}
        action={<RefreshButton />}
      />

      <section className="panel overflow-hidden">
        <div className="px-5 pt-4 font-mono text-[9px] uppercase tracking-[0.16em] text-body-muted">O que pede decisão · calculado sem tokens</div>
        {!pronto ? (
          <div className="m-5 h-24 rounded-lg animate-pulse surface-alt" />
        ) : liveErro || execErro ? (
          <div className="p-5 text-[13px] text-warning leading-relaxed">
            {liveErro ? `CRM: ${liveErro}` : `Diário: ${execErro}`}
          </div>
        ) : principal ? (
          <div>
            <Decision decision={principal} primary />
            {secundarias.length > 0 && (
              <details className="group border-t border-line-soft">
                <summary className="list-none cursor-pointer px-5 py-3.5 flex items-center gap-3 hover-raise">
                  <span className="text-[12px] font-medium text-ink flex-1">Mais {secundarias.length} {secundarias.length === 1 ? 'ponto' : 'pontos'}</span>
                  <span className="text-[11px] text-body-faint group-open:rotate-90 transition-transform">▷</span>
                </summary>
                <div className="grid md:grid-cols-2 border-t border-line-soft divide-y md:divide-y-0 md:divide-x divide-line-soft">
                  {secundarias.map(d => <Decision key={d.id} decision={d} />)}
                </div>
              </details>
            )}
          </div>
        ) : (
          <p className="p-5 pt-2 text-[13px] text-body-mid">Nada pede decisão agora: nenhuma falha registrada nas últimas 24 horas.</p>
        )}
      </section>

      <section>
        <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-body-muted mb-3">Hoje</div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Metric icon={MessageSquareText} label="Contatos atendidos" value={hoje ? String(hoje.atendidos) : '—'}
            hint={hoje ? `${hoje.naoClientes} lead(s) novo(s) · ${hoje.clientes} cliente(s) do escritório` : undefined} color="#06b6d4" />
          <Metric icon={Headset} label="Passados para a equipe" value={hoje ? String(hoje.passagens) : '—'} hint={sete ? `${sete.passagens} nos últimos 7 dias` : undefined} color="#a78bfa" />
          <Metric icon={CalendarCheck} label="Reuniões marcadas pela Lia" value={hoje ? String(hoje.agendados) : '—'}
            hint={sete ? `${sete.agendados} nos últimos 7 dias · ${sete.analisados} contracheque(s) analisado(s)` : undefined} color="#3b82f6" featured={(hoje?.agendados || 0) > 0} />
          <Metric icon={Wallet} label="Custo do modelo" value={f?.execucoesComCusto ? brl(f.hoje) : '—'}
            hint={f?.execucoesComCusto ? `${brl(f.seteDias)} nos últimos 7 dias` : 'aguardando a primeira execução medida'} color="#22c55e" />
        </div>
      </section>
    </div>
  )
}

const TONE: Record<SignalTone, { color: string; label: string }> = {
  calm: { color: '#22c55e', label: 'PROTEÇÃO' },
  attention: { color: '#f59e0b', label: 'ATENÇÃO' },
  critical: { color: '#ef4444', label: 'URGENTE' },
  opportunity: { color: '#22c55e', label: 'OPORTUNIDADE' },
  learning: { color: '#a78bfa', label: 'APRENDIZADO' },
}

function Decision({ decision: d, primary = false }: { decision: DecisionCard; primary?: boolean }) {
  const tone = TONE[d.tone]
  return (
    <Link href={d.href} className={`block p-5 interactive-card ${primary ? 'pt-3' : ''}`}>
      <div className="font-mono text-[8.5px] tracking-[0.13em]" style={{ color: tone.color }}>{tone.label}</div>
      <h3 className={`font-impact font-bold text-ink mt-2 ${primary ? 'text-[17px]' : 'text-[15px]'}`}>{d.title}</h3>
      <p className="text-[11.5px] text-body-mid leading-relaxed mt-2">{d.evidence}</p>
      {primary && <p className="text-[10.5px] text-body-faint leading-relaxed mt-1.5">{d.impact}</p>}
      <span className="inline-flex items-center gap-1.5 text-[11px] text-cyan mt-3">{d.action} <ArrowRight size={11} /></span>
    </Link>
  )
}
