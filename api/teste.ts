import type { VercelRequest, VercelResponse } from '@vercel/node'
import { centralAutorizada, corpo } from '../lib/central-auth'
import { custoHoje, falar, lerSessao, recomecar, type Opcoes } from '../lib/teste'

/**
 * Laboratório da Central (header x-central-secret). Nada vai para o Kommo, para a agenda nem para o WhatsApp.
 *   GET  ?sessao=<id>                                  → a conversa de teste
 *   POST {sessao, texto}                               → manda uma mensagem e recebe a resposta
 *   POST {sessao, acao:'recomecar', opcoes}            → começa do zero (perfil, versão)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!centralAutorizada(req)) return res.status(401).json({ error: 'unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method === 'GET') {
      const id = String(req.query.sessao || '')
      if (!/^[\w-]{8,64}$/.test(id)) return res.status(400).json({ error: 'sessao inválida' })
      return res.status(200).json({ sessao: await lerSessao(id), uso: await custoHoje() })
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'use GET ou POST' })
    const b = corpo(req)
    const id = String(b.sessao || '')
    if (!/^[\w-]{8,64}$/.test(id)) return res.status(400).json({ error: 'sessao inválida' })
    if (b.acao === 'recomecar') {
      const o = (b.opcoes || {}) as Partial<Opcoes>
      const opcoes: Partial<Opcoes> = {}
      if (o.perfil === 'novo' || o.perfil === 'cliente') opcoes.perfil = o.perfil
      if (o.versao === 'vigente' || o.versao === 'rascunho') opcoes.versao = o.versao
      return res.status(200).json({ sessao: await recomecar(id, opcoes), uso: await custoHoje() })
    }
    const r = await falar(id, String(b.texto || ''))
    return res.status(r.erro ? 409 : 200).json({ ...r, uso: await custoHoje() })
  } catch (e) {
    return res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) })
  }
}
