/**
 * NÚMEROS DE WHATSAPP DA MONTEIRO & LINS NA STEVO. A chave é o nome do canal que vai
 * na URL do webhook (?canal=...): não precisa ser igual ao nome da instância na Stevo.
 * Os links de conexão (página do QR) têm token: ficam em STEVO_LINKS, fora do git.
 *
 * `ia: true` = a Lia atende quem escreve para esse número (com a tag de gate).
 * `ia: false` = número da equipe: a conversa é registrada (painel, fila "sem resposta"),
 * mas a IA não fala e o app não mexe no card.
 */

export interface Canal {
  numero: string
  papel: string
  ia: boolean
  /** funil (pelo nome) onde a conversa da Lia vive; só para `ia: true` */
  funil?: string
}

export const CANAIS: Record<string, Canal> = {
  'ml-sdr': { numero: '(21) 96795-0218', papel: 'Anúncios e novos clientes', ia: true, funil: 'Funil/SDR' },
  'ml-clientes': { numero: '(21) 97207-5536', papel: 'Clientes do escritório', ia: false },
  'ml-empresarial': { numero: '(21) 99077-9065', papel: 'Empresarial', ia: false },
}

export const canalDaLia = (canal: string) => Boolean(CANAIS[canal]?.ia)
