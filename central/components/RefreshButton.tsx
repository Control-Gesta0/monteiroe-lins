'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

/** Atualização manual: dispara 'central:refresh' e cada fonte recarrega. */
export default function RefreshButton() {
  const [girando, setGirando] = useState(false)
  return (
    <button type="button" onClick={() => {
      setGirando(true)
      window.dispatchEvent(new Event('central:refresh'))
      setTimeout(() => setGirando(false), 900)
    }} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[8px] border border-line-soft text-[12px] text-body-mid hover:text-ink hover-raise">
      <RefreshCw size={13} className={girando ? 'animate-spin' : ''} /> Atualizar
    </button>
  )
}
