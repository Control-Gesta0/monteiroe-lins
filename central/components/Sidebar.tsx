'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Compass, FlaskConical, GraduationCap, LogOut, Sparkles } from 'lucide-react'
import Logo from './Logo'
import ToggleTema from './ToggleTema'
import { sair } from '@/app/login/acoes'
import { abrirPergunta } from '@/lib/pergunta'

export const NOME_CLIENTE = 'Monteiro & Lins'
/** a Lia, assistente virtual da Monteiro & Lins Advocacia no WhatsApp (feminino nos textos: "a Lia") */
export const NOME_AGENTE = 'Lia'
export const SISTEMA_VERSAO = 'CENTRAL V5 · 4 ABAS'

const ESTATISTICAS = ['/', '/operacao', '/resultados', '/configuracoes']

const NAV = [
  { href: '/', label: 'Estatísticas', hint: 'operação e resultados', Icon: BarChart3 },
  { href: '/teste', label: 'Teste', hint: 'converse com a Lia', Icon: FlaskConical },
  { href: '/ensinar', label: 'Ensinar', hint: 'o que ela sabe', Icon: GraduationCap },
  { href: '/como-usar', label: 'Como usar', hint: 'passo a passo e fluxo', Icon: Compass },
]

function ativo(path: string, href: string) {
  if (href === '/') return ESTATISTICAS.some(h => (h === '/' ? path === '/' : path.startsWith(h)))
  return path.startsWith(href)
}

export default function Sidebar() {
  const path = usePathname()
  return (
    <>
      <aside className="w-[248px] shrink-0 sticky top-0 h-screen hidden md:flex flex-col border-r border-line-soft sidebar-shell">
        <div className="px-6 py-7 border-b border-line-soft flex items-start justify-between">
          <div>
            <Logo altura={34} />
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-body-muted mt-2.5">Central de Inteligência</div>
          </div>
          <ToggleTema />
        </div>

        <div className="px-4 pt-5 pb-2">
          <div className="rounded-[8px] border border-line-soft px-3.5 py-3">
            <div className="text-[12.5px] font-medium text-ink">{NOME_AGENTE}</div>
            <div className="text-[11px] text-body-muted mt-1">{NOME_CLIENTE}</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-1">
          {NAV.map(({ href, label, hint, Icon }) => {
            const active = ativo(path, href)
            return (
              <Link key={href} href={href}
                className={`group flex items-center gap-3 px-3.5 py-3 rounded-[7px] border transition-all ${
                  active ? 'text-cyan border-cyan/25 bg-cyan/[0.08]' : 'text-body-mid border-transparent hover:text-ink hover:bg-ink/[0.035]'
                }`}>
                <Icon size={16} strokeWidth={2} className="shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium">{label}</span>
                  <span className="block font-mono text-[8.5px] uppercase tracking-[0.08em] text-body-faint mt-0.5">{hint}</span>
                </span>
              </Link>
            )
          })}
        </nav>

        <div className="px-3 pb-3">
          <button type="button" onClick={abrirPergunta}
            className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-[7px] border border-cyan/20 bg-cyan/[0.05] text-cyan hover:bg-cyan/[0.1] transition-colors">
            <Sparkles size={15} className="shrink-0" />
            <span className="text-[12.5px] font-medium flex-1 text-left whitespace-nowrap">Pergunte à Central</span>
            <kbd className="font-mono text-[8px] px-1.5 py-0.5 rounded border border-cyan/30 opacity-80">Ctrl K</kbd>
          </button>
        </div>

        <div className="px-6 py-5 border-t border-line-soft flex items-end justify-between gap-2">
          <div className="font-mono text-[9px] text-body-faint tracking-wide">{SISTEMA_VERSAO}</div>
          <form action={sair}>
            <button type="submit" className="text-body-faint hover:text-ink" aria-label="Sair"><LogOut size={13} /></button>
          </form>
        </div>
      </aside>

      <div className="md:hidden sticky top-0 z-50 border-b border-line-soft sidebar-shell px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <Logo altura={26} />
          <div className="flex items-center gap-2">
            <button type="button" onClick={abrirPergunta} aria-label="Pergunte à Central"
              className="w-8 h-8 rounded-[7px] border border-cyan/25 bg-cyan/[0.06] text-cyan flex items-center justify-center"><Sparkles size={14} /></button>
            <ToggleTema />
          </div>
        </div>
        <nav className="grid grid-cols-4 gap-1">
          {NAV.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className={`min-w-0 flex flex-col items-center gap-1 px-1 py-1.5 rounded-[6px] text-[10.5px] border whitespace-nowrap ${
              ativo(path, href) ? 'text-cyan border-cyan/25 bg-cyan/[0.08]' : 'text-body-muted border-transparent'
            }`}>
              <Icon size={14} /> {label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  )
}
