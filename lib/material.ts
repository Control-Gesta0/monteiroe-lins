import OpenAI from 'openai'
import { CONFIG } from './config'
import { addUsage, type Usage } from './execlog'

/**
 * MATERIAL para a Base de dados: arquivo ou link que a equipe manda na conversa
 * "Pedir mudança". Vira TEXTO aqui (uma vez) e o curador usa como fonte; o
 * arquivo em si não é guardado. PDF e imagem são lidos pela OpenAI (chave do
 * cliente); Word por extração de texto; texto, Markdown e CSV direto.
 */

export interface Anexo { nome: string; tipo?: string; base64: string }

export interface MaterialLido {
  nome: string
  origem: 'arquivo' | 'link'
  tipo: string
  caracteres: number
  texto: string
  url?: string
  erro?: string
}

export const MAX_ARQUIVO = 3 * 1024 * 1024
const MAX_TEXTO = 30_000

const INSTRUCAO_LEITURA = [
  'Você transcreve material que a equipe da Monteiro & Lins Advocacia (ação de superendividamento para policiais e bombeiros do RJ) mandou para atualizar a base de conhecimento da Lia, a assistente virtual do WhatsApp.',
  'Devolva o CONTEÚDO em texto corrido, fiel ao original: títulos, passos, prazos, documentos pedidos e regras. Tabelas viram linhas "coluna: valor".',
  'Em imagem (print de conversa, folheto, tela), descreva e copie os textos visíveis.',
  'Não invente nada que não esteja no material. Não copie CPF, telefone, número de processo nem dado pessoal de cliente.',
].join(' ')

const extensao = (nome: string) => (nome.split('.').pop() || '').toLowerCase()

function tipoDe(nome: string, mime = ''): 'texto' | 'docx' | 'pdf' | 'imagem' | null {
  const ext = extensao(nome)
  if (['txt', 'md', 'csv', 'json'].includes(ext) || /^text\//.test(mime)) return 'texto'
  if (ext === 'docx' || /officedocument\.wordprocessingml/.test(mime)) return 'docx'
  if (ext === 'pdf' || /pdf/.test(mime)) return 'pdf'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) || /^image\//.test(mime)) return 'imagem'
  return null
}

const limpar = (t: string) => t.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

async function lerComIA(buf: Buffer, tipo: 'pdf' | 'imagem', mime: string, usage: Usage): Promise<string> {
  const b64 = buf.toString('base64')
  const content: OpenAI.Chat.ChatCompletionContentPart[] = tipo === 'pdf'
    ? [{ type: 'file', file: { filename: 'material.pdf', file_data: `data:application/pdf;base64,${b64}` } }]
    : [{ type: 'image_url', image_url: { url: `data:${mime || 'image/png'};base64,${b64}` } }]
  const r = await new OpenAI({ apiKey: CONFIG.openaiApiKey }).chat.completions.create({
    model: CONFIG.visionModel,
    max_completion_tokens: 8000,
    messages: [{ role: 'system', content: INSTRUCAO_LEITURA }, { role: 'user', content }],
  })
  addUsage(usage, r.usage)
  return r.choices[0]?.message?.content || ''
}

async function extrair(buf: Buffer, nome: string, mime: string, usage: Usage): Promise<string> {
  const tipo = tipoDe(nome, mime)
  if (!tipo) throw new Error('formato não aceito (use PDF, Word .docx, texto, Markdown, CSV ou imagem; planilha Excel: salve como CSV)')
  if (tipo === 'texto') return buf.toString('utf-8')
  if (tipo === 'docx') {
    const mammoth = await import('mammoth')
    return (await mammoth.extractRawText({ buffer: buf })).value
  }
  return lerComIA(buf, tipo, mime, usage)
}

export async function lerArquivo(a: Anexo, usage: Usage): Promise<MaterialLido> {
  const nome = String(a.nome || 'arquivo').slice(0, 120)
  const base = { nome, origem: 'arquivo' as const, tipo: extensao(nome) || 'arquivo', caracteres: 0, texto: '' }
  try {
    const buf = Buffer.from(String(a.base64 || '').replace(/^data:[^,]*,/, ''), 'base64')
    if (!buf.length) throw new Error('arquivo vazio')
    if (buf.length > MAX_ARQUIVO) throw new Error(`arquivo maior que ${MAX_ARQUIVO / 1024 / 1024} MB`)
    const texto = limpar(await extrair(buf, nome, String(a.tipo || ''), usage)).slice(0, MAX_TEXTO)
    if (!texto) throw new Error('não encontrei texto no arquivo')
    return { ...base, texto, caracteres: texto.length }
  } catch (e) {
    return { ...base, erro: (e instanceof Error ? e.message : String(e)).slice(0, 200) }
  }
}

/** Só http(s) público: bloqueia localhost, IP privado e o metadado da nuvem (o agente busca o link). */
export function linkPermitido(raw: string): URL | null {
  let u: URL
  try { u = new URL(raw) } catch { return null }
  if (!/^https?:$/.test(u.protocol)) return null
  const h = u.hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return null
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h.includes(':') || /^\[/.test(h)) return null
  return u
}

/** Documento e planilha do Google viram o link de exportação (precisam estar compartilhados com "qualquer pessoa com o link"). */
export function linkDeExportacao(u: URL): URL {
  const doc = u.href.match(/^https:\/\/docs\.google\.com\/document\/d\/([\w-]+)/)
  if (doc) return new URL(`https://docs.google.com/document/d/${doc[1]}/export?format=txt`)
  const planilha = u.href.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/)
  if (planilha) return new URL(`https://docs.google.com/spreadsheets/d/${planilha[1]}/export?format=csv`)
  return u
}

export function htmlParaTexto(html: string): string {
  return limpar(html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n'))
}

export async function lerLink(raw: string, usage: Usage): Promise<MaterialLido> {
  const base = { nome: raw.slice(0, 120), origem: 'link' as const, tipo: 'link', caracteres: 0, texto: '', url: raw.slice(0, 500) }
  const u = linkPermitido(raw)
  if (!u) return { ...base, erro: 'link inválido ou não público' }
  try {
    const alvo = linkDeExportacao(u)
    // redirecionamento seguido à mão: cada salto passa pela mesma trava (nada de cair em endereço interno)
    let atual = alvo
    let res: Response | null = null
    for (let salto = 0; salto < 5; salto++) {
      res = await fetch(atual, {
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' },
      })
      const destino = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
      if (!destino) break
      const proximo = linkPermitido(new URL(destino, atual).href)
      if (!proximo) throw new Error('o link redirecionou para um endereço não público')
      atual = proximo
      res = null
    }
    if (!res) throw new Error('redirecionamentos demais')
    if (!res.ok) throw new Error(`o site respondeu ${res.status}${/google\.com/.test(alvo.hostname) ? ' (o arquivo do Google precisa estar compartilhado com "qualquer pessoa com o link")' : ''}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_ARQUIVO) throw new Error('o conteúdo do link passa de 3 MB')
    const mime = res.headers.get('content-type') || ''
    let texto: string
    if (/html/.test(mime)) {
      const html = buf.toString('utf-8')
      const titulo = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()
      if (titulo) base.nome = titulo.slice(0, 120)
      texto = htmlParaTexto(html)
    } else {
      const nome = atual.pathname.split('/').pop() || 'link'
      texto = await extrair(buf, /\.\w{2,4}$/.test(nome) ? nome : `${nome}.${/csv/.test(mime) ? 'csv' : /pdf/.test(mime) ? 'pdf' : /image\//.test(mime) ? 'png' : 'txt'}`, mime, usage)
    }
    texto = limpar(texto).slice(0, MAX_TEXTO)
    if (!texto) throw new Error('não encontrei texto no link')
    return { ...base, tipo: /html/.test(mime) ? 'página' : mime.split(';')[0] || 'link', texto, caracteres: texto.length }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ...base, erro: (/timeout|aborted/i.test(msg) ? 'o site demorou demais para responder' : msg).slice(0, 200) }
  }
}

/** Links colados no texto do pedido (até 3). */
export function linksDoTexto(texto: string): string[] {
  return [...new Set((texto.match(/https?:\/\/[^\s<>"')]+/g) || []).map(l => l.replace(/[.,;:!?]+$/, '')))].slice(0, 3)
}
