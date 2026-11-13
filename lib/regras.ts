/**
 * TRAVAS DA MONTEIRO & LINS (patch). Resposta que casar com uma destas não sai:
 * o modelo reescreve uma vez e, se insistir, sai o texto seguro.
 *
 * Base: Código de Ética da OAB (sem promessa de resultado, sem preço por WhatsApp)
 * e a agenda do escritório (só os horários da grade).
 * Toda regra tem caso que bloqueia e caso que passa em scripts/test-cliente.ts.
 */
import { CRM_MAP } from './crm-map'

/** "*quarta (18/11) às 16h10*": horário com data que não está na grade de reuniões = inventado. */
const HORARIOS_DA_GRADE = [...new Set(Object.values(CRM_MAP.agenda.grade).flat())]
  .map(hm => { const [h, m] = hm.split(':'); return `${Number(h)}h${m === '00' ? '' : m}` })
  .sort((a, b) => b.length - a.length)
const HORARIO_FORA_DA_GRADE = new RegExp(`\\(\\d{1,2}\\/\\d{1,2}\\)\\*?\\s*às\\s*(?!(?:${HORARIOS_DA_GRADE.join('|')})\\b)\\d{1,2}h\\d{0,2}`, 'i')

const NEG = '(?<!\\b(?:n[aã]o|sem|nenhuma|nenhum|ningu[eé]m|nunca)\\b[^.!?\\n]{0,30})'

export const REGRAS_CLIENTE: Array<{ regra: string; re: RegExp }> = [
  // NEG: negação até ~30 caracteres antes ("não tem garantia", "não dá pra garantir que você vai ganhar") é honestidade, não promessa
  { regra: 'prometeu resultado', re: new RegExp(`${NEG}\\b(garant(o|imos|ido|ida|ia)|(vai|v[aã]o) (ganhar|conseguir|vencer)|certeza (de )?que (voc[eê] )?(vai|v[aã]o))\\b`, 'i') },
  { regra: 'afirmou redução certa', re: new RegExp(`${NEG}\\b(vai|v[aã]o) (baixar|reduzir|cair|diminuir)\\b`, 'i') },
  { regra: 'citou chance de vitória', re: new RegExp(`${NEG}(\\b(chance|probabilidade|taxa)s? de (vit[oó]ria|[eê]xito|ganh|sucesso)|\\b\\d{2}\\s?% de (chance|[eê]xito|sucesso))`, 'i') },
  { regra: 'prometeu redução percentual', re: /\b(reduzir|redu[cç][aã]o de|cortar) at[eé] \d{2}\s?%/i },
  { regra: 'falou de honorários com valor', re: /honor[aá]rio[^.?!\n]{0,60}R\$|R\$[^.?!\n]{0,60}honor[aá]rio|\bentrada de R\$|\b\d{1,2}\s?x\s?(de\s)?R\$/i },
  { regra: 'horário fora da agenda', re: HORARIO_FORA_DA_GRADE },
  // (até 13/11/2026 havia a trava "margem errada (o teto é 40%)": com a tabela de margens por órgão, 30% e 35% são limites válidos)
]
