'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Command, Search, ShieldCheck, X } from 'lucide-react'
import { answerCentral, type CentralAnswer } from '@/lib/intelligence'
import { useExecutions, useLive } from '@/lib/hooks'

const SUGESTOES = [
  'Quantos foram passados para a equipe?',
  'A operação teve erros?',
  'Quanto estamos gastando?',
  'Quantos eram clientes?',
  'E fora do horário?',
]

export default function CentralCommand() {
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAberto(v => !v)
      }
      if (e.key === 'Escape') setAberto(false)
    }
    const abrir = () => setAberto(true)
    window.addEventListener('keydown', key)
    window.addEventListener('central:perguntar', abrir)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('central:perguntar', abrir) }
  }, [])

  // o painel (e a leitura dos dados) só existe aberto: Teste e Ensinar não buscam CRM à toa
  return <AnimatePresence>{aberto && <Painel fechar={() => setAberto(false)} />}</AnimatePresence>
}

function Painel({ fechar }: { fechar: () => void }) {
  const [pergunta, setPergunta] = useState('')
  const [answer, setAnswer] = useState<CentralAnswer | null>(null)
  const { data: live, carregando: c1 } = useLive()
  const { data: exec, carregando: c2 } = useExecutions()
  const carregando = c1 || c2

  const perguntar = (q = pergunta) => {
    const limpa = q.trim()
    if (!limpa) return
    setPergunta(limpa)
    setAnswer(answerCentral(limpa, live, exec))
  }

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-sm flex items-start justify-center p-3 pt-[10vh] md:pt-[14vh]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={e => { if (e.currentTarget === e.target) fechar() }}
    >
      <motion.div
        initial={{ opacity: 0, y: 14, scale: .985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: .99 }}
        className="w-full max-w-[720px] command-panel overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-line-soft flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg border border-cyan/25 bg-cyan/[0.08] text-cyan flex items-center justify-center">
            <Command size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-medium text-ink">Pergunte à Central</div>
            <div className="text-[10.5px] text-body-muted">Respostas calculadas com seus dados · zero tokens</div>
          </div>
          <button onClick={fechar} className="p-2 rounded-lg text-body-muted hover:text-ink hover-raise" aria-label="Fechar">
            <X size={15} />
          </button>
        </div>

        <div className="p-5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-body-faint" />
              <input
                autoFocus
                value={pergunta}
                onChange={e => setPergunta(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') perguntar() }}
                placeholder="Ex.: quantas reuniões a Lia marcou?"
                className="campo w-full rounded-xl pl-11 pr-4 py-3.5 text-[14px]"
              />
            </div>
            <button onClick={() => perguntar()} disabled={!pergunta.trim() || carregando} className="px-4 rounded-xl border border-cyan/30 bg-cyan/[0.12] text-cyan disabled:opacity-30">
              <ArrowRight size={17} />
            </button>
          </div>

          {!answer && (
            <div className="flex flex-wrap gap-2 mt-4">
              {SUGESTOES.map(s => (
                <button key={s} onClick={() => perguntar(s)} className="px-3 py-2 rounded-full border border-line-soft text-[11.5px] text-body-mid hover:text-ink hover:border-cyan/25 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          )}

          {answer && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-5 panel p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck size={17} className="text-success mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] text-ink leading-relaxed">{answer.answer}</p>
                  {answer.evidence.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      {answer.evidence.map((e, i) => <div key={i} className="text-[11.5px] text-body-mid">• {e}</div>)}
                    </div>
                  )}
                  {answer.href && (
                    <Link href={answer.href} onClick={fechar} className="inline-flex items-center gap-1.5 text-[11.5px] text-cyan mt-4">
                      {answer.label || 'Abrir detalhe'} <ArrowRight size={12} />
                    </Link>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
