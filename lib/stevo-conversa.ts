import { k, redis } from './redis'
import type { EventoStevo } from './stevo'

/**
 * O que a Stevo ensina sobre cada conversa, guardado no Redis (prefixo do cliente):
 *  - última mensagem por número (o painel mostra se o webhook está vivo);
 *  - IDs que a própria IA enviou (o eco volta pelo webhook e não pode contar como equipe);
 *  - fila "sem resposta": cliente que escreveu e ninguém respondeu ainda;
 *  - rota da Lia: lead do Kommo ⇄ (número, telefone), para responder pelo MESMO número.
 * O histórico da Lia continua em lib/history.ts (por lead), como no resto do agente.
 */

export type Autor = 'lead' | 'ia' | 'equipe'

const fone11 = (fone: string) => fone.replace(/\D/g, '').slice(-11)
export const SEM_RESPOSTA = () => k('stevo', 'sem-resposta')
const atividadeKey = (canal: string) => k('stevo', 'ultima', canal)
const iaKey = (id: string) => k('stevo', 'ia', id)
const rotaKey = (leadId: number) => k('stevo', 'rota', leadId)
const leadKey = (canal: string, fone: string) => k('stevo', 'lead', canal, fone11(fone))

export interface Rota { canal: string; fone: string }

export async function ultimaAtividade(canais: string[]): Promise<Record<string, string | null>> {
  if (!canais.length) return {}
  const v = await redis.mget<Array<string | null>>(...canais.map(atividadeKey))
  return Object.fromEntries(canais.map((c, i) => [c, v[i] || null]))
}

/** Saída que a IA mandou: marca o ID antes do eco do webhook chegar. */
export async function marcarEnvioDaIA(id: string): Promise<void> {
  if (id) await redis.set(iaKey(id), 1, { ex: 3600 })
}

/**
 * Registra o evento: atividade do número, quem falou e a fila "sem resposta".
 * Devolve null se o webhook é repetido (mesmo ID já visto).
 */
export async function registrarEvento(e: EventoStevo): Promise<{ autor: Autor } | null> {
  await redis.set(atividadeKey(e.canal), new Date().toISOString(), { ex: 30 * 86400 })
  if (e.id && (await redis.set(k('stevo', 'visto', e.canal, e.id), 1, { nx: true, ex: 7 * 86400 })) !== 'OK') return null
  const autor: Autor = !e.deMim ? 'lead' : e.id && (await redis.get(iaKey(e.id))) ? 'ia' : 'equipe'
  const quem = `${e.canal}:${e.fone.replace(/\D/g, '')}`
  if (autor === 'lead') await redis.zadd(SEM_RESPOSTA(), { nx: true }, { score: Date.parse(e.quando) || Date.now(), member: quem })
  else await redis.zrem(SEM_RESPOSTA(), quem)
  return { autor }
}

/** A IA respondeu (o eco pode demorar): tira o cliente da fila na hora. */
export async function respondido(canal: string, fone: string): Promise<void> {
  await redis.zrem(SEM_RESPOSTA(), `${canal}:${fone.replace(/\D/g, '')}`)
}

export async function guardarRota(leadId: number, r: Rota): Promise<void> {
  await redis.set(rotaKey(leadId), JSON.stringify(r), { ex: 120 * 86400 })
  await redis.set(leadKey(r.canal, r.fone), leadId, { ex: 120 * 86400 })
}

export async function rotaDoLead(leadId: number): Promise<Rota | null> {
  const v = await redis.get<string | Rota>(rotaKey(leadId))
  return (typeof v === 'string' ? JSON.parse(v) : v) || null
}

export async function leadDaConversa(canal: string, fone: string): Promise<number | null> {
  const v = await redis.get<string | number>(leadKey(canal, fone))
  return v ? Number(v) : null
}

export async function filaSemResposta(): Promise<Array<{ canal: string; fone: string; desde: number }>> {
  const itens = await redis.zrange<Array<string | number>>(SEM_RESPOSTA(), 0, -1, { withScores: true })
  const out: Array<{ canal: string; fone: string; desde: number }> = []
  for (let i = 0; i + 1 < itens.length; i += 2) {
    const [canal, fone] = String(itens[i]).split(':')
    out.push({ canal: canal || '', fone: fone || '', desde: Number(itens[i + 1]) })
  }
  return out
}
