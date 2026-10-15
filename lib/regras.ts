/**
 * TRAVAS DA MONTEIRO & LINS (patch). Resposta que casar com uma destas não sai:
 * o modelo reescreve uma vez e, se insistir, sai o texto seguro.
 *
 * Base: Código de Ética da OAB (sem promessa de resultado, sem preço por WhatsApp)
 * e a planilha do escritório (o teto que vale é 40%, não 30% ou 35%).
 * Toda regra tem caso que bloqueia e caso que passa em scripts/test-cliente.ts.
 */
const NEG = '(?<!\\b(?:n[aã]o|sem|nenhuma|nenhum|ningu[eé]m|nunca)\\b[^.!?\\n]{0,30})'

export const REGRAS_CLIENTE: Array<{ regra: string; re: RegExp }> = [
  // NEG: negação até ~30 caracteres antes ("não tem garantia", "não dá pra garantir que você vai ganhar") é honestidade, não promessa
  { regra: 'prometeu resultado', re: new RegExp(`${NEG}\\b(garant(o|imos|ido|ida|ia)|(vai|v[aã]o) (ganhar|conseguir|vencer)|certeza (de )?que (voc[eê] )?(vai|v[aã]o))\\b`, 'i') },
  { regra: 'afirmou redução certa', re: new RegExp(`${NEG}\\b(vai|v[aã]o) (baixar|reduzir|cair|diminuir)\\b`, 'i') },
  { regra: 'citou chance de vitória', re: /\b(chance|probabilidade|taxa)s? de (vit[oó]ria|[eê]xito|ganh|sucesso)|\b\d{2}\s?% de (chance|[eê]xito|sucesso)/i },
  { regra: 'prometeu redução percentual', re: /\b(reduzir|redu[cç][aã]o de|cortar) at[eé] \d{2}\s?%/i },
  { regra: 'falou de honorários com valor', re: /honor[aá]rio[^.?!\n]{0,60}R\$|R\$[^.?!\n]{0,60}honor[aá]rio|\bentrada de R\$|\b\d{1,2}\s?x\s?(de\s)?R\$/i },
  { regra: 'margem errada (o teto é 40%)', re: /\b(30|35)\s?%\s*(da|de)\s*(sua\s*)?(renda|sal[aá]rio)/i },
]
