'use client'

import { useEffect, useState } from 'react'
import { CheckCheck, Filter, Headset, Info, LayoutDashboard, MessageSquareText, Wallet } from 'lucide-react'
import RefreshButton from '@/components/RefreshButton'
import { Metric, PageIntro, SectionTitle } from '@/components/ProductUI'
import { brl, pct } from '@/lib/format'
import { useExecutions } from '@/lib/hooks'
import type { Marcos, MotivoN } from '@/lib/types'

type View = 'resumo' | 'conversao'
type Janela = 'seteDias' | 'trintaDias'

const VIEWS: Array<{ id: View; label: string; icon: typeof Filter }> = [
  { id: 'resumo', label: 'Resumo', icon: LayoutDashboard },
  { id: 'conversao', label: 'Funil da Lia', icon: Filter },
]

export default function Resultados() {
  const [view, setView] = useState<View>('resumo')
  const [janela, setJanela] = useState<Janela>('trintaDias')
  const { data } = useExecutions()
  const f = data?.financeiro
  const m = data?.marcos[janela]
  const custo = f ? (janela === 'seteDias' ? f.seteDias : f.trintaDias) : 0
  const maxCusto = Math.max(...(f?.porDia || []).map(d => d.custo), 0.0001)

  useEffect(() => {
    const ler = () => {
      const pedida = window.location.hash.replace('#', '')
      setView(VIEWS.some(v => v.id === pedida) ? (pedida as View) : 'resumo')
    }
    ler()
    window.addEventListener('hashchange', ler)
    return () => window.removeEventListener('hashchange', ler)
  }, [])
  const trocar = (v: View) => {
    setView(v)
    window.history.replaceState(null, '', v === 'resumo' ? '/resultados' : `/resultados#${v}`)
  }

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="RESULTADOS E INVESTIMENTO" title="O valor produzido," accent="sem caixa-preta." description="Quantos a Lia atendeu, quantos contracheques analisou, quantas reuniões marcou, e quanto custou." action={<RefreshButton />} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="segmented" aria-label="Áreas de resultados">
          {VIEWS.map(v => <button key={v.id} onClick={() => trocar(v.id)} className={`whitespace-nowrap ${view === v.id ? 'active' : ''}`}><v.icon size={13} className="inline mr-1.5 -mt-0.5" />{v.label}</button>)}
        </div>
        <div className="segmented" aria-label="Período">
          {(['seteDias', 'trintaDias'] as const).map(j => <button key={j} onClick={() => setJanela(j)} className={janela === j ? 'active' : ''}>{j === 'seteDias' ? '7 dias' : '30 dias'}</button>)}
        </div>
      </div>

      {view === 'resumo' && (
        <div className="space-y-7">
          <section>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <Metric icon={MessageSquareText} label="Contatos atendidos" value={m ? String(m.atendidos) : '—'} hint={m ? `${m.naoClientes} lead(s) novo(s) · ${m.clientes} cliente(s) do escritório` : undefined} color="#06b6d4" />
              <Metric icon={Headset} label="Passados para a equipe" value={m ? String(m.passagens) : '—'} hint={m ? `${pct(m.passagens, m.atendidos)} dos atendidos, com resposta prometida em 24 horas` : undefined} color="#a78bfa" />
              <Metric icon={CheckCheck} label="Reuniões marcadas pela Lia" value={m ? String(m.agendados) : '—'} hint={m ? `${pct(m.agendados, m.qualificados)} dos ${m.qualificados} qualificado(s)` : undefined} color="#3b82f6" featured={(m?.agendados || 0) > 0} />
              <Metric icon={Wallet} label="Custo do modelo" value={f?.execucoesComCusto ? brl(custo) : '—'} hint={f?.execucoesComCusto ? `${brl(f.medioPorExecucao, 3)} por execução` : 'sem execução medida'} color="#22c55e" />
            </div>
          </section>

          {f?.execucoesComCusto ? (
            <section className="panel p-5 md:p-6">
              <SectionTitle eyebrow="TENDÊNCIA DE 14 DIAS" title="O gasto acompanha o volume?" description="Passe o mouse numa barra para ver custo e número de execuções do dia." />
              <div className="h-[220px] flex items-end gap-1.5 md:gap-2 pt-8">
                {f.porDia.map((d, i) => (
                  <div key={d.data} className="flex-1 h-full flex flex-col justify-end group relative min-w-0">
                    <div className={`opacity-0 group-hover:opacity-100 absolute -top-7 whitespace-nowrap panel px-2 py-1 font-mono text-[8px] text-ink z-10 ${i < 2 ? 'left-0' : i > 11 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>
                      {brl(d.custo, 3)} · {d.execucoes} exec.
                    </div>
                    <div className="w-full rounded-t-[4px] min-h-[3px]" style={{ height: `${Math.max(2, (d.custo / maxCusto) * 100)}%`, background: 'linear-gradient(180deg,#22d3ee,#2563eb)' }} />
                    <div className="font-mono text-[7px] text-body-faint text-center mt-2">{i % 2 === 0 ? d.data.slice(5).split('-').reverse().join('/') : ''}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="panel p-5 md:p-6 flex items-start gap-4">
              <span className="metric-icon text-cyan bg-cyan/[0.07] border-cyan/20"><Info size={15} /></span>
              <p className="text-[12.5px] leading-relaxed text-body-mid">A próxima execução real inaugura a tendência de custo. Até lá a Central não desenha gráfico cheio de zeros.</p>
            </section>
          )}

          <details className="panel group overflow-hidden">
            <summary className="list-none cursor-pointer px-5 py-4 flex items-center gap-3 hover-raise">
              <Info size={15} className="text-cyan" />
              <span className="text-[13px] font-medium text-ink flex-1">Como interpretar estes números</span>
              <span className="text-[11px] text-body-faint group-open:rotate-90 transition-transform">▷</span>
            </summary>
            <div className="px-5 pb-5 pt-1 grid md:grid-cols-3 gap-4 text-[12px] leading-relaxed text-body-mid">
              <p><strong className="text-ink">Marcos:</strong> contados a partir do que a Lia fez no diário: analisou o contracheque (com a decisão da planilha), marcou a reunião, encerrou um desqualificado ou passou para a equipe (com o motivo). Cada contato conta uma vez por período; reset de teste não conta.</p>
              <p><strong className="text-ink">Custo:</strong> {f?.observacao}</p>
              <p><strong className="text-ink">Cobertura:</strong> o diário guarda as últimas {data?.cobertura.registros || 0} execuções{data?.cobertura.desde ? `, desde ${new Date(data.cobertura.desde).toLocaleDateString('pt-BR')}` : ''}. Períodos mais antigos não entram na conta.</p>
            </div>
          </details>
        </div>
      )}

      {view === 'conversao' && (
        <section className="panel p-5 md:p-7">
          <SectionTitle eyebrow="FUNIL DA LIA" title="Da mensagem à reunião." description="Quantos contatos chegaram a cada marco e a parcela dos atendidos." />
          {data ? <Conversao m={data.marcos[janela]} motivos={data.motivos[janela]} /> : <div className="h-48 animate-pulse surface-alt rounded-lg" />}
        </section>
      )}
    </div>
  )
}

function Conversao({ m, motivos }: { m: Marcos; motivos: MotivoN[] }) {
  const passos = [
    { label: 'Atendidos pela Lia', n: m.atendidos, color: '#06b6d4' },
    { label: 'Mandaram o contracheque e foram analisados', n: m.analisados, color: '#3b82f6' },
    { label: 'Passaram na regra da planilha', n: m.qualificados, color: '#a78bfa' },
    { label: 'Reunião marcada pela Lia', n: m.agendados, color: '#22c55e' },
  ]
  const max = Math.max(m.atendidos, 1)
  const maxMotivo = Math.max(...motivos.map(x => x.n), 1)
  return (
    <div className="space-y-5">
      {passos.map(p => (
        <div key={p.label}>
          <div className="flex items-baseline justify-between gap-3 text-[12px]">
            <span className="text-ink">{p.label}</span>
            <span className="font-mono text-body-muted shrink-0">{p.n}<span className="text-body-faint"> · {pct(p.n, m.atendidos)}</span></span>
          </div>
          <div className="h-2.5 surface-alt rounded-full overflow-hidden mt-2">
            <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, (p.n / max) * 100)}%`, background: p.color }} />
          </div>
        </div>
      ))}
      <div className="pt-5 border-t border-line-soft">
        <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-body-muted mb-4">Passagens por motivo</div>
        <div className="space-y-3">
          {motivos.map(x => (
            <div key={x.motivo} className="grid grid-cols-[140px_1fr_28px] md:grid-cols-[220px_1fr_40px] items-center gap-3">
              <span className="text-[12px] text-ink truncate">{x.rotulo}</span>
              <div className="h-2 surface-alt rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(3, (x.n / maxMotivo) * 100)}%`, background: x.motivo === 'urgencia' ? '#ef4444' : '#a78bfa' }} /></div>
              <span className="font-mono text-[10px] text-body-muted text-right">{x.n}</span>
            </div>
          ))}
          {!motivos.length && <p className="text-[12px] text-body-muted">Nenhuma passagem no período.</p>}
        </div>
      </div>
      <p className="text-[11px] text-body-faint leading-relaxed pt-3 border-t border-line-soft">
        {m.desqualificados} desqualificado(s) pela planilha receberam a mensagem honesta (Defensoria ou redução pequena) sem ocupar a equipe. {m.clientes} cliente(s) do escritório perguntaram do processo e foram para a equipe com prazo de 24 horas.
      </p>
    </div>
  )
}
