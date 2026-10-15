import { mesclar, mudancas, renderNucleo, renderTemplate, textosPadrao, type Extra, type ItemId, type Textos } from './base-core'
import { loadPromptFile } from './llm'
import { k, redis } from './redis'

/**
 * BASE (store): o que está publicado, o rascunho e o histórico de versões, no Redis
 * do agente (prefixo ak-monteiro-lins:).
 *
 *   base:vigente    { versao, textos (só o que difere do padrão), extras, publicadoEm, nota, exame }
 *   base:historico  as 20 versões anteriores, para voltar
 *   base:rascunho   o que a IA mudou a pedido da equipe e ainda não passou no exame
 *
 * Quem escreve no rascunho é a IA (lib/curador.ts), nunca a equipe à mão. Nada do
 * rascunho chega ao WhatsApp: só o vigente, que só muda pelo exame ou por "voltar".
 */

export interface Versao {
  versao: number
  textos: Partial<Textos>
  extras?: Extra[]
  publicadoEm: string | null
  nota?: string
  mudancas?: string[]
  exame?: { total: number; reprovados: number; custoUsd: number }
}

export interface Rascunho { textos: Partial<Textos>; extras?: Extra[]; atualizadoEm: string | null }

/** Os prompts como o modelo recebe: núcleo (com as informações acrescentadas) + cada porta. */
export interface PromptsRenderizados { nucleo: string; portas: Record<string, string> }

const K_VIGENTE = () => k('base', 'vigente')
const K_HISTORICO = () => k('base', 'historico')
const K_RASCUNHO = () => k('base', 'rascunho')

export const PORTAS_COM_PROMPT: Record<string, string> = { superendividamento: 'portas/superendividamento.md' }

const templates = () => ({ nucleo: loadPromptFile('nucleo.md'), portas: Object.fromEntries(Object.entries(PORTAS_COM_PROMPT).map(([id, f]) => [id, loadPromptFile(f)])) })

export const padrao = (): Textos => { const t = templates(); return textosPadrao([t.nucleo, ...Object.values(t.portas)]) }

/** Renderiza os prompts com os textos e as informações acrescentadas. */
export function renderPrompts(textos: Partial<Textos>, extras: Extra[]): PromptsRenderizados {
  const t = templates()
  return { nucleo: renderNucleo(t.nucleo, textos, extras), portas: Object.fromEntries(Object.entries(t.portas).map(([id, x]) => [id, renderTemplate(x, textos)])) }
}

export async function lerVigente(): Promise<Versao> {
  return (await redis.get<Versao>(K_VIGENTE())) || { versao: 0, textos: {}, extras: [], publicadoEm: null }
}

export async function lerRascunho(): Promise<Rascunho> {
  return (await redis.get<Rascunho>(K_RASCUNHO())) || { textos: {}, atualizadoEm: null }
}

export async function lerHistorico(): Promise<Versao[]> {
  return (await redis.lrange<Versao>(K_HISTORICO(), 0, 19)) || []
}

const iguais = (a: Extra[] = [], b: Extra[] = []) => JSON.stringify(a) === JSON.stringify(b)

export function mudancasBase(antes: { textos: Textos; extras: Extra[] }, depois: { textos: Textos; extras: Extra[] }): string[] {
  const ids: string[] = mudancas(antes.textos, depois.textos)
  const porId = new Map(antes.extras.map(e => [e.id, e]))
  for (const e of depois.extras) {
    const a = porId.get(e.id)
    if (!a || a.texto !== e.texto || a.titulo !== e.titulo) ids.push(e.id)
  }
  for (const e of antes.extras) if (!depois.extras.some(d => d.id === e.id)) ids.push(e.id)
  return ids
}

// O atendimento lê o vigente a cada turno; 10 s de memória por instância bastam
let cache: { em: number; prompts: PromptsRenderizados; textos: Textos; extras: Extra[] } | null = null

/** Prompts + textos que o atendimento usa agora. Redis fora: cai no padrão (nunca para). */
export async function baseVigente(): Promise<{ prompts: PromptsRenderizados; textos: Textos; extras: Extra[] }> {
  if (cache && Date.now() - cache.em < 10_000) return cache
  let v: Versao = { versao: 0, textos: {}, extras: [], publicadoEm: null }
  try { v = await lerVigente() } catch (e) { console.warn('[base] vigente não leu, uso o padrão:', e instanceof Error ? e.message : e) }
  const textos = mesclar(padrao(), v.textos)
  const extras = v.extras || []
  cache = { em: Date.now(), prompts: renderPrompts(textos, extras), textos, extras }
  return cache
}

/** Candidata = padrão + vigente + rascunho. */
export async function candidata(): Promise<{ textos: Textos; extras: Extra[]; vigente: Textos; extrasVigentes: Extra[]; mudou: string[] }> {
  const [v, r] = await Promise.all([lerVigente(), lerRascunho()])
  const base = padrao()
  const vigente = mesclar(base, v.textos)
  const extrasVigentes = v.extras || []
  const textos = mesclar(base, v.textos, r.textos)
  const extras = r.extras ?? extrasVigentes
  return { textos, extras, vigente, extrasVigentes, mudou: mudancasBase({ textos: vigente, extras: extrasVigentes }, { textos, extras }) }
}

export async function salvarNoRascunho(mud: { textos?: Partial<Textos>; extras?: Extra[] }): Promise<Rascunho> {
  const [r, v] = await Promise.all([lerRascunho(), lerVigente()])
  const vigente = mesclar(padrao(), v.textos)
  const textos = { ...r.textos }
  for (const [id, t] of Object.entries(mud.textos || {}) as Array<[ItemId, string]>) {
    if (t === vigente[id]) delete textos[id]
    else textos[id] = t
  }
  let extras = mud.extras !== undefined ? mud.extras : r.extras
  if (extras && iguais(extras, v.extras || [])) extras = undefined
  const novo: Rascunho = { textos, ...(extras ? { extras } : {}), atualizadoEm: new Date().toISOString() }
  await redis.set(K_RASCUNHO(), novo)
  return novo
}

export async function descartarRascunho(id?: string): Promise<void> {
  if (!id) { await redis.del(K_RASCUNHO()); return }
  const [r, v] = await Promise.all([lerRascunho(), lerVigente()])
  const textos = { ...r.textos }
  delete textos[id as ItemId]
  let extras = r.extras
  if (extras && id.startsWith('extra_')) {
    const noAr = (v.extras || []).find(e => e.id === id)
    const i = extras.findIndex(e => e.id === id)
    const sem = extras.filter(e => e.id !== id)
    extras = noAr ? [...sem.slice(0, Math.max(0, i)), noAr, ...sem.slice(Math.max(0, i))] : sem
    if (iguais(extras, v.extras || [])) extras = undefined
  }
  await redis.set(K_RASCUNHO(), { textos, ...(extras ? { extras } : {}), atualizadoEm: new Date().toISOString() })
}

export async function gravarVersao(textos: Textos, extras: Extra[], nota: string, exame?: Versao['exame']): Promise<Versao> {
  const atual = await lerVigente()
  const base = padrao()
  const sobre: Partial<Textos> = {}
  for (const id of mudancas(base, textos)) sobre[id] = textos[id]
  const nova: Versao = {
    versao: atual.versao + 1, textos: sobre, extras, publicadoEm: new Date().toISOString(), nota: nota.slice(0, 200),
    mudancas: mudancasBase({ textos: mesclar(base, atual.textos), extras: atual.extras || [] }, { textos, extras }), exame,
  }
  await redis.lpush(K_HISTORICO(), atual)
  await redis.ltrim(K_HISTORICO(), 0, 19)
  await redis.set(K_VIGENTE(), nova)
  cache = null
  return nova
}

export async function limparPublicado(textosPub: Textos, extrasPub: Extra[]): Promise<void> {
  const r = await lerRascunho()
  const textos = { ...r.textos }
  for (const [id, v] of Object.entries(textos)) if (textosPub[id as ItemId] === v) delete textos[id as ItemId]
  const extras = r.extras && !iguais(r.extras, extrasPub) ? r.extras : undefined
  if (Object.keys(textos).length || extras) await redis.set(K_RASCUNHO(), { textos, ...(extras ? { extras } : {}), atualizadoEm: r.atualizadoEm })
  else await redis.del(K_RASCUNHO())
}

export async function voltarPara(versao: number): Promise<Versao | null> {
  const alvo = (await lerHistorico()).find(h => h.versao === versao)
  if (!alvo) return null
  return gravarVersao(mesclar(padrao(), alvo.textos), alvo.extras || [], `Volta para a versão ${versao}`)
}
