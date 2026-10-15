'use client'

import { Undo2 } from 'lucide-react'
import type { MudancaBase } from '@/lib/types'

/** Diferença por linha (LCS): o que saiu em vermelho, o que entrou em verde. */
function diffLinhas(antes: string, depois: string): Array<{ t: '+' | '-' | '='; l: string }> {
  const a = antes ? antes.split('\n') : []
  const b = depois ? depois.split('\n') : []
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: Array<{ t: '+' | '-' | '='; l: string }> = []
  let i = 0, j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push({ t: '=', l: a[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: '-', l: a[i++] })
    else out.push({ t: '+', l: b[j++] })
  }
  while (i < m) out.push({ t: '-', l: a[i++] })
  while (j < n) out.push({ t: '+', l: b[j++] })
  return out
}

const ROTULO: Record<MudancaBase['tipo'], string> = { trocar: 'TEXTO ALTERADO', nova: 'INFORMAÇÃO NOVA', remover: 'INFORMAÇÃO REMOVIDA' }

export default function MudancasBase({ mudancas, desfeita, onDesfazer, ocupado }: { mudancas: MudancaBase[]; desfeita?: boolean; onDesfazer?: () => void; ocupado?: boolean }) {
  return (
    <div className="space-y-2.5 w-full">
      {mudancas.map(m => {
        const linhas = diffLinhas(m.antes, m.depois)
        // só as linhas que mudaram e uma de contexto em volta
        const mudou = (k: number) => !!linhas[k] && linhas[k].t !== '='
        const mostrar = linhas.map((_x, k) => mudou(k) || mudou(k - 1) || mudou(k + 1))
        return (
          <div key={m.id} className={`rounded-[8px] border border-line-soft overflow-hidden ${desfeita ? 'opacity-50' : ''}`}>
            <div className="px-3 py-2 border-b border-line-soft flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[8.5px] tracking-[0.1em] text-cyan">{ROTULO[m.tipo]}</span>
              <span className="text-[12px] text-ink font-medium">{m.titulo}</span>
              {desfeita && <span className="font-mono text-[8.5px] text-body-faint">DESFEITA</span>}
            </div>
            <div className="px-3 py-2 font-space text-[11.5px] leading-relaxed space-y-0.5 max-h-64 overflow-y-auto scroll-thin">
              {linhas.map((x, k) => !mostrar[k] ? null : (
                <div key={k} className={`whitespace-pre-wrap break-words px-1.5 rounded-[3px] ${x.t === '+' ? 'bg-success/[0.12] text-ink' : x.t === '-' ? 'bg-danger/[0.10] text-body-mid line-through' : 'text-body-faint'}`}>
                  <span className="font-mono text-[10px] mr-1.5 select-none">{x.t === '=' ? ' ' : x.t}</span>{x.l || ' '}
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {onDesfazer && !desfeita && (
        <button type="button" onClick={onDesfazer} disabled={ocupado} className="inline-flex items-center gap-1.5 text-[11px] text-body-faint hover:text-ink disabled:opacity-40">
          <Undo2 size={11} /> desfazer esta mudança
        </button>
      )}
    </div>
  )
}
