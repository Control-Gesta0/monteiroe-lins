/**
 * TRAVAS DA MONTEIRO & LINS (patch). Resposta que casar com uma destas não sai:
 * o modelo reescreve uma vez e, se insistir, sai o texto seguro.
 *
 * Base: Código de Ética da OAB (sem promessa de resultado, sem preço por WhatsApp)
 * e a planilha do escritório (o teto que vale é 40%, não 30% ou 35%).
 * Toda regra tem caso que bloqueia e caso que passa em scripts/test-cliente.ts.
 */
export const REGRAS_CLIENTE: Array<{ regra: string; re: RegExp }> = [
  { regra: 'prometeu resultado', re: /\bgarant(o|imos|ido|ida|ia)\b|\b(vai|v[aã]o|voc[eê] vai) (ganhar|conseguir|vencer)\b|\bcerteza (de que|que) (vai|v[aã]o)\b/i },
  { regra: 'afirmou redução certa', re: /\b(vai|v[aã]o) (baixar|reduzir|cair|diminuir)\b/i },
  { regra: 'citou chance de vitória', re: /\b(chance|probabilidade|taxa)s? de (vit[oó]ria|[eê]xito|ganh|sucesso)|\b\d{2}\s?% de (chance|[eê]xito|sucesso)/i },
  { regra: 'prometeu redução percentual', re: /\b(reduzir|redu[cç][aã]o de|cortar) at[eé] \d{2}\s?%/i },
  { regra: 'falou de honorários com valor', re: /honor[aá]rio[^.?!\n]{0,60}R\$|R\$[^.?!\n]{0,60}honor[aá]rio|\bentrada de R\$|\b\d{1,2}\s?x\s?(de\s)?R\$/i },
  { regra: 'margem errada (o teto é 40%)', re: /\b(30|35)\s?%\s*(da|de)\s*(sua\s*)?(renda|sal[aá]rio)/i },
]
