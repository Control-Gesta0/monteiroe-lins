import type { VercelRequest, VercelResponse } from '@vercel/node'
import { CONFIG } from '../lib/config'
import { CRM_MAP } from '../lib/crm-map'
import { checkCrm } from '../lib/crm-check'

/**
 * CRM_MAP × Kommo VIVO + coerência interna. Rodar depois de QUALQUER mexida no
 * funil/campos e antes de cada deploy. { ok, problems[] }
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (String(req.query.secret || '') !== CONFIG.webhookSecret) return res.status(401).json({ error: 'unauthorized' })
  const { problems, avisos } = await checkCrm()
  return res.status(problems.length ? 500 : 200).json({ ok: problems.length === 0, cliente: CONFIG.clientName, portas: CRM_MAP.portas.map(p => `${p.menu ?? '-'}:${p.id}${p.ativa ? '' : '(inativa)'}`), problems, avisos })
}
