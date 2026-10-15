'use client'

import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface FocusItem<T extends string> {
  id: T
  label: string
  description: string
  icon: LucideIcon
}

export default function FocusNav<T extends string>({
  items,
  value,
  onChange,
  label = 'Escolha o que deseja ver',
}: {
  items: FocusItem<T>[]
  value: T
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <nav className="focus-nav" aria-label={label} style={{ '--focus-cols': items.length } as CSSProperties}>
      {items.map(item => {
        const Icon = item.icon
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            aria-current={active ? 'page' : undefined}
            className={active ? 'active' : ''}
          >
            <span className="focus-nav-icon"><Icon size={15} /></span>
            <span className="min-w-0 text-left">
              <span className="focus-nav-label">{item.label}</span>
              <span className="focus-nav-description">{item.description}</span>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
