import { parseNumeroBR } from './guards'
import type { Rubrica } from './analise-contracheque'

/**
 * Lê, no histórico do lead, a transcrição que o olho (lib/media.ts) fez do
 * contracheque, no formato pedido em CRM_MAP.midia.instrucaoVisao:
 *
 *   CONTRACHEQUE | órgão | MM/AAAA | sim
 *   RUBRICA | 101 | SOLDO | P | 6.200,00
 *
 * Arquivo puro (sem env). Várias fotos da mesma competência são páginas do mesmo
 * contracheque e se juntam; competências diferentes: vale a mais recente.
 */

export interface ContrachequeLido {
  orgao: string
  competencia: string
  legivel: string
  rubricas: Rubrica[]
  /** linhas com valor ILEGÍVEL (ficam fora da conta) */
  ilegiveis: string[]
}

interface Bloco { orgao: string; competencia: string; legivel: string; linhas: string[] }

const chaveCompetencia = (c: string) => {
  const m = c.match(/(\d{1,2})\s*\/\s*(\d{4})/)
  return m ? Number(m[2]) * 100 + Number(m[1]) : -1
}

export function extrairContracheque(texto: string): ContrachequeLido | null {
  const blocos: Bloco[] = []
  let atual: Bloco | null = null
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.replace(/^\[(imagem|documento) do lead\]:\s*/i, '').trim()
    if (/^CONTRACHEQUE\s*\|/i.test(linha)) {
      const [, orgao = '', competencia = '', legivel = ''] = linha.split('|').map(s => s.trim())
      atual = { orgao, competencia, legivel: legivel.toLowerCase(), linhas: [] }
      blocos.push(atual)
    } else if (/^RUBRICA\s*\|/i.test(linha)) {
      if (!atual) { atual = { orgao: '', competencia: '', legivel: '', linhas: [] }; blocos.push(atual) }
      atual.linhas.push(linha)
    }
  }
  const comLinhas = blocos.filter(b => b.linhas.length)
  if (!comLinhas.length) return null

  // Competência mais recente (sem competência legível: o último bloco enviado)
  const melhor = comLinhas.reduce((a, b) => (chaveCompetencia(b.competencia) >= chaveCompetencia(a.competencia) ? b : a))
  const escolhidos = comLinhas.filter(b => b === melhor || (melhor.competencia && b.competencia === melhor.competencia))

  const vistas = new Set<string>()
  const rubricas: Rubrica[] = []
  const ilegiveis: string[] = []
  for (const b of escolhidos) {
    for (const linha of b.linhas) {
      const partes = linha.split('|').map(s => s.trim())
      // RUBRICA | código | descrição | P/D | valor  (a descrição pode conter "|": junta o meio)
      if (partes.length < 5) continue
      const codigo = partes[1]
      const valorTxt = partes[partes.length - 1]
      const tipoTxt = partes[partes.length - 2].toUpperCase()
      const descricao = partes.slice(2, -2).join(' | ')
      const chave = `${codigo}|${descricao}|${valorTxt}`.toUpperCase()
      if (vistas.has(chave)) continue
      vistas.add(chave)
      if (/ILEG/i.test(valorTxt)) { ilegiveis.push(descricao || codigo); continue }
      const valor = parseNumeroBR(valorTxt)
      if (valor === null) { ilegiveis.push(descricao || codigo); continue }
      const tipo = tipoTxt === 'P' || tipoTxt === 'D' ? tipoTxt : ''
      rubricas.push({ codigo, descricao, tipo, valor })
    }
  }
  return { orgao: melhor.orgao, competencia: melhor.competencia, legivel: melhor.legivel, rubricas, ilegiveis }
}
