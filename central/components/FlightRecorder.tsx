'use client'

import { AlertTriangle, Bot, CheckCircle2, CircleDollarSign, Clock3, Cpu, MessageSquareText, Route, ShieldCheck } from 'lucide-react'
import { brl, dataHora, DECISAO_ROTULO, MOTIVO_ROTULO } from '@/lib/format'
import type { Execution } from '@/lib/types'

const MARCO: Record<string, { label: string; color: string }> = {
  agendou: { label: 'REUNIÃO MARCADA', color: '#22c55e' },
  desqualificou: { label: 'DESQUALIFICADO PELA PLANILHA', color: '#737373' },
  revisao: { label: 'EQUIPE CONFERE O CONTRACHEQUE', color: '#f59e0b' },
  passou: { label: 'PASSOU PARA A EQUIPE', color: '#a78bfa' },
}

/** Rótulos das ferramentas da Lia (lib/tools.ts do agente). */
export const TOOL: Record<string, string> = {
  analisar_contracheque: 'analisou o contracheque com a planilha do escritório',
  consultar_horarios: 'consultou os horários livres da agenda',
  agendar_reuniao: 'marcou a reunião (campo Agendamento, tarefa "Agendamento IA", etapa Reunião Agendada)',
  finalizar_atendimento: 'passou para a equipe (tarefa com prazo de 24 horas, nota com o resumo)',
  registrar_respondente: 'anotou quem está escrevendo',
  salvar_respostas: 'gravou respostas no lead',
  'trava:texto-aprovado': 'mensagem aprovada saiu pelo sistema',
  'trava:atendimento-24h': 'mensagem fixa de 24 horas (cliente do escritório)',
}

function resumoLinha(e: Execution): string {
  if (e.tipo === 'finalizou') return MOTIVO_ROTULO[e.motivo || 'outro'] || e.motivo || 'encerrou'
  if (e.tipo === 'reset') return 'reset de teste'
  if (e.tipo === 'resposta') return e.decisao ? `contracheque: ${DECISAO_ROTULO[e.decisao] || e.decisao}` : e.perfil === 'cliente' ? 'cliente do escritório' : e.perfil === 'nao_cliente' ? 'lead novo' : 'respondeu'
  return e.detalhe
}

/** Replay de uma execução, com o que já está gravado no diário: nenhuma chamada extra ao modelo. */
export default function FlightRecorder({ execution: e }: { execution: Execution }) {
  const Icon = e.resultado === 'respondeu' ? CheckCircle2 : e.resultado === 'erro' ? AlertTriangle : Clock3
  const color = e.resultado === 'respondeu' ? 'text-success' : e.resultado === 'erro' ? 'text-danger' : 'text-body-muted'
  const marco = e.marco ? MARCO[e.marco] : null
  const tokens = e.custo ? e.custo.tokens.input + e.custo.tokens.output : 0

  return (
    <details className="panel group overflow-hidden">
      <summary className="list-none cursor-pointer px-4 md:px-5 py-4 flex items-center gap-3 md:gap-4 hover-raise">
        <span className={`w-8 h-8 shrink-0 rounded-lg border border-line bg-[var(--surface-2)] flex items-center justify-center ${color}`}>
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-medium text-ink">{e.nome}</span>
            <span className="text-[11.5px] text-body-mid">{resumoLinha(e)}</span>
            {marco && <span className="font-mono text-[8.5px] tracking-[0.1em] px-1.5 py-0.5 rounded border" style={{ color: marco.color, borderColor: `${marco.color}40` }}>{marco.label}</span>}
          </div>
          <div className="font-mono text-[9px] text-body-faint mt-1">
            {dataHora(e.ts)}{e.duracaoMs ? ` · ${(e.duracaoMs / 1000).toFixed(1)}s` : ''}{e.travas.length ? ` · ${e.travas.length} trava(s)` : ''}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="inline-flex items-center gap-1 font-mono text-[10px] text-success">
            <CircleDollarSign size={11} />{e.custo ? brl(e.custo.totalBrl, 3) : '—'}
          </div>
          <div className="text-[9px] text-body-faint mt-1 group-open:hidden">abrir</div>
        </div>
      </summary>

      <div className="px-4 md:px-5 pb-6 pt-5 border-t border-line-soft">
        <div className="relative ml-3 border-l border-line pl-6 space-y-6">
          {e.tipo !== 'reset' && (
            <Step icon={MessageSquareText} color="#06b6d4" label="O que o lead escreveu" detail={e.turnoLead || 'Texto não guardado (execução anterior a esta versão do diário).'} />
          )}
          <Step icon={Cpu} color="#3b82f6" label="Processamento"
            detail={e.custo ? `${e.custo.tokens.chamadas} chamada(s) ao modelo · ${tokens.toLocaleString('pt-BR')} tokens (${e.custo.tokens.cached.toLocaleString('pt-BR')} em cache)` : e.resultado === 'pulou' ? 'A IA não processou esta mensagem.' : 'Consumo não registrado.'} />
          <Step icon={Route} color={e.tools.length ? '#a78bfa' : '#737373'} label="Ações no Kommo"
            detail={e.tools.length ? e.tools.map(t => TOOL[t] || t).join(' → ') : 'Nenhuma ação no Kommo nesta execução.'} />
          {e.travas.length > 0 && (
            <Step icon={ShieldCheck} color="#f59e0b" label="Travas que corrigiram a resposta" detail={e.travas.join(' · ')} />
          )}
          {(e.marco === 'passou' || e.marco === 'revisao') && (
            <Step icon={Route} color="#a78bfa" label="Resumo que foi para o lead no Kommo" detail={e.detalhe.replace(/ · salesbot\/run disparado$/, '') || 'Sem resumo registrado.'} />
          )}
          <Step icon={Bot} color={e.resultado === 'erro' ? '#ef4444' : '#22c55e'}
            label={e.resultado === 'erro' ? 'Erro' : e.resultado === 'pulou' ? 'Motivo de não responder' : e.tipo === 'reset' ? 'O que o reset fez' : 'O que a Lia enviou'}
            detail={e.tipo === 'reset' || e.resultado !== 'respondeu' ? e.detalhe : (e.respostaIA || 'Texto não guardado (execução anterior a esta versão do diário).')} />
        </div>
      </div>
    </details>
  )
}

function Step({ icon: Icon, color, label, detail }: { icon: typeof Bot; color: string; label: string; detail: string }) {
  return (
    <div className="relative">
      <span className="absolute -left-[39px] top-0 w-6 h-6 rounded-full border flex items-center justify-center bg-[var(--surface)]" style={{ color, borderColor: `${color}40` }}>
        <Icon size={11} />
      </span>
      <div className="text-[12.5px] font-medium text-ink">{label}</div>
      <p className="text-[11.5px] leading-relaxed text-body-mid mt-1 whitespace-pre-wrap break-words max-w-[820px]">{detail}</p>
    </div>
  )
}
