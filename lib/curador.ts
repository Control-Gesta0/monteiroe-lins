import OpenAI from 'openai'
import { candidata, salvarNoRascunho } from './base'
import { ITENS, aplicarTroca, ehExtraId, ehItem, trouxeTexto, validarExtra, validarTexto, type Extra, type ItemId, type Textos } from './base-core'
import { CONFIG } from './config'
import { addUsage, costUsd, emptyUsage } from './execlog'
import { lerArquivo, lerLink, linksDoTexto, type Anexo, type MaterialLido } from './material'
import { k, redis } from './redis'

/**
 * CURADOR da base: a equipe da Monteiro & Lins pede em português ("o fundador é o
 * Cel. Fulano, da PMERJ", "acrescenta que tem estacionamento na rua", ou corrige
 * uma resposta do laboratório ou de uma conversa real) e a IA, com a chave OpenAI
 * do agente, decide o destino e escreve a mudança. A equipe nunca edita texto à mão.
 *
 * Travas em código: a IA muda texto só por troca EXATA de trecho (o resto fica
 * idêntico), tudo passa por validarTexto, e o resultado vai para o RASCUNHO.
 * O WhatsApp só muda depois do exame (lib/exame.ts). Regra de atendimento (planilha,
 * agenda, roteiro) vira pedido para a Control Gestão; honorários e promessa são recusados.
 */

export type Destino = 'base' | 'nova_informacao' | 'control_gestao' | 'recusado' | 'pergunta' | 'nenhum'

export interface Mudanca {
  tipo: 'trocar' | 'nova' | 'remover'
  id: string
  titulo: string
  antes: string
  depois: string
}

export interface Correcao {
  /** teste: laboratório (sessao + mensagemId) · real: conversa do WhatsApp (contato + ts da execução) */
  fonte?: 'teste' | 'real'
  sessao?: string
  mensagemId?: string
  contato?: string
  nome?: string
  ts?: string
  /** a conversa até a resposta marcada (já com PII mascarada nas conversas reais) */
  lead: string
  /** a resposta que a equipe marcou como errada */
  resposta: string
  comoDeveria: string
  porque: string
}

export interface MsgConversa {
  id: string
  ts: string
  papel: 'equipe' | 'ia'
  texto: string
  origem?: 'base' | 'teste' | 'real'
  correcao?: Correcao
  analise?: { comoDeveria: string; porque: string }
  destino?: Destino
  mudancas?: Mudanca[]
  desfeita?: boolean
  custoUsd?: number | null
  /** arquivos e links que a equipe mandou (só os metadados: o conteúdo não é guardado) */
  anexos?: Array<Pick<MaterialLido, 'nome' | 'origem' | 'tipo' | 'caracteres' | 'url' | 'erro'>>
}

const K_CONVERSA = () => k('base', 'conversa')
const K_PEDIDOS = () => k('base', 'pedidos')
const MAX_DIA = 150
/** por pedido e no total: tudo que for acrescentado entra no prompt de cada mensagem */
export const MAX_NOVAS = 6
export const MAX_EXTRAS = 20_000

const novoId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export async function lerConversa(n = 100): Promise<MsgConversa[]> {
  return ((await redis.lrange<MsgConversa>(K_CONVERSA(), 0, n - 1)) || []).reverse()
}

async function guardar(m: MsgConversa) {
  await redis.lpush(K_CONVERSA(), m)
  await redis.ltrim(K_CONVERSA(), 0, 199)
}

const SISTEMA = `Você é o editor da base de conhecimento da Lia, a assistente virtual da Monteiro & Lins Advocacia no WhatsApp. O escritório atende policiais e bombeiros do RJ com desconto de consignado e cartão no contracheque (ação de superendividamento, teto de 40% da renda líquida pelo Decreto Estadual 50.516/2026). A Lia recebe o contracheque, conta o resultado da análise (feita em código, pela planilha do escritório) e marca a reunião com o advogado. A equipe do escritório fala com você em português e pede mudanças: corrigir um texto, acrescentar uma informação ou apontar uma resposta errada que a Lia deu. Você decide o destino e devolve SÓ um JSON.

DESTINOS
- "base": mudar um dos TEXTOS FIXOS listados. Use {"tipo":"trocar","id":"<id>","de":"<trecho EXATO do texto atual>","para":"<trecho novo>"}. Mude só o que foi pedido; mantenha quebras de linha e o resto idênticos. Para reescrever o texto todo, "de" é o texto inteiro. Pode haver várias trocas. O nome e a corporação do fundador entram no texto "escritorio" (troque o trecho entre colchetes).
- "nova_informacao": informação nova que a Lia precisa saber para responder (fato do escritório, documento que pedem, como funciona a reunião, estacionamento, prazo que o escritório confirmou). Use {"tipo":"nova","titulo":"<até 60 letras>","texto":"<o fato, em poucas frases>"}. Se já existe informação acrescentada sobre o mesmo assunto, use "trocar" nela (o id começa com extra_). Para tirar: {"tipo":"remover","id":"extra_..."}.
- "control_gestao": regra de atendimento: a regra de qualificação (renda mínima, 50%, R$ 1.000, Credcesta, planilha), dias e horários da agenda, ordem do roteiro, quando passar para a equipe, tags, etapas do funil, quem recebe a tarefa. Não mude nada; explique em uma frase que é regra do atendimento e vai como pedido para a Control Gestão, que testa e aplica.
- "recusado": valor de honorários, forma de pagamento, promessa de resultado, chance de vitória, "reduz até X%", garantia, dado pessoal de cliente. Não mude nada; explique que a Lia nunca informa isso (Código de Ética da OAB e a regra de honorários do escritório).
- "pergunta": o pedido não está claro. Faça UMA pergunta curta e não mude nada.
- "nenhum": não há o que mudar (por exemplo, a resposta já estava certa). Explique por quê.

REGRAS DOS TEXTOS (o sistema recusa o que quebrar estas regras)
- Sem travessão (— ou –). Sem "espero ter ajudado", "fico à disposição".
- Nada de "vai baixar", "vai ganhar", "garantido", chance de vitória, redução em porcentagem prometida, honorário com valor. Redução é sempre "pode baixar cerca de".
- O teto do decreto é 40% da renda líquida. Nunca escreva 30% ou 35% da renda.
- Mensagens de encerramento (ids enc_) e a confirmação não têm pergunta. A confirmação mantém {horario} e {onde} uma vez cada.
- Escreva como o comercial do escritório escreve no WhatsApp: educado, direto, sem juridiquês, frases curtas.

CORREÇÃO DE UMA RESPOSTA (do laboratório de teste ou de uma conversa real no WhatsApp)
Conversas reais vêm com CPF, CNPJ, telefone e e-mail mascarados ([cpf], [telefone]...): nunca copie esses dados para a base.
Quando a mensagem trouxer uma correção, preencha SEMPRE (mesmo com destino "nenhum", "control_gestao" ou "recusado"):
- "como_deveria": a mensagem que a Lia deveria ter mandado, pronta para o WhatsApp (siga as regras acima).
- "por_que": por que a resposta estava errada, em 1 ou 2 frases, apontando a causa: texto da base desatualizado, informação que faltava ou regra de atendimento.
E decida o destino da correção como em qualquer pedido. Números do caso (porcentagem comprometida, redução estimada) vêm da análise em código: se a equipe disser que a conta está errada, é "control_gestao".

COMO RESPONDER À EQUIPE
- Fale no passado do que você FEZ NA BASE, nomeando o texto ou a informação ("Troquei o nome do fundador no texto Quem é o escritório.", "Acrescentei a informação \"Estacionamento\"."). Você não muda o roteiro nem a análise: só textos e informações da base. Não fale de publicar, de exame nem de rascunho: o sistema acrescenta esse aviso.
- Em "control_gestao" e "recusado" você não mudou nada: diga isso com clareza.
- Se a conversa usou os textos NO AR e o que faltou já está no RASCUNHO, não crie de novo: destino "nenhum", explique que já está no rascunho e falta publicar.

MATERIAL ANEXADO (arquivo ou link que a equipe mandou)
- Use como FONTE. Tire só o que a Lia precisa saber para atender: fatos do escritório, documentos pedidos, como é a reunião, prazos que o escritório confirma.
- Se o material atualiza um TEXTO FIXO, use "trocar" nele. O resto vira informações novas curtas, uma por assunto (no máximo ${MAX_NOVAS} por pedido, até 1.500 caracteres cada; todas as acrescentadas somadas não passam de ${MAX_EXTRAS.toLocaleString('pt-BR')} caracteres), escritas como fato, em poucas frases.
- Nunca copie dados pessoais de clientes, valor de honorários ou promessa de resultado, mesmo que estejam no material.
- Se o material não tem nada útil para o atendimento, destino "nenhum" e explique.

FORMATO (só JSON)
{"resposta":"o que você entendeu e o que fez, 1 a 3 frases, falando com a equipe","destino":"base|nova_informacao|control_gestao|recusado|pergunta|nenhum","como_deveria":"","por_que":"","mudancas":[]}`

function descreverBase(textos: Textos, extras: Extra[]): string {
  const fixos = ITENS.map(i => `### ${i.id} · ${i.titulo}\nPara que serve: ${i.ajuda}\nTexto atual:\n${textos[i.id]}`).join('\n\n')
  const ext = extras.length
    ? extras.map(e => `### ${e.id} · ${e.titulo}\nTexto atual:\n${e.texto}`).join('\n\n')
    : '(nenhuma ainda)'
  return `TEXTOS FIXOS\n\n${fixos}\n\nINFORMAÇÕES ACRESCENTADAS PELA EQUIPE\n\n${ext}`
}

function resumoConversa(msgs: MsgConversa[]): string {
  return msgs.slice(-10).map(m => {
    const muda = m.mudancas?.length ? ` [mudou: ${m.mudancas.map(x => x.titulo).join(', ')}${m.desfeita ? ' (desfeito)' : ''}]` : ''
    return `${m.papel === 'equipe' ? 'EQUIPE' : 'VOCÊ'}: ${m.texto.slice(0, 400)}${muda}`
  }).join('\n') || '(começo da conversa)'
}

interface Saida { resposta?: string; destino?: Destino; como_deveria?: string; por_que?: string; mudancas?: Array<{ tipo?: string; id?: string; de?: string; para?: string; titulo?: string; texto?: string }> }

/** Aplica as mudanças da IA numa cópia da candidata. Erro em qualquer uma = nada aplicado. */
export function aplicar(saida: Saida, textos: Textos, extras: Extra[]): { textos: Textos; extras: Extra[]; mudancas: Mudanca[]; erros: string[] } {
  const t = { ...textos }
  let ex = extras.map(e => ({ ...e }))
  const mudancas: Mudanca[] = []
  const erros: string[] = []
  for (const m of saida.mudancas || []) {
    if (m.tipo === 'trocar') {
      const id = String(m.id || '')
      const extra = ex.find(e => e.id === id)
      if (!ehItem(id) && !extra) { erros.push(`id desconhecido: ${id}`); continue }
      const atual = extra ? extra.texto : t[id as ItemId]
      const r = aplicarTroca(atual, String(m.de ?? ''), String(m.para ?? ''))
      if (r.erro) { erros.push(`${id}: ${r.erro}`); continue }
      const problemas = extra ? validarExtra({ ...extra, texto: r.texto! }) : validarTexto(id, r.texto!)
      if (problemas.length) { erros.push(`${id}: ${problemas.join(' ')}`); continue }
      const anterior = mudancas.find(x => x.id === id)
      if (anterior) anterior.depois = r.texto!
      else mudancas.push({ tipo: 'trocar', id, titulo: extra ? extra.titulo : ITENS.find(i => i.id === id)!.titulo, antes: atual, depois: r.texto! })
      if (extra) extra.texto = r.texto!
      else t[id as ItemId] = r.texto!
    } else if (m.tipo === 'nova') {
      const e: Extra = { id: `extra_${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`, titulo: String(m.titulo || '').trim(), texto: String(m.texto || '').trim() }
      const problemas = validarExtra(e)
      if (problemas.length) { erros.push(`nova "${e.titulo}": ${problemas.join(' ')}`); continue }
      // a mesma informação já existe (no ar ou no rascunho): não duplica
      const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
      const igual = ex.find(x => norm(x.titulo) === norm(e.titulo) || (trouxeTexto(x.texto, e.texto) && trouxeTexto(e.texto, x.texto)))
      if (igual) { erros.push(`a informação "${e.titulo}" já existe como ${igual.id} ("${igual.titulo}"): use "trocar" nela, ou destino "nenhum" se ela já diz isso`); continue }
      ex.push(e)
      mudancas.push({ tipo: 'nova', id: e.id, titulo: e.titulo, antes: '', depois: e.texto })
    } else if (m.tipo === 'remover') {
      const id = String(m.id || '')
      const e = ex.find(x => x.id === id)
      if (!ehExtraId(id) || !e) { erros.push(`remover: ${id} não é uma informação acrescentada`); continue }
      ex = ex.filter(x => x.id !== id)
      mudancas.push({ tipo: 'remover', id, titulo: e.titulo, antes: e.texto, depois: '' })
    } else {
      erros.push(`tipo de mudança desconhecido: ${m.tipo}`)
    }
  }
  // a assistente lê as informações acrescentadas a cada mensagem: material grande não pode inchar o prompt
  const novas = mudancas.filter(m => m.tipo === 'nova').length
  if (novas > MAX_NOVAS) erros.push(`${novas} informações novas de uma vez; o máximo é ${MAX_NOVAS} por pedido: junte as do mesmo assunto e deixe só o que a assistente precisa para responder`)
  const tamanho = (l: Extra[]) => l.reduce((n, e) => n + e.titulo.length + e.texto.length, 0)
  const total = tamanho(ex)
  if (total > MAX_EXTRAS && total > tamanho(extras)) erros.push(`as informações acrescentadas passariam de ${MAX_EXTRAS} caracteres (ficariam com ${total}): resuma, junte as do mesmo assunto ou remova as que não valem mais`)
  return { textos: t, extras: ex, mudancas, erros }
}

/**
 * Pedido da equipe (texto livre) ou correção do laboratório. A IA responde,
 * e o que ela mudar vai para o rascunho. Devolve as duas mensagens gravadas.
 */
export async function pedir(texto: string, correcao?: Correcao, anexos: Anexo[] = []): Promise<{ equipe?: MsgConversa; ia?: MsgConversa; erro?: string }> {
  const pedido = String(texto || '').trim().slice(0, 2000)
  const links = correcao ? [] : linksDoTexto(pedido)
  if (!pedido && !correcao && !anexos.length) return { erro: 'Escreva o que você quer mudar ou anexe um arquivo.' }
  if (anexos.length > 3) return { erro: 'Mande no máximo 3 arquivos por vez.' }
  const dia = k('base', 'curador', new Date().toISOString().slice(0, 10))
  const usados = await redis.incr(dia)
  if (usados === 1) await redis.expire(dia, 2 * 86400)
  if (usados > MAX_DIA) return { erro: `Limite de ${MAX_DIA} pedidos por dia atingido (protege o custo). Volta amanhã.` }

  // Arquivo e link viram texto UMA vez, aqui (o arquivo não é guardado)
  const usoLeitura = emptyUsage()
  const material: MaterialLido[] = [
    ...await Promise.all(anexos.map(a => lerArquivo(a, usoLeitura))),
    ...await Promise.all(links.map(l => lerLink(l, usoLeitura))),
  ]
  const lidos = material.filter(m => !m.erro)
  const semTexto = !pedido.replace(/https?:\/\/\S+/g, '').trim()
  if (material.length && !lidos.length && semTexto && !correcao) {
    return { erro: `Não consegui ler ${material.map(m => `"${m.nome}" (${m.erro})`).join(', ')}.` }
  }

  const historico = await lerConversa(12)
  const equipe: MsgConversa = {
    id: novoId('m'), ts: new Date().toISOString(), papel: 'equipe', texto: pedido, origem: correcao ? (correcao.fonte === 'real' ? 'real' : 'teste') : 'base', correcao,
    ...(material.length ? { anexos: material.map(({ nome, origem, tipo, caracteres, url, erro }) => ({ nome, origem, tipo, caracteres, ...(url ? { url } : {}), ...(erro ? { erro } : {}) })) } : {}),
  }
  await guardar(equipe)

  const c = await candidata()
  const openai = new OpenAI({ apiKey: CONFIG.openaiApiKey })
  const modelo = process.env.EDITOR_MODEL || CONFIG.llmModel
  const usage = emptyUsage()
  const pedidoTexto = correcao
    ? `${correcao.fonte === 'real' ? `CORREÇÃO DE UMA CONVERSA REAL NO WHATSAPP (contato ${correcao.nome || 'sem nome'})\nConversa real até a resposta marcada` : 'CORREÇÃO VINDA DO LABORATÓRIO\nConversa de teste até a resposta marcada'}:\n${correcao.lead}\n\nRESPOSTA QUE A EQUIPE MARCOU COMO ERRADA:\n${correcao.resposta}\n\nCOMO A EQUIPE DIZ QUE DEVERIA SER: ${correcao.comoDeveria || '(não disse)'}\nPOR QUE A EQUIPE ACHA QUE ESTÁ ERRADO: ${correcao.porque || '(não disse)'}${pedido ? `\nOBSERVAÇÃO: ${pedido}` : ''}`
    : `PEDIDO DA EQUIPE: ${pedido || '(sem texto: use o material anexado para atualizar a base)'}`
  // material: até 12 mil caracteres por item e 24 mil no total (o resto não cabe com qualidade num pedido)
  let orcamento = 24_000
  const blocoMaterial = lidos.map(m => {
    const t = m.texto.slice(0, Math.min(12_000, Math.max(0, orcamento)))
    orcamento -= t.length
    return `### ${m.nome} (${m.origem === 'link' ? `link ${m.url}` : `arquivo ${m.tipo}`}, ${m.caracteres} caracteres${t.length < m.caracteres ? `, cortado em ${t.length}` : ''})\n${t}`
  }).filter(b => !/\n$/.test(b)).join('\n\n')
  const falharam = material.filter(m => m.erro).map(m => `"${m.nome}": ${m.erro}`)
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SISTEMA },
    { role: 'system', content: descreverBase(c.textos, c.extras) },
    { role: 'system', content: `CONVERSA ATÉ AQUI COM A EQUIPE\n${resumoConversa(historico)}` },
    { role: 'user', content: pedidoTexto + (blocoMaterial ? `\n\nMATERIAL ANEXADO PELA EQUIPE\n\n${blocoMaterial}` : '') + (falharam.length ? `\n\n(não deu para ler: ${falharam.join('; ')})` : '') },
  ]

  let saida: Saida = {}
  let resultado = aplicar({}, c.textos, c.extras)
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await openai.chat.completions.create({ model: modelo, messages, response_format: { type: 'json_object' }, max_completion_tokens: lidos.length ? 6000 : 3000 })
    addUsage(usage, r.usage)
    const bruto = r.choices[0]?.message?.content || '{}'
    try { saida = JSON.parse(bruto) as Saida } catch { saida = { resposta: 'Não consegui entender o pedido. Pode explicar de outro jeito?', destino: 'pergunta', mudancas: [] } }
    if (!['base', 'nova_informacao'].includes(String(saida.destino))) saida.mudancas = []
    resultado = aplicar(saida, c.textos, c.extras)
    // correção sem diagnóstico não serve para a equipe: pede de novo
    if (correcao && (!String(saida.como_deveria || '').trim() || !String(saida.por_que || '').trim())) resultado.erros.push('correção sem "como_deveria" ou "por_que": preencha os dois')
    if (!resultado.erros.length) break
    messages.push({ role: 'assistant', content: bruto })
    messages.push({ role: 'system', content: `[SISTEMA] Nada foi aplicado. Problemas: ${resultado.erros.join(' | ')}. Corrija e devolva o JSON completo de novo (o "de" precisa ser copiado exatamente do texto atual e aparecer uma vez).` })
  }

  const custoModelo = costUsd(modelo, usage)
  const custoLeitura = usoLeitura.calls ? costUsd(CONFIG.visionModel, usoLeitura) : 0
  const custoUsd = custoModelo === null || custoLeitura === null ? null : Math.round((custoModelo + custoLeitura) * 1e6) / 1e6
  let destino: Destino = (['base', 'nova_informacao', 'control_gestao', 'recusado', 'pergunta', 'nenhum'] as const).find(d => d === saida.destino) || 'nenhum'
  let resposta = String(saida.resposta || '').trim() || 'Pronto.'
  if (resultado.erros.length) {
    destino = 'nenhum'
    resposta = `Não consegui aplicar esta mudança com segurança (${resultado.erros[0].slice(0, 200)}). Nada foi alterado. Pode descrever de outro jeito?`
    resultado.mudancas = []
  } else if (resultado.mudancas.length) {
    const textosMudados: Partial<Textos> = {}
    for (const m of resultado.mudancas) if (ehItem(m.id)) textosMudados[m.id] = resultado.textos[m.id]
    await salvarNoRascunho({ textos: textosMudados, ...(resultado.mudancas.some(m => ehExtraId(m.id)) ? { extras: resultado.extras } : {}) })
  }
  if (destino === 'control_gestao') {
    await redis.lpush(K_PEDIDOS(), { ts: new Date().toISOString(), pedido: pedido || correcao?.comoDeveria || '', correcao: correcao ? { resposta: correcao.resposta, comoDeveria: correcao.comoDeveria, porque: correcao.porque } : undefined })
    await redis.ltrim(K_PEDIDOS(), 0, 199)
  }

  if (falharam.length) resposta += ` Não consegui ler: ${falharam.join('; ')}.`
  if (destino === 'control_gestao') resposta += ' Nada mudou na base: ficou registrado como pedido para a Control Gestão.'
  if (resultado.mudancas.length) resposta += ' Está no rascunho: teste e publique com o exame para valer no WhatsApp.'
  const ia: MsgConversa = {
    id: novoId('m'), ts: new Date().toISOString(), papel: 'ia', texto: resposta, origem: equipe.origem, destino,
    mudancas: resultado.mudancas,
    ...(correcao ? { analise: { comoDeveria: String(saida.como_deveria || '').trim(), porque: String(saida.por_que || '').trim() } } : {}),
    custoUsd,
  }
  await guardar(ia)
  return { equipe, ia }
}

/** Desfaz as mudanças de uma resposta da IA no rascunho (só se ninguém mudou o mesmo texto depois). */
export async function desfazer(mensagemId: string): Promise<{ ok: boolean; erro?: string }> {
  const lista = (await redis.lrange<MsgConversa>(K_CONVERSA(), 0, 199)) || []
  const i = lista.findIndex(m => m.id === mensagemId)
  const m = lista[i]
  if (!m || m.papel !== 'ia' || !m.mudancas?.length) return { ok: false, erro: 'Não há mudança para desfazer nesta mensagem.' }
  if (m.desfeita) return { ok: false, erro: 'Já foi desfeita.' }
  const c = await candidata()
  const textos: Partial<Textos> = {}
  let extras = c.extras.map(e => ({ ...e }))
  let mexeuExtras = false
  for (const mu of [...m.mudancas].reverse()) {
    if (ehItem(mu.id)) {
      if (c.textos[mu.id] !== mu.depois) return { ok: false, erro: `"${mu.titulo}" mudou de novo depois desta mensagem: desfaça a mais nova primeiro.` }
      textos[mu.id] = mu.antes
    } else {
      mexeuExtras = true
      const atual = extras.find(e => e.id === mu.id)
      if (mu.tipo === 'nova') extras = extras.filter(e => e.id !== mu.id)
      else if (mu.tipo === 'remover') { if (!atual) extras.push({ id: mu.id, titulo: mu.titulo, texto: mu.antes }) }
      else if (atual) atual.texto = mu.antes
    }
  }
  await salvarNoRascunho({ textos, ...(mexeuExtras ? { extras } : {}) })
  await redis.lset(K_CONVERSA(), i, { ...m, desfeita: true })
  return { ok: true }
}

export async function contarPedidosControl(): Promise<number> {
  return Number(await redis.llen(K_PEDIDOS())) || 0
}
