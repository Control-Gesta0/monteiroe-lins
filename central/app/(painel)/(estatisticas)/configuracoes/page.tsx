'use client'

import { AlertTriangle, CheckCircle2, Database, Server, Tags } from 'lucide-react'
import RefreshButton from '@/components/RefreshButton'
import { PageIntro, SectionTitle } from '@/components/ProductUI'
import { useExecutions, useLive } from '@/lib/hooks'

export default function Configuracoes() {
  const { data: live, erro: liveErro, carregando } = useLive()
  const { data: exec, erro: execErro } = useExecutions()
  const crmOk = !!live && live.saude.crmOk && !liveErro

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="SISTEMA" title="Conexões da" accent="Lia." description="Se o agente e o Kommo estão respondendo, e quem ela atende. Somente leitura." action={<RefreshButton />} />

      <section>
        <div className="grid md:grid-cols-3 gap-3">
          <Linha icon={Server} titulo="Agente (diário de execuções)" ok={!!exec && !execErro && !exec.saude24h.erros} carregando={!exec && !execErro}
            texto={execErro || (exec ? `${exec.saude24h.erros ? `${exec.saude24h.erros} erro(s) em ${exec.saude24h.total} execuções nas últimas 24h` : `sem erro nas últimas 24h (${exec.saude24h.total} execuções)`} · ${exec.cobertura.registros} no diário · modelo ${exec.modelo}` : 'verificando…')} />
          <Linha icon={Database} titulo="CRM (Kommo)" ok={crmOk} carregando={carregando}
            texto={liveErro || (live ? (live.saude.crmOk ? `Mapa conferido: etapas do ${live.pipeline.nome}, campos da Lia, tipos de tarefa e motivos de perda batem com a conta · ${live.leads.total} leads no funil` : `${live.saude.problemas.length} divergência(s)`) : 'verificando…')} />
          <Linha icon={Tags} titulo="Quem a Lia atende" ok neutro carregando={!live}
            texto={live ? `${regraGate(live.regras)} Agenda: ${live.regras.expediente}.` : 'verificando…'} />
        </div>
      </section>

      {live && live.saude.problemas.length > 0 && (
        <section className="panel p-5 md:p-6">
          <SectionTitle eyebrow="DIVERGÊNCIAS NO KOMMO" title="O que conferir no Kommo." description="Etapa ou campo renomeado ou apagado faz a Lia gravar no lugar errado ou não mover o lead." />
          <ul className="space-y-2">
            {live.saude.problemas.map(p => <li key={p} className="text-[12.5px] text-warning flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{p}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}

function regraGate(r: { modoGate: string; gateTag: string; humanTag: string }) {
  const base = r.modoGate === 'todos' ? 'Todos os leads' : `Só leads com a tag “${r.gateTag}”`
  return `${base}, exceto quem tem “${r.humanTag}” ou recebeu mensagem de alguém da equipe nas últimas 6 horas. Quando a Lia encerra, a tag “${r.gateTag}” sai.`
}

function Linha({ icon: Icon, titulo, texto, ok, neutro, carregando }: { icon: typeof Server; titulo: string; texto: string; ok: boolean; neutro?: boolean; carregando?: boolean }) {
  const cor = carregando ? 'text-body-muted' : neutro ? 'text-body-muted' : ok ? 'text-success' : 'text-warning'
  return (
    <div className="panel p-5 flex items-start gap-4">
      <span className="metric-icon text-cyan bg-cyan/[0.07] border-cyan/20 shrink-0"><Icon size={15} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-ink">{titulo}</span>
          {!carregando && !neutro && (ok ? <CheckCircle2 size={13} className={cor} /> : <AlertTriangle size={13} className={cor} />)}
        </div>
        <p className={`text-[12px] leading-relaxed mt-1 break-words ${ok || neutro ? 'text-body-mid' : cor}`}>{texto}</p>
      </div>
    </div>
  )
}
