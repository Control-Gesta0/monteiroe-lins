import { waitUntil } from '@vercel/functions'
import { cenarios } from '../evals/cenarios'
import { candidata, gravarVersao, limparPublicado, renderPrompts } from './base'
import { validarExtra, validarTexto, type Extra, type ItemId, type Textos } from './base-core'
import { CONFIG } from './config'
import { runEvals } from './evals-runner'
import { k, redis } from './redis'

/**
 * O PORTEIRO da base: publicar = rodar o exame inteiro (os cenários de aceite de
 * evals/cenarios.ts) com a versão candidata. Passou tudo → vira a versão vigente.
 * Uma reprovação → nada muda no WhatsApp e a tela mostra o que falhou.
 * Cenário que falha roda mais 2 vezes e só passa se passar nas duas (2 de 3):
 * regressão de verdade falha sempre; o ruído do modelo não barra edição boa.
 * Roda em segundo plano (waitUntil): a Central acompanha pelo id.
 */

export interface Falha { cenario: string; motivos: string[]; conversa: Array<{ lead: string; resposta: string }> }

export interface Exame {
  id: string
  status: 'rodando' | 'aprovado' | 'reprovado' | 'erro'
  inicio: string
  fim?: string
  nota: string
  mudancas: string[]
  feitos: number
  total: number
  custoUsd?: number
  versao?: number
  falhas?: Falha[]
  instaveis?: string[]
  erro?: string
}

const K_EXAME = (id: string) => k('base', 'exame', id)
const K_ULTIMO = () => k('base', 'exame', 'ultimo')
const K_LOCK = () => k('base', 'exame', 'lock')
const LIMITE_MS = 320_000

export async function lerExame(id?: string): Promise<Exame | null> {
  const alvo = id || (await redis.get<string>(K_ULTIMO()))
  if (!alvo) return null
  const e = await redis.get<Exame>(K_EXAME(alvo))
  if (e && e.status === 'rodando' && Date.now() - Date.parse(e.inicio) > LIMITE_MS) {
    const morto: Exame = { ...e, status: 'erro', fim: new Date().toISOString(), erro: 'O exame passou do tempo e foi interrompido. Nada foi publicado; tente de novo.' }
    await salvar(morto)
    await redis.del(K_LOCK())
    return morto
  }
  return e
}

async function salvar(e: Exame) {
  await redis.set(K_EXAME(e.id), e, { ex: 7 * 86400 })
}

export async function iniciarExame(nota: string): Promise<{ exame?: Exame; erro?: string; problemas?: Record<string, string[]> }> {
  const c = await candidata()
  if (!c.mudou.length) return { erro: 'Não há alteração no rascunho para publicar.' }
  const problemas: Record<string, string[]> = {}
  for (const id of c.mudou) {
    const extra = c.extras.find(e => e.id === id)
    const p = extra ? validarExtra(extra) : id.startsWith('extra_') ? [] : validarTexto(id, c.textos[id as ItemId])
    if (p.length) problemas[id] = p
  }
  if (Object.keys(problemas).length) return { erro: 'Corrija os textos marcados antes de publicar.', problemas }

  const id = `ex${Date.now().toString(36)}`
  if (!(await redis.set(K_LOCK(), id, { nx: true, ex: Math.ceil(LIMITE_MS / 1000) }))) return { erro: 'Já tem um exame rodando. Espere ele terminar.' }
  const exame: Exame = {
    id, status: 'rodando', inicio: new Date().toISOString(), nota: nota.trim().slice(0, 200) || 'Atualização da base',
    mudancas: c.mudou, feitos: 0, total: cenarios(c.textos).length,
  }
  await salvar(exame)
  await redis.set(K_ULTIMO(), id, { ex: 30 * 86400 })
  waitUntil(rodar(exame, c.textos, c.extras))
  return { exame }
}

async function rodar(exame: Exame, textos: Textos, extras: Extra[]): Promise<void> {
  try {
    const lista = cenarios(textos)
    const comum = {
      apiKey: CONFIG.openaiApiKey,
      model: CONFIG.llmModel,
      judgeModel: process.env.EVAL_JUDGE_MODEL || 'gpt-5.4-2026-03-05',
      prompts: renderPrompts(textos, extras),
      textos,
      gateTag: CONFIG.gateTag || 'gate',
      concorrencia: 5,
    }
    const r1 = await runEvals({ ...comum, cenarios: lista, onProgresso: async feitos => { exame.feitos = feitos; await salvar(exame) } })
    let custo = r1.custoUsd
    const primeira = r1.resultados.filter(x => !x.passou)
    const reprovados: typeof primeira = []
    exame.instaveis = []
    if (primeira.length) {
      const base = exame.feitos
      exame.total += primeira.length * 2
      await salvar(exame)
      const r2 = await runEvals({
        ...comum, reps: 2, cenarios: lista.filter(c => primeira.some(f => f.id === c.id)),
        onProgresso: async feitos => { exame.feitos = base + feitos; await salvar(exame) },
      })
      custo += r2.custoUsd
      for (const f of primeira) {
        const novas = r2.resultados.filter(x => x.id === f.id)
        if (novas.length === 2 && novas.every(x => x.passou)) exame.instaveis.push(f.id)
        else reprovados.push(f, ...novas.filter(x => !x.passou))
      }
    }
    exame.custoUsd = Math.round(custo * 10000) / 10000
    exame.fim = new Date().toISOString()
    exame.falhas = reprovados.map(x => ({
      cenario: x.id,
      motivos: [...x.falhasCodigo, ...x.falhasJuiz.map(f => `${f.criterio} (${f.porque})`)],
      conversa: x.conversa.map(t => ({ lead: t.lead.slice(0, 500), resposta: t.resposta.slice(0, 1500) })),
    }))
    if (!reprovados.length) {
      const v = await gravarVersao(textos, extras, exame.nota, { total: lista.length, reprovados: 0, custoUsd: exame.custoUsd })
      await limparPublicado(textos, extras)
      exame.versao = v.versao
      exame.status = 'aprovado'
    } else {
      exame.status = 'reprovado'
    }
  } catch (e) {
    exame.status = 'erro'
    exame.fim = new Date().toISOString()
    exame.erro = (e instanceof Error ? e.message : String(e)).slice(0, 300)
  } finally {
    await salvar(exame)
    await redis.del(K_LOCK())
  }
}
