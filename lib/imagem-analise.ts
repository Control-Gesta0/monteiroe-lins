import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { CONFIG } from './config'

/**
 * IMAGEM DA ANÁLISE (modelo "pizza", aprovado em 11/11/2026): o resultado do contracheque
 * num PNG 1080×1350 com a marca do escritório, para o cliente receber no WhatsApp.
 *
 * O desenho é um SVG montado em código (posições fixas; o texto que varia é curto) e
 * vira PNG com o resvg, com as fontes e o logo de assets/. Os números são os mesmos da
 * análise (state.analise): a imagem não calcula nada novo além de somas e do limite.
 * A Stevo baixa o PNG de /api/imagem-analise (chave por lead) e envia pelo WhatsApp.
 */

export interface DadosImagem {
  nome: string
  orgao: string
  competencia: string
  bruta: number
  obrigatorios: number
  emprestimo: number
  cartaoConsignado: number
  cartaoBeneficio: number
  /** margem do órgão sobre a renda líquida (0,35 = 35%) */
  limite: number
  /** 'emprestimo': a margem é só do empréstimo consignado; 'global': de todas as consignações */
  alcance?: 'emprestimo' | 'global'
}

const COR = { emprestimo: '#2B5797', cartaoConsignado: '#6FA3DC', cartaoBeneficio: '#B8851A' }
const NAVY = '#0B2541', GOLD = '#C9A13B', INK = '#14213D', INK2 = '#4A5568', MUTED = '#7A8496', LINE = '#E4E7EC', RED = '#B42318'

/** R$ 1.234,56 (sem depender do ICU do servidor) */
export function brl(n: number): string {
  const [int, dec] = Math.abs(n).toFixed(2).split('.')
  return `${n < 0 ? '−' : ''}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`
}
export const pct = (n: number) => `${(n * 100).toFixed(1).replace('.', ',')}%`
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const corta = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)

const ASSETS = () => path.join(process.cwd(), 'assets')
let logoCache = ''
function logo(): string {
  if (!logoCache) logoCache = fs.readFileSync(path.join(ASSETS(), 'logo-monteiro-lins.png')).toString('base64')
  return logoCache
}

function texto(x: number, y: number, t: string, o: { size: number; weight?: number; cor?: string; ancora?: 'start' | 'middle' | 'end'; serif?: boolean }): string {
  const fam = o.serif ? 'Playfair Display' : 'Inter'
  return `<text x="${x}" y="${y}" font-family="${fam}" font-size="${o.size}" font-weight="${o.weight || 400}" fill="${o.cor || INK}" text-anchor="${o.ancora || 'start'}">${esc(t)}</text>`
}

/** Rosca: fatias da renda líquida (consignados + sobra listrada) e o traço do limite. */
function rosca(cx: number, cy: number, partes: Array<{ cor: string; v: number }>, total: number, limite: number): string {
  const R = 120, E = 46, circ = 2 * Math.PI * R, gap = 3
  const sobra = Math.max(0, total - partes.reduce((a, p) => a + p.v, 0))
  let ini = 0, out = ''
  for (const p of [...partes, { cor: 'url(#livre)', v: sobra }]) {
    const len = Math.min(p.v, total) / total * circ
    if (len <= 0.5) continue
    out += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${p.cor}" stroke-width="${E}" stroke-dasharray="${Math.max(len - gap, 0.1).toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${(-ini).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`
    ini += len
  }
  const a = (limite * 360 - 90) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
  const p1 = [cx + (R - E / 2 - 7) * c, cy + (R - E / 2 - 7) * s], p2 = [cx + (R + E / 2 + 7) * c, cy + (R + E / 2 + 7) * s]
  const lab = [cx + (R + E / 2 + 16) * c, cy + (R + E / 2 + 16) * s + 6]
  out += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`
  out += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="${RED}" stroke-width="4.5" stroke-linecap="round"/>`
  out += texto(lab[0], lab[1], `limite ${Math.round(limite * 100)}%`, { size: 17, weight: 700, cor: RED, ancora: c >= 0 ? 'start' : 'end' })
  return out
}

/** O SVG da imagem (puro, testável). */
export function svgDaAnalise(d: DadosImagem, logoBase64 = logo()): string {
  const liq = d.bruta - d.obrigatorios
  const tot = d.emprestimo + d.cartaoConsignado + d.cartaoBeneficio
  const soEmprestimo = d.alcance === 'emprestimo'
  const usa = soEmprestimo ? d.emprestimo : tot
  const lim = liq * d.limite
  const reducao = Math.max(0, usa - lim)
  const sobra = liq - tot
  const limTxt = `${Math.round(d.limite * 100)}%`
  const fatias = ([
    ['emprestimo', 'Empréstimo consignado', d.emprestimo],
    ['cartaoConsignado', 'Cartão consignado', d.cartaoConsignado],
    ['cartaoBeneficio', 'Cartão benefício', d.cartaoBeneficio],
  ] as const).filter(f => f[2] > 0)

  const o: string[] = []
  o.push(`<rect width="1080" height="1350" fill="#F4F5F7"/>`)
  // topo
  o.push(`<rect width="1080" height="140" fill="${NAVY}"/><rect y="140" width="1080" height="6" fill="${GOLD}"/>`)
  o.push(`<image x="56" y="28" width="472" height="84" href="data:image/png;base64,${logoBase64}"/>`)
  o.push(texto(1024, 52, 'Análise do seu', { size: 30, weight: 700, cor: '#fff', ancora: 'end', serif: true }))
  o.push(texto(1024, 86, 'contracheque', { size: 30, weight: 700, cor: '#fff', ancora: 'end', serif: true }))
  o.push(texto(1024, 116, corta([d.orgao, d.competencia].filter(Boolean).join(' · '), 44), { size: 19, cor: GOLD, ancora: 'end' }))
  // saudação
  o.push(texto(56, 200, `${d.nome ? `${corta(d.nome, 22)}, este` : 'Este'} é o resultado da sua análise`, { size: 31, weight: 600 }))
  o.push(texto(56, 236, 'Calculado com os valores do contracheque que você enviou.', { size: 21, cor: INK2 }))
  // rosca
  o.push(`<rect x="56" y="266" width="500" height="372" rx="22" fill="#fff"/>`)
  o.push(rosca(306, 452, fatias.map(f => ({ cor: COR[f[0]], v: f[2] })), liq, d.limite))
  o.push(texto(306, 462, pct(tot / liq), { size: 52, weight: 700, cor: NAVY, ancora: 'middle', serif: true }))
  o.push(texto(306, 489, 'da renda líquida', { size: 16, cor: INK2, ancora: 'middle' }))
  o.push(texto(306, 509, 'em consignados', { size: 16, cor: INK2, ancora: 'middle' }))
  // redução
  o.push(`<rect x="580" y="266" width="444" height="372" rx="22" fill="${NAVY}"/>`)
  o.push(`<rect x="610" y="306" width="384" height="1" fill="#2B4A72"/><rect x="610" y="394" width="384" height="1" fill="#2B4A72"/>`)
  o.push(texto(610, 342, soEmprestimo ? 'Empréstimos hoje' : 'Descontado hoje', { size: 19, cor: '#C9D3E3' }), texto(994, 342, brl(usa), { size: 19, weight: 700, cor: '#fff', ancora: 'end' }))
  o.push(texto(610, 374, `Limite (${limTxt})`, { size: 19, cor: '#C9D3E3' }), texto(994, 374, brl(lim), { size: 19, weight: 700, cor: '#fff', ancora: 'end' }))
  o.push(texto(610, 452, 'Com a ação de readequação de', { size: 22, cor: '#C9D3E3' }))
  o.push(texto(610, 482, 'margem, é possível reduzir cerca de', { size: 22, cor: '#C9D3E3' }))
  o.push(texto(610, 578, brl(reducao), { size: 58, weight: 700, cor: GOLD, serif: true }))
  o.push(texto(610, 612, 'por mês nos descontos', { size: 21, cor: '#fff' }))
  // lista da renda líquida
  const linhas = [
    ...fatias.map(f => ({ cor: COR[f[0]], nome: f[1], v: f[2], p: f[2] / liq, vermelho: false })),
    { cor: 'url(#livreQ)', nome: 'Sobra para você', v: sobra, p: sobra / liq, vermelho: false },
    { cor: RED, nome: `Limite para ${soEmprestimo ? 'empréstimo consignado' : 'consignados'} (${limTxt})`, v: lim, p: d.limite, vermelho: true },
  ]
  const yl = 662, hl = 76 + linhas.length * 43
  o.push(`<rect x="56" y="${yl}" width="968" height="${hl}" rx="22" fill="#fff"/>`)
  o.push(texto(88, yl + 44, `Sua renda líquida de ${brl(liq)}`, { size: 22, weight: 700 }))
  linhas.forEach((l, i) => {
    const y = yl + 86 + i * 43
    o.push(l.vermelho ? `<rect x="88" y="${y - 10}" width="22" height="6" rx="3" fill="${RED}"/>` : `<rect x="88" y="${y - 18}" width="22" height="22" rx="6" fill="${l.cor}"/>`)
    o.push(texto(124, y, l.nome, { size: 20, weight: l.vermelho ? 600 : 400, cor: l.vermelho ? RED : INK2 }))
    o.push(texto(891, y, brl(l.v), { size: 20, weight: 700, cor: l.vermelho ? RED : INK, ancora: 'end' }))
    o.push(texto(992, y, pct(l.p), { size: 20, cor: MUTED, ancora: 'end' }))
    if (i < linhas.length - 1) o.push(`<rect x="88" y="${y + 15}" width="904" height="1" fill="${LINE}"/>`)
  })
  // conta
  const yc = yl + hl + 22
  o.push(`<rect x="56" y="${yc}" width="968" height="156" rx="22" fill="#fff"/>`)
  const conta: Array<[string, string, boolean]> = [
    ['Renda bruta', brl(d.bruta), false],
    ['Descontos obrigatórios (previdência, IR, pensão)', `− ${brl(d.obrigatorios)}`, false],
    ['Renda líquida', brl(liq), true],
  ]
  conta.forEach(([a, b, forte], i) => {
    const y = yc + 42 + i * 43
    o.push(texto(88, y, a, { size: 20, cor: INK2 }), texto(992, y, b, { size: forte ? 23 : 20, weight: 700, cor: forte ? NAVY : INK, ancora: 'end' }))
    if (i < conta.length - 1) o.push(`<rect x="88" y="${y + 15}" width="904" height="1" fill="${LINE}"/>`)
  })
  // rodapé
  o.push(`<rect y="1220" width="1080" height="130" fill="${NAVY}"/>`)
  o.push(texto(56, 1262, 'Próximo passo: reunião online com o advogado especialista', { size: 21, weight: 700, cor: '#fff' }))
  o.push(texto(56, 1296, 'Estimativa feita com base no contracheque enviado. Não é garantia de resultado: a avaliação', { size: 17, cor: '#C9D3E3' }))
  o.push(texto(56, 1320, 'do seu caso é feita pelo advogado na reunião.', { size: 17, cor: '#C9D3E3' }))

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
<defs>
  <pattern id="livre" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#E9ECF0"/><rect width="5" height="10" fill="#DDE2E8"/></pattern>
  <pattern id="livreQ" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#E9ECF0"/><rect width="3.5" height="7" fill="#C7CED8"/></pattern>
</defs>
${o.join('\n')}
</svg>`
}

/** PNG da análise (resvg + fontes de assets/). */
export async function pngDaAnalise(d: DadosImagem): Promise<Buffer> {
  const { Resvg } = await import('@resvg/resvg-js')
  const fontes = ['Inter-Regular.otf', 'Inter-SemiBold.otf', 'Inter-Bold.otf', 'PlayfairDisplay-Bold.ttf'].map(f => path.join(ASSETS(), f))
  const r = new Resvg(svgDaAnalise(d), { font: { fontFiles: fontes, loadSystemFonts: false, defaultFontFamily: 'Inter' }, fitTo: { mode: 'original' } })
  return Buffer.from(r.render().asPng())
}

/** Chave da URL da imagem de um lead (a Stevo baixa por ela; ninguém lista as imagens). */
export const chaveImagem = (leadId: number, segredo = CONFIG.webhookSecret) =>
  crypto.createHmac('sha256', segredo).update(`imagem-analise:${leadId}`).digest('hex').slice(0, 24)

export const urlImagem = (leadId: number) => `${CONFIG.selfUrl}/api/imagem-analise?lead=${leadId}&k=${chaveImagem(leadId)}`

/** IMAGEM_ANALISE=todos, ou a lista de leads de teste ("22389918,123"). */
export const imagemLigada = (leadId: number) =>
  CONFIG.imagemAnalise === 'todos' || CONFIG.imagemAnalise.split(/[,\s]+/).includes(String(leadId))

const LEGENDA = 'Resumo da sua análise'

/** Manda a imagem pela conversa da Stevo do lead e deixa registro no histórico e no card. */
export async function enviarImagemAnalise(leadId: number): Promise<string | null> {
  const { rotaDoLead, marcarEnvioDaIA, respondido } = await import('./stevo-conversa')
  const { enviarImagem } = await import('./stevo')
  const { appendMessage, rememberSent } = await import('./history')
  const { addLeadNote } = await import('./kommo')
  const rota = await rotaDoLead(leadId)
  if (!rota) return null
  await rememberSent(leadId, LEGENDA) // o eco da Stevo traz a legenda: não pode contar como a equipe falando
  const id = await enviarImagem(rota.canal, rota.fone, urlImagem(leadId), LEGENDA)
  await marcarEnvioDaIA(id)
  await respondido(rota.canal, rota.fone)
  await appendMessage(leadId, { id: crypto.randomUUID(), dir: 'out', text: `[imagem com o resumo da análise] ${LEGENDA}`, ts: Date.now() })
  await addLeadNote(leadId, `🖼️ Lia enviou ao cliente a imagem da análise: ${urlImagem(leadId)}`)
  return id
}
