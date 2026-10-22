import { CONFIG } from './config'
import { CRM_MAP } from './crm-map'
import { duasOpcoes, horariosLivres } from './agenda'
import { googleAtivo, googleConfigurado, intervalosOcupados, listarEventos, nomeDaAgenda } from './google-calendar'
import { kommoPort } from './port'
import { kommoGet } from './kommo'
import { loadPromptFile } from './llm'

/**
 * CRM_MAP × Kommo VIVO + coerência interna. Usado pelo /api/validate (antes de
 * cada deploy) e pela Central (Sistema). Fail-closed: o que não deu para conferir
 * vira problema, nunca "ok".
 */

interface LiveField { id: number; name: string; type: string; enums?: Array<{ id: number; value: string }> | null }
interface LivePipeline { id: number; name: string; _embedded?: { statuses?: Array<{ id: number; name: string; sort?: number }> } }

export interface CrmCheck { problems: string[]; avisos: string[]; etapas: Array<{ id: number; name: string; sort: number }> }

export async function checkCrm(): Promise<CrmCheck> {
  const problems: string[] = []
  const avisos: string[] = []
  const etapas: CrmCheck['etapas'] = []

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
    // Monteiro & Lins: Funil/SDR, campos da Lia, tipos de tarefa e motivos de perda
    const sdr = CRM_MAP.sdr
    const pd2 = await kommoGet<{ _embedded?: { pipelines?: LivePipeline[] } }>('/api/v4/leads/pipelines')
    const funil = (pd2._embedded?.pipelines || []).find(x => x.id === sdr.pipelineId)
    if (!funil) problems.push(`Funil/SDR ${sdr.pipelineId} não existe`)
    etapas.push(...(funil?._embedded?.statuses || []).map(x => ({ id: x.id, name: x.name, sort: x.sort ?? 0 })))
    const statusIds = new Set((funil?._embedded?.statuses || []).map(x => x.id))
    for (const [nome, id] of Object.entries(sdr.etapas)) if (!statusIds.has(id)) problems.push(`etapa sdr.${nome} (${id}) não existe no Funil/SDR`)
    for (const id of [...sdr.etapasDaIA, ...CRM_MAP.agenda.etapasOcupadas]) if (!statusIds.has(id)) problems.push(`etapa ${id} (alçada/agenda) não existe no Funil/SDR`)
    const tipos: Record<number, string> = { [sdr.campos.agendamento]: 'date_time', [sdr.campos.resumo]: 'textarea', [sdr.campos.corporacao]: 'select' }
    for (const [id, tipo] of Object.entries(tipos)) {
      const lf = live.get(Number(id))
      if (!lf) problems.push(`campo ${id} (${tipo}) da Lia não existe`)
      else if (lf.type !== tipo) problems.push(`campo ${id} "${lf.name}" é ${lf.type}, a Lia espera ${tipo}`)
    }
    const corp = live.get(sdr.campos.corporacao)
    for (const c of sdr.corporacaoPorOrgao) if (corp && !(corp.enums || []).some(e => e.id === c.enumId)) problems.push(`Corporação: enum ${c.enumId} sumiu`)
    const conta = await kommoGet<{ _embedded?: { task_types?: Array<{ id: number; name: string }> } }>('/api/v4/account?with=task_types')
    const taskIds = new Set((conta._embedded?.task_types || []).map(t => t.id))
    for (const id of [sdr.tarefas.tipoAgendamento, sdr.tarefas.tipoRetorno]) if (!taskIds.has(id)) problems.push(`tipo de tarefa ${id} não existe`)
    const lr = await kommoGet<{ _embedded?: { loss_reasons?: Array<{ id: number }> } }>('/api/v4/leads/loss_reasons')
    const lossIds = new Set((lr._embedded?.loss_reasons || []).map(x => x.id))
    for (const [k, id] of Object.entries(sdr.desqualificacao.motivoPerda)) if (!lossIds.has(id)) problems.push(`motivo de perda ${k} (${id}) não existe`)
    if (!sdr.desqualificacao.moverParaPerdido) avisos.push('Rampagem: desqualificados ficam em Qualificação com a tag lia-desqualificou (moverParaPerdido = false).')
  } catch (e) {
    problems.push(`falha ao consultar o Kommo: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Google Agenda: sem ela a Lia usa só a grade + reuniões do Kommo (aviso, não bloqueio)
  if (!CONFIG.selfUrl) problems.push('SELF_URL ausente (alias público do deploy, nunca VERCEL_URL)')
  if (!googleConfigurado()) avisos.push('Google Agenda não configurada: a Lia usa só a grade do crm-map e as reuniões do Kommo.')
  else if (!(await googleAtivo())) avisos.push(`Google Agenda sem autorização: o dono da agenda precisa abrir ${CONFIG.selfUrl}/api/google-oauth?secret=...`)
  else {
    try {
      avisos.push(`Google Agenda ligada: ${await nomeDaAgenda()}`)
      // Prova de leitura: o que a Lia enxerga e o que ela ofereceria agora (mesmo caminho do consultar_horarios)
      const cfg = CRM_MAP.agenda
      const agora = Math.floor(Date.now() / 1000)
      const eventos = intervalosOcupados(await listarEventos(agora, agora + (cfg.diasAFrente + 2) * 86_400), cfg.offsetUtc)
      const livres = horariosLivres(agora, await kommoPort(0).horariosOcupados(), cfg)
      const opcoes = duasOpcoes(livres, cfg).map(s => s.rotulo).join(' ou ') || 'nenhum horário livre'
      avisos.push(`Agenda: ${eventos.length} compromisso(s) na Google Agenda nos próximos ${cfg.diasAFrente} dias · ${livres.length} horário(s) livre(s) na grade · a Lia ofereceria ${opcoes}`)
    } catch (e) { problems.push(`Google Agenda não abre: ${e instanceof Error ? e.message : String(e)}`) }
  }

  return { problems, avisos, etapas }
}
