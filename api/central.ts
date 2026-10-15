import type { VercelRequest, VercelResponse } from '@vercel/node'
import { buildConversas, buildExecutionData, buildFunil, type KommoLeadResumo, type LiveData } from '../lib/central-data'
import { centralAutorizada } from '../lib/central-auth'
import { CONFIG } from '../lib/config'
import { checkCrm } from '../lib/crm-check'
import { CRM_MAP } from '../lib/crm-map'
import { readExecs } from '../lib/execlog'
import { leadsFechadosDesde, leadsInStatuses } from '../lib/kommo'

/**
 * Leitura da Central (painel). Só leitura, zero tokens.
 * GET /api/central?recurso=execucoes|live  (header x-central-secret)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!centralAutorizada(req)) return res.status(401).json({ error: 'unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  const recurso = String(req.query.recurso || '')
  try {
    if (recurso === 'execucoes') return res.status(200).json(await execucoes())
    if (recurso === 'live') return res.status(200).json(await live())
    return res.status(400).json({ error: 'recurso inválido (execucoes | live)' })
  } catch (e) {
    return res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) })
  }
}

async function execucoes() {
  return buildExecutionData(await readExecs(2000), CONFIG.usdBrl, CONFIG.llmModel, Date.now(), CONFIG.kommoDomain)
}

async function live(): Promise<LiveData> {
  const base = buildConversas((await execucoes()).execucoes)
  // Fail-closed: CRM que não responde vira atenção, nunca "saudável"
  const mapa = await checkCrm()
  const problemas = [...mapa.problems]
  let leads: KommoLeadResumo[] = []
  if (mapa.etapas.length) {
    try {
      // Abertos: todas as etapas menos ganho/perdido (a API devolve os mais antigos primeiro: ler tudo truncaria nos fechados)
      const abertas = mapa.etapas.filter(e => e.id !== 142 && e.id !== 143).map(e => e.id)
      const [abertos, fechados] = await Promise.all([
        leadsInStatuses(CRM_MAP.sdr.pipelineId, abertas),
        leadsFechadosDesde(CRM_MAP.sdr.pipelineId, Math.floor(Date.now() / 1000) - 30 * 86400),
      ])
      leads = [...abertos, ...fechados]
    } catch (e) {
      problemas.push(`O Kommo não respondeu à leitura do funil: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`)
    }
  }
  return {
    geradoEm: new Date().toISOString(),
    ...base,
    pipeline: { nome: 'Funil/SDR' },
    ...buildFunil(mapa.etapas, leads, CONFIG.gateTag, CRM_MAP.sdr.etapasDaIA),
    regras: {
      modoGate: CONFIG.gateTag ? 'tag' : 'todos',
      gateTag: CONFIG.gateTag,
      humanTag: CONFIG.humanTag,
      expediente: 'a Lia responde a qualquer hora; reuniões só quinta o dia todo e terça e quarta à tarde',
    },
    saude: { crmOk: problemas.length === 0, problemas },
  }
}
