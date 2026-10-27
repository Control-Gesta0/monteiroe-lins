import { CRM_MAP } from './crm-map'
import { checkReply, type Violation } from './guards'

/**
 * BASE (núcleo puro) · Lia / Monteiro & Lins: os textos que a equipe do escritório
 * pode pedir para mudar pela Central (aba Ensinar). Sem env, sem Redis: testado em `npm test`.
 *
 * Dois lugares de origem:
 *  - prompt: blocos marcados em prompts/nucleo.md e prompts/portas/superendividamento.md
 *    com <!-- base:id -->…<!-- /base -->. Os marcadores nunca chegam ao modelo:
 *    renderPrompt() troca pelo texto vigente. Sem edição, o prompt renderizado é
 *    BYTE A BYTE o de antes dos marcadores (provado em scripts/test-cliente.ts).
 *  - código: as mensagens aprovadas que o sistema manda sem o modelo (desqualificação,
 *    revisão, 24h, confirmação da reunião). Um mesmo id pode estar nos dois.
 *
 * Fica FORA da base (vira pedido para a Control Gestão no curador): a regra da planilha,
 * a agenda, o roteiro, quando passar para a equipe, as travas da OAB.
 */

export const ITENS = [
  { id: 'escritorio', grupo: 'escritorio', titulo: 'Quem é o escritório', ajuda: 'Frase que a Lia usa para apresentar o escritório: desde quando atua, especialidade e quem costuma atender.' },
  { id: 'fatos', grupo: 'escritorio', titulo: 'O que a Lia sabe do escritório', ajuda: 'Endereço, registro na OAB, análise gratuita, número de processos, o teto de 40% do decreto, prazo e formato da reunião. A Lia só afirma o que estiver aqui.' },
  { id: 'golpe', grupo: 'conversa', titulo: 'Resposta para "isso é golpe?"', ajuda: 'O que a Lia responde quando o lead desconfia.' },
  { id: 'exemplos', grupo: 'conversa', titulo: 'Exemplos do jeito de escrever', ajuda: 'Trechos de conversa boa que a Lia imita no tom. Cole aqui conversas reais do comercial (sem dados pessoais).' },
  { id: 'enc_renda_abaixo', grupo: 'encerramentos', titulo: 'Renda abaixo do mínimo', ajuda: 'Enviada pelo sistema quando a renda bruta do contracheque não passa de R$ 10.000. Indica a Defensoria.' },
  { id: 'enc_alivio_baixo', grupo: 'encerramentos', titulo: 'Redução pequena demais', ajuda: 'Enviada pelo sistema quando a análise mostra que a parcela baixaria pouco e a ação não compensa.' },
  { id: 'enc_revisao', grupo: 'encerramentos', titulo: 'Contracheque para a equipe conferir', ajuda: 'Enviada quando o contracheque tem descontos que o sistema não reconheceu. Promete resposta em até 24 horas.' },
  { id: 'enc_atendimento', grupo: 'encerramentos', titulo: 'Passagem para a equipe (24 horas)', ajuda: 'Quando o lead já é cliente, pergunta do processo ou pede uma pessoa. Promete resposta em até 24 horas.' },
  { id: 'confirmacao', grupo: 'encerramentos', titulo: 'Confirmação da reunião', ajuda: 'Enviada pelo sistema quando a reunião é marcada. {horario} vira "quinta (16/10) às 10h" e {onde} vira "por videochamada aqui no WhatsApp" ou o endereço.', exige: ['{horario}', '{onde}'] },
] as const

export type ItemId = (typeof ITENS)[number]['id']
export type Textos = Record<ItemId, string>

/** Informação nova que a equipe pediu para a IA acrescentar (vira a seção 7 do núcleo). */
export interface Extra { id: string; titulo: string; texto: string }

export const ehExtraId = (id: string) => /^extra_[a-z0-9]{4,16}$/.test(id)

export const GRUPOS: Record<string, string> = {
  escritorio: 'O escritório',
  conversa: 'Conversa',
  encerramentos: 'Mensagens que o sistema envia',
}

export const ehItem = (id: string): id is ItemId => ITENS.some(i => i.id === id)
const meta = (id: ItemId) => ITENS.find(i => i.id === id)! as { exige?: readonly string[] }

/** Textos que moram no código (as ferramentas usam estes). */
export const PADRAO_CODIGO: Partial<Textos> = {
  enc_renda_abaixo: CRM_MAP.sdr.textos.renda_abaixo,
  enc_alivio_baixo: CRM_MAP.sdr.textos.alivio_baixo,
  enc_revisao: CRM_MAP.sdr.textos.revisao_humana,
  enc_atendimento: CRM_MAP.sdr.textos.atendimento,
  confirmacao: 'Fechado: {horario}, {onde}. Até lá!',
}

const BLOCO = /<!-- base:([a-z_]+) -->(\n?)([\s\S]*?)(\n?)<!-- \/base -->/g

/** Os textos padrão: os blocos dos prompts + os do código. Mesmo id nos dois tem que ser igual. */
export function textosPadrao(templates: string[]): Textos {
  const out: Partial<Textos> = { ...PADRAO_CODIGO }
  for (const t of templates) {
    for (const m of t.matchAll(BLOCO)) {
      const id = m[1]
      if (!ehItem(id)) throw new Error(`marcador desconhecido no prompt: base:${id}`)
      if (PADRAO_CODIGO[id] !== undefined && PADRAO_CODIGO[id] !== m[3]) throw new Error(`base:${id} no prompt difere do texto do código`)
      out[id] = m[3]
    }
  }
  const faltam = ITENS.filter(i => out[i.id] === undefined).map(i => i.id)
  if (faltam.length) throw new Error(`itens sem texto padrão: ${faltam.join(', ')}`)
  return out as Textos
}

/** Seção com as informações acrescentadas pela equipe (só existe se houver alguma). */
export function secaoExtras(extras: Extra[]): string {
  if (!extras.length) return ''
  return [
    '',
    '',
    '## 7. Informações cadastradas pela equipe do escritório',
    'Use quando o lead perguntar sobre isto. Responda com as suas palavras, em poucas frases, sem inventar além do que está aqui. As regras da seção 3 continuam valendo (sem promessa de resultado, sem valor de honorários).',
    ...extras.map(e => `\n**${e.titulo}**\n${e.texto}`),
  ].join('\n')
}

/** Um arquivo de prompt com cada bloco marcado trocado pelo texto vigente (ou o padrão), sem marcadores. */
export function renderTemplate(template: string, textos: Partial<Textos> = {}): string {
  // a quebra de linha colada no marcador é do marcador (bloco em linha própria): sai junto
  return template.replace(BLOCO, (_t, id: string, _nl1: string, padrao: string) => {
    if (!ehItem(id)) throw new Error(`marcador desconhecido no prompt: base:${id}`)
    const v = textos[id]
    return v === undefined ? padrao : v
  })
}

/** Núcleo renderizado + informações acrescentadas no fim. */
export function renderNucleo(template: string, textos: Partial<Textos> = {}, extras: Extra[] = []): string {
  const r = renderTemplate(template, textos)
  return extras.length ? r.replace(/\s*$/, '') + secaoExtras(extras) + '\n' : r
}

/** Vigente = padrão + o que foi publicado por cima (só ids conhecidos). */
export function mesclar(padrao: Textos, ...camadas: Array<Partial<Record<string, string>> | undefined | null>): Textos {
  const out = { ...padrao }
  for (const c of camadas) for (const [id, v] of Object.entries(c || {})) if (ehItem(id) && typeof v === 'string') out[id] = v
  return out
}

/** Confirmação da reunião com o horário e o lugar. */
export function confirmacao(textos: Partial<Textos>, horario: string, onde: string): string {
  return (textos.confirmacao ?? PADRAO_CODIGO.confirmacao!).replace('{horario}', horario).replace('{onde}', onde)
}

const MAX = 3000

const PORQUE: Record<string, string> = {
  'prometeu resultado': 'promete resultado (proibido pelo Código de Ética da OAB)',
  'afirmou redução certa': 'afirma que a parcela "vai baixar" (use "pode baixar")',
  'citou chance de vitória': 'cita chance de vitória',
  'prometeu redução percentual': 'promete redução em porcentagem',
  'falou de honorários com valor': 'fala de honorários com valor (isso é na reunião)',
  'margem errada (o teto é 40%)': 'cita 30% ou 35% da renda (o teto do decreto é 40%)',
  'travessão': 'tem travessão (use vírgula, ponto ou dois-pontos)',
  'texto corrompido': 'tem marcação de sistema',
}

/** Trava em código antes do exame: o que a Lia nunca pode mandar não entra na base. */
export function validarTexto(id: string, texto: string): string[] {
  const extra = ehExtraId(id)
  if (!ehItem(id) && !extra) return ['item desconhecido']
  const t = String(texto ?? '')
  const out: string[] = []
  const max = extra ? 1500 : MAX
  if (!t.trim()) out.push('O texto está vazio.')
  if (t.length > max) out.push(`O texto passou de ${max} caracteres (tem ${t.length}).`)
  if (/<!--|-->|\{\{|^#+ /m.test(t)) out.push('O texto tem marcação de sistema (<!--, -->, {{ ou título com #).')
  for (const x of (extra ? [] : meta(id as ItemId).exige || [])) if (t.split(x).length - 1 !== 1) out.push(`O texto precisa ter ${x} uma vez.`)
  if (id.startsWith('enc_') || id === 'confirmacao') if (/\?/.test(t)) out.push('Mensagem de encerramento não pode ter pergunta: depois dela quem responde é a equipe.')
  if (/fico [àa] disposi|espero ter ajudado/i.test(t)) out.push('O texto tem frase de robô ("fico à disposição", "espero ter ajudado").')
  const violacoes: Violation[] = checkReply(t).filter(v => v.regra !== 'mais de uma pergunta' && v.regra !== 'vazio')
  for (const v of violacoes) out.push(`O texto ${PORQUE[v.regra] || v.regra}: "${v.trecho}".`)
  return out
}

export function validarExtra(e: Extra): string[] {
  const out: string[] = []
  if (!ehExtraId(e.id)) out.push('id inválido')
  if (!e.titulo?.trim() || e.titulo.length > 80) out.push('O título precisa ter de 1 a 80 caracteres.')
  if (/[*#<>]/.test(e.titulo || '')) out.push('O título não pode ter *, #, < ou >.')
  return [...out, ...validarTexto(e.id, e.texto)]
}

/** Troca exata feita pela IA: "de" precisa aparecer UMA vez no texto atual. */
export function aplicarTroca(texto: string, de: string, para: string): { texto?: string; erro?: string } {
  if (!de) return { erro: 'trecho "de" vazio' }
  const n = texto.split(de).length - 1
  if (n === 0) return { erro: `o trecho "${de.slice(0, 80)}" não existe no texto atual (copie exatamente, com pontuação)` }
  if (n > 1) return { erro: `o trecho "${de.slice(0, 80)}" aparece ${n} vezes; use um trecho maior, que apareça uma vez só` }
  return { texto: texto.replace(de, () => para) }
}

export function mudancas(antes: Textos, depois: Textos): ItemId[] {
  return ITENS.map(i => i.id).filter(id => antes[id] !== depois[id])
}

/** A resposta trouxe o texto da base? 60% das palavras com 4+ letras do texto aparecem na resposta. */
export function trouxeTexto(resposta: string, texto: string): boolean {
  const palavras = (s: string) => new Set(s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{4,}/g) || [])
  const alvo = palavras(resposta)
  const base = [...palavras(texto)]
  if (!base.length) return true
  return base.filter(p => alvo.has(p)).length / base.length >= 0.6
}
