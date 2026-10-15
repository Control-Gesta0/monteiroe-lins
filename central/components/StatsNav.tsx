'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, BarChart3, LayoutDashboard, Settings2 } from 'lucide-react'

/** Subabas de Estatísticas: uma leitura por vez (padrão v4.1). */
export const SUBABAS = [
  { href: '/', label: 'Visão geral', Icon: LayoutDashboard },
  { href: '/operacao', label: 'Operação', Icon: Activity },
  { href: '/resultados', label: 'Resultados', Icon: BarChart3 },
  { href: '/configuracoes', label: 'Sistema', Icon: Settings2 },
]

export default function StatsNav() {
  const path = usePathname()
  return (
    <div className="max-w-full overflow-x-auto no-scrollbar mb-7">
      <nav className="segmented" aria-label="Estatísticas">
        {SUBABAS.map(({ href, label, Icon }) => {
          const ativo = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <Link key={href} href={href} aria-current={ativo ? 'page' : undefined} className={`whitespace-nowrap inline-flex items-center gap-1.5 ${ativo ? 'active' : ''}`}>
              <Icon size={13} /> {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
