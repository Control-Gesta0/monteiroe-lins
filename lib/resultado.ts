import crypto from 'crypto'
import { CONFIG } from './config'

/**
 * ENTREGA DO RESULTADO (pedido do escritório, 10/11/2026): com o contracheque lido, a Lia
 * agradece e pergunta das dívidas fora do contracheque; o resultado sai quando o lead
 * responde ou, se ele não responder, RESULTADO_ESPERA_MIN minutos depois. Esse prazo é uma
 * mensagem atrasada no QStash que chama /api/resultado. Lá o app confere se o resultado
 * ainda está pendente (o lead pode ter respondido antes): a fila não precisa ser cancelada.
 */

export function chaveEntrega(leadId: number, em: number, segredo = CONFIG.webhookSecret): string {
  return crypto.createHmac('sha256', segredo).update(`resultado:${leadId}:${em}`).digest('hex').slice(0, 32)
}

/** Agenda a entrega; false se a fila não está configurada (aí o resultado sai na hora). */
export async function agendarEntrega(leadId: number, em: number): Promise<boolean> {
  if (!CONFIG.qstashToken || !CONFIG.selfUrl || !(CONFIG.resultadoEsperaMin > 0)) return false
  const quando = em + CONFIG.resultadoEsperaMin * 60_000
  const res = await fetch(`${CONFIG.qstashUrl}/v2/publish/${CONFIG.selfUrl}/api/resultado`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CONFIG.qstashToken}`,
      'Content-Type': 'application/json',
      'Upstash-Not-Before': String(Math.floor(quando / 1000)),
      'Upstash-Retries': '2',
    },
    body: JSON.stringify({ leadId, em, s: chaveEntrega(leadId, em) }),
  })
  if (!res.ok) throw new Error(`QStash ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return true
}
