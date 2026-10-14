import type { VercelRequest, VercelResponse } from '@vercel/node'
import { CONFIG } from '../lib/config'
import { CRM_MAP } from '../lib/crm-map'
import { kommoGet } from '../lib/kommo'
import { loadPromptFile } from '../lib/llm'

/**
 * CRM_MAP × Kommo VIVO + coerência interna. Rodar depois de QUALQUER mexida no
 * funil/campos e antes de cada deploy. { ok, problems[] }
 */

interface LiveField { id: number; name: string; type: string; enums?: Array<{ id: number; value: string }> | null }
interface LivePipeline { id: number; name: string; _embedded?: { statuses?: Array<{ id: number; name: string }> } }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (String(req.query.secret || '') !== CONFIG.webhookSecret) return res.status(401).json({ error: 'unauthorized' })
  const problems: string[] = []
  const avisos: string[] = []

  // Offline
  if (!CRM_MAP.respostaFieldId) problems.push('respostaFieldId = 0 (sem campo de resposta o Salesbot não tem o que enviar)')
  if (!CONFIG.kommoBotId) problems.push('KOMMO_BOT_ID ausente — a resposta é depositada mas nunca enviada')
  if (!CONFIG.gateTag) avisos.push('GATE_TAG vazio = a IA atende TODOS os leads da conta. Só no fim da rampagem.')
  const ids = new Set<string>()
  for (const p of CRM_MAP.portas) {
    if (ids.has(p.id)) problems.push(`porta "${p.id}" duplicada`)
    ids.add(p.id)
    if (p.ativa && !p.promptFile) problems.push(`porta "${p.id}" ativa sem promptFile`)
    if (p.ativa && p.promptFile) { try { loadPromptFile(`portas/${p.promptFile}`) } catch { problems.push(`prompts/portas/${p.promptFile} não existe`) } }
    if (!p.ativa && !p.mensagemSemAgente) problems.push(`porta "${p.id}" inativa sem mensagemSemAgente`)
    for (const key of [...p.roteiro, ...p.obrigatorios]) if (!CRM_MAP.campos[key]) problems.push(`porta "${p.id}": campo "${key}" não existe em CRM_MAP.campos`)
    for (const key of p.obrigatorios) if (!p.roteiro.includes(key)) problems.push(`porta "${p.id}": obrigatório "${key}" fora do roteiro`)
  }
  const menus = CRM_MAP.portas.map(p => p.menu).filter(n => n !== null)
  if (new Set(menus).size !== menus.length) problems.push('dois assuntos com o mesmo número no menu')
  if (menus.includes(CRM_MAP.menu.outros)) problems.push(`menu.outros (${CRM_MAP.menu.outros}) colide com uma porta`)
  if (!CRM_MAP.portas.find(p => p.id === CRM_MAP.menu.portaPadraoOutros)) problems.push(`menu.portaPadraoOutros "${CRM_MAP.menu.portaPadraoOutros}" não existe`)
  try { loadPromptFile('nucleo.md') } catch { problems.push('prompts/nucleo.md não existe') }

  try {
    const fd = await kommoGet<{ _embedded?: { custom_fields?: LiveField[] } }>('/api/v4/leads/custom_fields?limit=250')
    const live = new Map((fd._embedded?.custom_fields || []).map(f => [f.id, f]))
    const resp = live.get(CRM_MAP.respostaFieldId)
    if (CRM_MAP.respostaFieldId && !resp) problems.push(`campo de resposta ${CRM_MAP.respostaFieldId} NÃO existe no Kommo`)
    else if (resp && !/text/.test(resp.type)) problems.push(`campo de resposta ${resp.id} é ${resp.type}, precisa ser text/textarea`)
    for (const c of Object.values(CRM_MAP.campos)) {
      if (!c.id) continue
      if (CRM_MAP.camposProibidos.includes(c.id)) problems.push(`campo "${c.key}" aponta para um campo PROIBIDO (${c.id})`)
      const lf = live.get(c.id)
      if (!lf) { problems.push(`campo "${c.key}" (${c.id}) NÃO existe mais`); continue }
      if (c.kommoName && lf.name.trim() !== c.kommoName.trim()) problems.push(`campo ${c.id} renomeado: mapa="${c.kommoName}" kommo="${lf.name}"`)
      const tipoOk = c.type === 'numeric' ? /numeric|text/.test(lf.type) : c.type === 'text' || c.type === 'textarea' ? /text/.test(lf.type) : lf.type === c.type
      if (!tipoOk) problems.push(`campo "${c.key}" é ${lf.type} no Kommo e ${c.type} no mapa`)
      for (const o of c.options || []) {
        const v = (lf.enums || []).find(e => e.id === o.id)
        if (!v) problems.push(`campo "${c.key}": enum ${o.id} ("${o.value}") sumiu`)
        else if (v.value !== o.value) problems.push(`campo "${c.key}": enum ${o.id} é "${v.value}" no Kommo e "${o.value}" no mapa`)
      }
    }
    if (CRM_MAP.etapas.length) {
      const pd = await kommoGet<{ _embedded?: { pipelines?: LivePipeline[] } }>('/api/v4/leads/pipelines')
      for (const e of CRM_MAP.etapas) {
        const p = (pd._embedded?.pipelines || []).find(x => x.id === e.pipelineId)
        const s = p?._embedded?.statuses?.find(x => x.id === e.id)
        if (!s) problems.push(`etapa "${e.name}" (${e.id}) não existe no funil ${e.pipelineId}`)
        else if (s.name !== e.name) problems.push(`etapa ${e.id} renomeada: mapa="${e.name}" kommo="${s.name}"`)
      }
    }
  } catch (e) {
    problems.push(`falha ao consultar o Kommo: ${e instanceof Error ? e.message : String(e)}`)
  }

  return res.status(problems.length ? 500 : 200).json({ ok: problems.length === 0, cliente: CONFIG.clientName, portas: CRM_MAP.portas.map(p => `${p.menu ?? '-'}:${p.id}${p.ativa ? '' : '(inativa)'}`), problems, avisos })
}
