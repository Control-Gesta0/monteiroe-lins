import { CONFIG } from './config'
import { CRM_MAP } from './crm-map'
import { rememberSent } from './history'
import { runSalesbot, updateLeadFields } from './kommo'
import { k, redis } from './redis'
import { enviarTexto } from './stevo'
import { marcarEnvioDaIA, respondido, rotaDoLead } from './stevo-conversa'

/**
 * Envio — Desenho A. A API v4 NÃO envia mensagem: a resposta é DEPOSITADA
 * (campo do lead + outbox Redis) e o Salesbot entrega. Uma mensagem por
 * resposta (Salesbot não faz multi-mensagem nem voz).
 *
 * Depositar ANTES de disparar: se o run falhar, o texto está no card.
 */

export async function getOutbox(leadId: number): Promise<string | null> {
  const text = await redis.get<string>(k('outbox', leadId))
  if (text) await redis.del(k('outbox', leadId))
  return text || null
}

export async function sendReply(leadId: number, text: string): Promise<string> {
  const body = text.trim()
  if (!body) throw new Error('resposta vazia — nada enviado')
  // Conversa que chegou pela Stevo: responde pelo MESMO número, direto pela API da Stevo
  const rota = CONFIG.canalLia === 'stevo' ? await rotaDoLead(leadId) : null
  if (rota) {
    await rememberSent(leadId, body) // anti-eco antes do envio: o webhook de saída pode chegar antes do ID
    const id = await enviarTexto(rota.canal, rota.fone, body)
    await marcarEnvioDaIA(id)
    await respondido(rota.canal, rota.fone)
    return `stevo/${rota.canal}`
  }
  if (!CRM_MAP.respostaFieldId) throw new Error('crm-map: respostaFieldId não preenchido')
  await updateLeadFields(leadId, [{ field_id: CRM_MAP.respostaFieldId, values: [{ value: body }] }])
  await redis.set(k('outbox', leadId), body, { ex: 600 })
  // Anti-eco antes do run: o add_message do que o bot enviar pode chegar rápido
  await rememberSent(leadId, body)
  if (!CONFIG.kommoBotId) throw new Error('KOMMO_BOT_ID ausente — a resposta ficou no campo do card e no outbox')
  await runSalesbot(CONFIG.kommoBotId, leadId)
  return 'salesbot/run disparado'
}
