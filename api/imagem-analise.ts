import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { primeiroNome } from '../lib/base-core'
import { getLead } from '../lib/kommo'
import { chaveImagem, pngDaAnalise } from '../lib/imagem-analise'
import { kommoPort } from '../lib/port'
import { getState } from '../lib/state'

/**
 * PNG da análise do contracheque de um lead (lib/imagem-analise.ts). A Stevo baixa por
 * aqui para mandar no WhatsApp; a equipe abre pelo link da nota no card. Chave por lead.
 */

function igual(a: string, b: string): boolean {
  if (!a || !b) return false
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest())
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'method' })
  const leadId = Number(req.query.lead)
  if (!leadId || !igual(String(req.query.k || ''), chaveImagem(leadId))) return res.status(401).json({ error: 'unauthorized' })
  const a = (await getState(leadId)).analise
  if (!a || a.bruta === undefined || a.obrigatorios === undefined) return res.status(404).json({ error: 'sem análise com os números completos' })

  const contato = await kommoPort(leadId).contato?.().catch(() => null)
  const nome = primeiroNome(contato?.nome || (await getLead(leadId)).name || '')
  const png = await pngDaAnalise({
    nome, orgao: a.orgao || '', competencia: a.competencia || '', bruta: a.bruta, obrigatorios: a.obrigatorios,
    emprestimo: a.emprestimo || 0, cartaoConsignado: a.cartaoConsignado || 0, cartaoBeneficio: a.cartaoBeneficio || 0, limite: a.margem ?? 0.4, alcance: a.alcance ?? 'global',
  })
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Content-Length', String(png.length))
  res.setHeader('Cache-Control', 'private, max-age=600')
  return res.status(200).send(req.method === 'HEAD' ? '' : png)
}
