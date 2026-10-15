'use client'

import { useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import { entrar, type EstadoLogin } from './acoes'

export default function FormLogin() {
  const [estado, acao, pendente] = useActionState<EstadoLogin, FormData>(entrar, {})
  const de = useSearchParams().get('de') ?? '/'
  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="de" value={de} />
      <label htmlFor="senha" className="block text-[12px] text-body-mid">Senha de acesso</label>
      <input id="senha" name="senha" type="password" autoComplete="current-password" autoFocus required
        className="campo w-full rounded-[8px] px-3.5 py-3 text-[14px]" />
      {estado.erro && <p className="text-[12px] text-danger">{estado.erro}</p>}
      <button type="submit" disabled={pendente}
        className="w-full rounded-[8px] border border-cyan/30 bg-cyan/[0.12] text-cyan py-3 text-[13px] font-medium disabled:opacity-40">
        {pendente ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}
