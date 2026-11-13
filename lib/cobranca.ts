import crypto from 'crypto'
import { CONFIG } from './config'

/**
 * COBRANÇA DO CONTRACHEQUE (pedido da Dra. Patrícia, 27/10/2026): a Lia pediu o
 * contracheque e o lead sumiu → lembretes 1 dia e 3 dias depois do pedido (até 12/11/2026: também 2 h),
 * só de segunda a sábado, das 8h às 20h (Brasília).
 *
 * Cada lembrete é uma mensagem atrasada no QStash que chama /api/cobranca na hora certa.
 * Lá o app confere se AINDA falta (o lead pode ter mandado, a equipe pode ter assumido,
 * pode ter vindo um pedido mais novo): a fila não precisa ser cancelada, só ignorada.
 * O card não muda de etapa (opção A, 27/10/2026): "follow - não responde" dispara o robô do Kommo.
 */

/**
 * Lembretes: o número do texto (cobranca_1/2/3) e quantas horas depois do pedido.
 * Desde 13/11/2026 são dois (1 dia e 3 dias): o de 2 horas deixava a conversa repetitiva.
 * O texto 2 só vale para lembretes já agendados antes disso.
 */
export const LEMBRETES = [{ n: 1, h: 24 }, { n: 3, h: 72 }] as const
const BRT_MS = 3 * 3600_000

/** Primeiro instante em horário comercial (seg a sáb, 8h às 20h de Brasília) a partir de `ms`. */
export function emHorarioComercial(ms: number): number {
  const d = new Date(ms - BRT_MS) // relógio de Brasília nos campos UTC
  for (let i = 0; i < 10; i++) {
    const dia = d.getUTCDay()
    const h = d.getUTCHours()
    if (dia !== 0 && h >= 8 && h < 20) break
    if (dia !== 0 && h < 8) d.setUTCHours(9, 0, 0, 0)
    else { d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(9, 0, 0, 0) }
  }
  return d.getTime() + BRT_MS
}

/** Chave de cada lembrete (vai no corpo da mensagem do QStash): ninguém dispara cobrança de fora. */
export function chaveCobranca(leadId: number, n: number, desde: number, segredo = CONFIG.webhookSecret): string {
  return crypto.createHmac('sha256', segredo).update(`cobranca:${leadId}:${n}:${desde}`).digest('hex').slice(0, 32)
}

export const cobrancaLigada = () => Boolean(CONFIG.cobrancaContracheque && CONFIG.qstashToken && CONFIG.selfUrl)

/** Agenda os 3 lembretes desta "cadeia" (desde = quando a Lia pediu). */
export async function agendarCobrancas(leadId: number, desde: number): Promise<void> {
  if (!cobrancaLigada()) return
  const destino = `${CONFIG.selfUrl}/api/cobranca`
  // Modo de teste (COBRANCA_TESTE_MINUTOS): só nos leads de teste, lembretes a cada N minutos, a qualquer hora
  const teste = CONFIG.cobrancaTesteMinutos > 0 && CONFIG.testLeadIds.includes(leadId)
  for (const [i, { n, h }] of LEMBRETES.entries()) {
    const quando = teste ? desde + (i + 1) * CONFIG.cobrancaTesteMinutos * 60_000 : emHorarioComercial(desde + h * 3600_000)
    const res = await fetch(`${CONFIG.qstashUrl}/v2/publish/${destino}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CONFIG.qstashToken}`,
        'Content-Type': 'application/json',
        'Upstash-Not-Before': String(Math.floor(quando / 1000)),
        'Upstash-Retries': '2',
      },
      body: JSON.stringify({ leadId, n, desde, s: chaveCobranca(leadId, n, desde) }),
    })
    if (!res.ok) throw new Error(`QStash ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
}
