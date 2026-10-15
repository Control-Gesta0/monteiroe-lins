'use client'

import { useEffect, useState } from 'react'
import type { BaseEstado, ExecutionData, LiveData } from './types'

/**
 * Uma leitura por fonte, compartilhada: as subabas de Estatísticas e o
 * "Pergunte à Central" usam o mesmo dado por 1 minuto (trocar de subaba não
 * busca o CRM de novo). Refresh só manual: o botão dispara 'central:refresh'
 * (nada de polling martelando o CRM). Durante o refresh, o dado anterior fica.
 */
const VALIDADE = 60_000

interface Entrada { em: number; data?: unknown; erro?: string; buscando?: boolean }
const cache = new Map<string, Entrada>()
const ouvintes = new Map<string, Set<() => void>>()

function avisar(path: string) {
  ouvintes.get(path)?.forEach(f => f())
}

function buscar(path: string, forcar = false) {
  const atual = cache.get(path)
  if (atual?.buscando) return
  if (!forcar && atual && Date.now() - atual.em < VALIDADE) return
  const e: Entrada = { em: Date.now(), data: atual?.data, buscando: true }
  cache.set(path, e)
  avisar(path)
  fetch(path, { cache: 'no-store' })
    .then(r => r.json())
    .then(d => { if (d.error) { e.erro = String(d.error); e.data = undefined } else e.data = d })
    .catch(err => { e.erro = String(err) })
    .finally(() => { e.buscando = false; e.em = Date.now(); avisar(path) })
}

function useFonte<T>(path: string) {
  const [, render] = useState(0)
  useEffect(() => {
    const ouvir = () => render(n => n + 1)
    if (!ouvintes.has(path)) ouvintes.set(path, new Set())
    ouvintes.get(path)!.add(ouvir)
    buscar(path)
    const atualizar = () => buscar(path, true)
    window.addEventListener('central:refresh', atualizar)
    return () => { ouvintes.get(path)?.delete(ouvir); window.removeEventListener('central:refresh', atualizar) }
  }, [path])
  const e = cache.get(path)
  return {
    data: (e?.data ?? null) as (T & { demo?: boolean }) | null,
    erro: e?.erro ?? null,
    carregando: !e || (!!e.buscando && e.data === undefined),
  }
}

export const useExecutions = () => useFonte<ExecutionData>('/api/exec')
export const useLive = () => useFonte<LiveData>('/api/live')
export const useBase = () => useFonte<BaseEstado>('/api/base')

/** Ensinar avisa que a base mudou: a próxima tela que ler busca de novo. */
export function esquecer(path: string) {
  if (!cache.get(path)?.buscando) cache.delete(path)
}
