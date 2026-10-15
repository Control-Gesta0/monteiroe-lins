'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export default function ToggleTema() {
  const [tema, setTema] = useState<'dark' | 'light'>('dark')
  useEffect(() => {
    setTema((document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark')
  }, [])
  const trocar = () => {
    const novo = tema === 'dark' ? 'light' : 'dark'
    setTema(novo)
    document.documentElement.setAttribute('data-theme', novo)
    try { localStorage.setItem('tema', novo) } catch { /* modo privado */ }
  }
  return (
    <button type="button" onClick={trocar} aria-label={tema === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
      className="w-8 h-8 rounded-[7px] border border-line-soft flex items-center justify-center text-body-muted hover:text-ink hover-raise">
      {tema === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  )
}
