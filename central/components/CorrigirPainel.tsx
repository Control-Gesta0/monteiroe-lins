'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, FlaskConical, Loader2, PenLine, X } from 'lucide-react'
import MudancasBase from './MudancasBase'
import type { MsgConversa } from '@/lib/types'

const DESTINO: Record<string, { rotulo: string; cor: string }> = {
  base: { rotulo: 'TEXTO DA BASE ALTERADO NO RASCUNHO', cor: '#06b6d4' },
  nova_informacao: { rotulo: 'INFORMAÇÃO NOVA NO RASCUNHO', cor: '#06b6d4' },
  control_gestao: { rotulo: 'PEDIDO PARA A CONTROL GESTÃO', cor: '#a78bfa' },
  recusado: { rotulo: 'NÃO ENTRA NA BASE', cor: '#f59e0b' },
  pergunta: { rotulo: 'PRECISA DE MAIS DETALHE', cor: '#737373' },
  nenhum: { rotulo: 'NADA MUDOU NA BASE', cor: '#737373' },
}

/**
 * Painel de correção (Teste e Conversas reais): a conversa fica travada; a equipe diz
 * como deveria ser e por quê; a IA analisa e ajusta o que ela sabe (aba Ensinar) no rascunho.
 */
export default function CorrigirPainel({ origem, nome, cliente, resposta, pedido, resultado, onResultado, onFechar, onTestarRascunho, onMudou }: {
  origem: 'teste' | 'real'
  nome?: string
  cliente: string
  resposta: string
  /** corpo do POST /api/base sem os campos da equipe: {acao:'corrigir', sessao, mensagem} ou {acao:'corrigir_real', contato, ts} */
  pedido: Record<string, unknown>
  resultado?: MsgConversa
  onResultado: (r: MsgConversa) => void
  onFechar: () => void
  /** no Teste: recomeça usando o rascunho; nas conversas reais vira link para o Teste */
  onTestarRascunho?: () => void
  /** a base mudou (correção desfeita): quem abriu o painel recarrega */
  onMudou?: () => void
}) {
  const [comoDeveria, setComoDeveria] = useState('')
  const [porque, setPorque] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [desfeita, setDesfeita] = useState(false)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])

  const enviar = async () => {
    setEnviando(true); setErro(null)
    try {
      const r = await fetch('/api/base', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...pedido, comoDeveria, porque }) })
      const d = await r.json()
      if (!r.ok || !d.resposta) setErro(d.erro || d.error || 'A IA não respondeu. Tente de novo.')
      else onResultado(d.resposta)
    } catch (e) { setErro(`Não consegui falar com o agente: ${e instanceof Error ? e.message : String(e)}`) }
    setEnviando(false)
  }
  const desfazer = async () => {
    if (!resultado) return
    const r = await fetch('/api/base', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'desfazer', mensagem: resultado.id }) })
    const d = await r.json()
    if (r.ok) { setDesfeita(true); onMudou?.() } else setErro(d.erro || d.error || 'Não deu para desfazer.')
  }

  // portal no body: o painel cobre a tela inteira (dentro do <main> ele herdava o deslocamento do layout)
  return createPortal(
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/50 backdrop-blur-[2px]" onMouseDown={e => { if (e.currentTarget === e.target) onFechar() }}>
      <aside className="h-full w-full max-w-[560px] command-panel overflow-y-auto scroll-thin" style={{ borderRadius: 0 }} role="dialog" aria-modal="true" aria-label="Corrigir resposta">
        <div className="sticky top-0 z-10 px-5 py-4 border-b border-line-soft flex items-center gap-3" style={{ background: 'var(--surface)' }}>
          <span className="w-8 h-8 rounded-lg border border-cyan/25 bg-cyan/[0.08] text-cyan flex items-center justify-center"><PenLine size={15} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium text-ink">Corrigir esta resposta{origem === 'real' ? ` · conversa real${nome ? ` com ${nome}` : ''}` : ''}</div>
            <div className="text-[10.5px] text-body-muted">A IA ajusta o que a Lia sabe, no rascunho. Nada muda no WhatsApp antes de publicar.</div>
          </div>
          <button type="button" onClick={onFechar} className="p-2 rounded-lg text-body-muted hover:text-ink" aria-label="Fechar"><X size={15} /></button>
        </div>

        <div className="p-5 space-y-5">
          {cliente && (
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-body-muted">O lead escreveu{origem === 'real' ? ' (CPF, CNPJ e telefone mascarados)' : ''}</div>
              <div className="mt-1.5 rounded-[10px] bg-cyan/[0.10] border border-cyan/25 px-3.5 py-2.5 text-[12.5px] text-ink whitespace-pre-wrap break-words">{cliente}</div>
            </div>
          )}
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-body-muted">A Lia respondeu</div>
            <div className="mt-1.5 rounded-[10px] surface-alt border border-line-soft px-3.5 py-2.5 text-[12.5px] text-ink whitespace-pre-wrap break-words">{resposta}</div>
          </div>

          {!resultado ? (
            <div className="space-y-4">
              <label className="block">
                <span className="text-[12.5px] font-medium text-ink">Como deveria ser</span>
                <textarea value={comoDeveria} onChange={e => setComoDeveria(e.target.value)} rows={3} placeholder="Ex.: deveria responder que a análise é gratuita antes de pedir o contracheque"
                  className="campo mt-1.5 w-full rounded-[8px] px-3.5 py-2.5 text-[13px] resize-y" />
              </label>
              <label className="block">
                <span className="text-[12.5px] font-medium text-ink">Por que está errado</span>
                <textarea value={porque} onChange={e => setPorque(e.target.value)} rows={3} placeholder="Ex.: ela não respondeu o que o lead perguntou"
                  className="campo mt-1.5 w-full rounded-[8px] px-3.5 py-2.5 text-[13px] resize-y" />
              </label>
              {erro && <p className="text-[12px] text-warning">{erro}</p>}
              <button type="button" onClick={enviar} disabled={enviando || (!comoDeveria.trim() && !porque.trim())}
                className="w-full inline-flex items-center justify-center gap-2 rounded-[8px] border border-cyan/30 bg-cyan/[0.12] text-cyan py-3 text-[13px] font-medium disabled:opacity-40">
                {enviando ? <><Loader2 size={14} className="animate-spin" /> A IA está analisando… (uns 10 segundos)</> : <>Pedir para a IA corrigir <ArrowRight size={14} /></>}
              </button>
              <p className="text-[10.5px] text-body-faint leading-relaxed">Basta preencher um dos dois. Texto ou informação errada, a IA muda na base. Regra de atendimento (ordem das perguntas, quando passar para a equipe) vira pedido para a Control Gestão.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-[10px] surface-alt border border-line-soft px-3.5 py-3">
                {resultado.destino && <div className="font-mono text-[8.5px] tracking-[0.1em] mb-1.5" style={{ color: DESTINO[resultado.destino]?.cor }}>{DESTINO[resultado.destino]?.rotulo}</div>}
                <p className="text-[12.5px] text-ink whitespace-pre-wrap break-words">{resultado.texto}</p>
              </div>
              {resultado.analise?.comoDeveria && (
                <div className="rounded-[10px] border border-success/30 bg-success/[0.05] px-3.5 py-3">
                  <div className="font-mono text-[9px] tracking-[0.12em] text-success">COMO DEVERIA SER</div>
                  <p className="text-[12.5px] text-ink whitespace-pre-wrap break-words mt-1.5">{resultado.analise.comoDeveria}</p>
                </div>
              )}
              {resultado.analise?.porque && (
                <div className="rounded-[10px] border border-warning/30 bg-warning/[0.05] px-3.5 py-3">
                  <div className="font-mono text-[9px] tracking-[0.12em] text-warning">POR QUE ESTAVA ERRADO</div>
                  <p className="text-[12.5px] text-ink whitespace-pre-wrap break-words mt-1.5">{resultado.analise.porque}</p>
                </div>
              )}
              {resultado.mudancas && resultado.mudancas.length > 0 && (
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-body-muted mb-2">O que mudou na base (rascunho)</div>
                  <MudancasBase mudancas={resultado.mudancas} desfeita={desfeita || resultado.desfeita} onDesfazer={desfazer} />
                </div>
              )}
              {erro && <p className="text-[12px] text-warning">{erro}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                {resultado.mudancas && resultado.mudancas.length > 0 && !desfeita && (onTestarRascunho ? (
                  <button type="button" onClick={onTestarRascunho} className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-[8px] border border-cyan/30 bg-cyan/[0.12] text-cyan text-[12.5px] font-medium">
                    <FlaskConical size={13} /> Testar de novo com o rascunho
                  </button>
                ) : (
                  <Link href="/teste?versao=rascunho" className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-[8px] border border-cyan/30 bg-cyan/[0.12] text-cyan text-[12.5px] font-medium">
                    <FlaskConical size={13} /> Testar no laboratório com o rascunho
                  </Link>
                ))}
                {origem === 'teste' && <Link href="/ensinar" className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-[8px] border border-line-soft text-[12.5px] text-body-mid hover:text-ink">
                  Abrir Ensinar <ArrowRight size={13} />
                </Link>}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}
