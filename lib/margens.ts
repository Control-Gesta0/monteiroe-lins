/**
 * MARGEM CONSIGNÁVEL POR ÓRGÃO PAGADOR (tabela do escritório, 13/11/2026:
 * "Margens_Desconto_Emprestimo_Consignado_Monteiro_Lins_atualizada.xlsx").
 *
 * A margem da tabela é para EMPRÉSTIMO CONSIGNADO: cartão consignado, cartão benefício (RMC),
 * associação e plano de saúde não entram nela ("não confundir"). Onde a norma só fixa a
 * margem GLOBAL das consignações (Prefeitura do Rio, Balneário Camboriú), o limite vale para
 * a soma de todas as consignações. A base é a renda líquida da análise (bruto − descontos
 * obrigatórios), a aproximação possível da "base de cálculo" de cada ente.
 *
 * Órgão fora da tabela, ou com percentual a validar: vale a regra antiga (teto de 40% sobre
 * todas as consignações) e a nota do card avisa. Arquivo puro (sem env).
 */

export interface RegraMargem {
  id: string
  /** nome do ente como na tabela */
  nome: string
  /** como reconhecer pelo órgão que o olho leu no cabeçalho do contracheque */
  re: RegExp
  /** fração da base (0,35 = 35%); null = percentual a validar (cai na regra antiga) */
  margem: number | null
  /** 'emprestimo': só o empréstimo consignado usa a margem; 'global': todas as consignações */
  alcance: 'emprestimo' | 'global'
  norma: string
}

// A ordem importa: prefeituras antes do estado da mesma UF
export const REGRAS_MARGEM: RegraMargem[] = [
  { id: 'pmsp', nome: 'Prefeitura de São Paulo', re: /PREFEITURA (?:DO MUNIC[IÍ]PIO )?DE S[AÃ]O PAULO\b|\bPMSP\b/i, margem: 0.35, alcance: 'emprestimo', norma: 'Decreto Municipal nº 58.890/2019 e Portaria SG nº 94/2019' },
  { id: 'sp', nome: 'Governo do Estado de São Paulo', re: /ESTADO DE S[AÃ]O PAULO|S[AÃ]O PAULO PREVID|\bSPPREV\b|\bPMESP\b|CENTRO INTEGRADO DE APOIO FINANCEIRO|\bCIAF\b/i, margem: 0.35, alcance: 'emprestimo', norma: 'Decreto Estadual nº 60.435/2014 e alterações' },
  { id: 'rio', nome: 'Prefeitura do Rio de Janeiro', re: /(?:PREFEITURA|MUNIC[IÍ]PIO)(?: DA CIDADE)? DO RIO DE JANEIRO|\bPCRJ\b|PREVI-?RIO/i, margem: 0.55, alcance: 'global', norma: 'Lei Municipal nº 7.107/2021 (margem global)' },
  { id: 'rj', nome: 'Governo do Estado do Rio de Janeiro', re: /ESTADO DO RIO DE JANEIRO|\bPMERJ\b|\bCBMERJ\b|RIO ?PREVID[EÊ]NCIA|\bSEEDUC\b|SECRETARIA DE ESTADO DE DEFESA CIVIL/i, margem: 0.35, alcance: 'emprestimo', norma: 'Decreto Estadual nº 45.563/2016 e alterações (regra 2026)' },
  { id: 'curitiba', nome: 'Prefeitura de Curitiba', re: /CURITIBA/i, margem: 0.30, alcance: 'emprestimo', norma: 'Curitiba Consig' },
  { id: 'campomourao', nome: 'Prefeitura de Campo Mourão', re: /CAMPO MOUR[AÃ]O/i, margem: null, alcance: 'emprestimo', norma: 'Decreto nº 8.679/2020 (percentual a validar)' },
  { id: 'pr', nome: 'Governo do Estado do Paraná', re: /ESTADO DO PARAN[AÁ]|PARAN[AÁ] ?PREVID|PR-?CONSIG|PARAN[AÁ] ?CONSIG/i, margem: 0.40, alcance: 'emprestimo', norma: 'Lei Estadual nº 20.740 (PR-Consig)' },
  { id: 'amprev', nome: 'Amapá Previdência (AMPREV)', re: /AMAP[AÁ] PREVID|\bAMPREV\b/i, margem: 0.30, alcance: 'emprestimo', norma: 'Política de Investimentos do RPPS do Amapá 2026' },
  { id: 'balneario', nome: 'Prefeitura de Balneário Camboriú', re: /BALNE[AÁ]RIO CAMBORI[UÚ]/i, margem: 0.45, alcance: 'global', norma: 'Lei Municipal nº 1.069/1991, art. 87 (teto global)' },
]

/** A regra do órgão do contracheque; null se o órgão não está na tabela. */
export function regraDoOrgao(orgao: string): RegraMargem | null {
  return REGRAS_MARGEM.find(r => r.re.test(orgao || '')) || null
}
