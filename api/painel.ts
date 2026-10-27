import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { CONFIG } from '../lib/config'
import { montarPainel } from '../lib/painel'
import { PAGINA_PAINEL } from '../lib/painel-html'

/**
 * Painel de gestão da Monteiro & Lins.
 *  GET /api/painel?k=<chave>                           → a página (sem dado nenhum)
 *  GET /api/painel?formato=json  (header x-painel-chave) → os dados (90 s de cache; &atualizar=1 força)
 * Chaves: PAINEL_SECRET (a do escritório: só o painel) ou WEBHOOK_SECRET (Control Gestão:
 * vê também as URLs de webhook, que levam a chave de cada número).
 */

function igual(a: string, b: string): boolean {
  if (!a || !b) return false
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest())
}

export function perfilDaChave(chave: string): 'agencia' | 'escritorio' | null {
  if (igual(chave, CONFIG.webhookSecret)) return 'agencia'
  if (igual(chave, CONFIG.painelSecret)) return 'escritorio'
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method' })
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Robots-Tag', 'noindex')
  if (req.query.formato !== 'json') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Referrer-Policy', 'no-referrer')
    return res.status(200).send(PAGINA_PAINEL)
  }
  const bruta = req.headers['x-painel-chave']
  const perfil = perfilDaChave(String((Array.isArray(bruta) ? bruta[0] : bruta) || ''))
  if (!perfil) return res.status(401).json({ error: 'unauthorized' })
  try {
    const dados = await montarPainel(req.query.atualizar === '1')
    // As URLs de webhook têm a chave de cada número: só a Control Gestão (quem configura a Stevo) vê
    if (perfil !== 'agencia') {
      return res.status(200).json({ ...dados, conexoes: (dados.conexoes as Array<Record<string, unknown>>).map(({ webhook: _w, ...c }) => c) })
    }
    return res.status(200).json(dados)
  } catch (e) {
    console.error('[painel] falha montando o painel:', e)
    return res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 200) })
  }
}
