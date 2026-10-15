import type { VercelRequest, VercelResponse } from '@vercel/node'
import { candidata, descartarRascunho, lerHistorico, lerRascunho, lerVigente, padrao, voltarPara } from '../lib/base'
import { GRUPOS, ITENS, ehExtraId, ehItem, validarExtra, validarTexto } from '../lib/base-core'
import { centralAutorizada, corpo } from '../lib/central-auth'
import { contextoReal, listarConversas, turnosDoContato } from '../lib/conversas-reais'
import { contarPedidosControl, desfazer, lerConversa, pedir, type Correcao } from '../lib/curador'
import { readExecs } from '../lib/execlog'
import { iniciarExame, lerExame } from '../lib/exame'
import { lerSessao } from '../lib/teste'

/**
 * Base da Lia na Central (aba Ensinar, header x-central-secret). A equipe NÃO edita texto:
 * pede em português e a IA (curador, token do cliente) muda o rascunho.
 *   GET                                   → textos (padrão, no ar, rascunho), conversa, versões, último exame
 *   GET  ?exame=<id>                      → andamento de um exame
 *   POST {acao:'pedir', texto, anexos?}   → a IA lê o pedido (e até 3 arquivos {nome,tipo,base64} ou links no texto) e muda o rascunho
 *   GET  ?conversas=1                     → conversas reais do WhatsApp (do diário, com PII mascarada)
 *   GET  ?conversa=<contactId>            → os turnos de uma conversa real
 *   POST {acao:'corrigir', sessao, mensagem, comoDeveria, porque} → correção de uma resposta do laboratório
 *   POST {acao:'corrigir_real', contato, ts, comoDeveria, porque}  → correção de uma resposta real
 *   POST {acao:'desfazer', mensagem}      → desfaz o que a IA mudou naquela resposta
 *   POST {acao:'descartar', id?}          → tira do rascunho (sem id: tudo)
 *   POST {acao:'publicar', nota}          → roda o exame com o rascunho; só publica se passar
 *   POST {acao:'voltar', versao}          → volta para uma versão anterior
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!centralAutorizada(req)) return res.status(401).json({ error: 'unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method === 'GET') {
      if (req.query.exame) return res.status(200).json({ exame: await lerExame(String(req.query.exame)) })
      if (req.query.conversas) return res.status(200).json({ conversas: listarConversas(await readExecs(2000)) })
      if (req.query.conversa) {
        const contato = String(req.query.conversa)
        return res.status(200).json({ contato, turnos: turnosDoContato(await readExecs(2000), contato) })
      }
      return res.status(200).json(await estado())
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'use GET ou POST' })
    const b = corpo(req)
    const acao = String(b.acao || '')
    if (acao === 'pedir') {
      const anexos = Array.isArray(b.anexos) ? b.anexos : []
      if (anexos.length > 3) return res.status(400).json({ erro: 'Mande no máximo 3 arquivos por vez.' })
      const r = await pedir(String(b.texto || ''), undefined, anexos.map((a: Record<string, unknown>) => ({ nome: String(a?.nome || 'arquivo'), tipo: String(a?.tipo || ''), base64: String(a?.base64 || '') })))
      if (r.erro) return res.status(409).json({ erro: r.erro })
      return res.status(200).json({ ok: true, resposta: r.ia, ...(await estado()) })
    }
    if (acao === 'corrigir') {
      const c = await montarCorrecao(String(b.sessao || ''), String(b.mensagem || ''), String(b.comoDeveria || ''), String(b.porque || ''))
      if ('erro' in c) return res.status(400).json({ erro: c.erro })
      const r = await pedir('', c)
      if (r.erro) return res.status(409).json({ erro: r.erro })
      return res.status(200).json({ ok: true, resposta: r.ia, ...(await estado()) })
    }
    if (acao === 'corrigir_real') {
      const comoDeveria = String(b.comoDeveria || '').trim().slice(0, 1500)
      const porque = String(b.porque || '').trim().slice(0, 1500)
      if (!comoDeveria && !porque) return res.status(400).json({ erro: 'Diga como deveria ser ou por que está errado.' })
      const contato = String(b.contato || '')
      const execs = await readExecs(2000)
      const ctx = contextoReal(turnosDoContato(execs, contato), String(b.ts || ''))
      if (!ctx) return res.status(400).json({ erro: 'Essa resposta não está mais no diário (ele guarda as 2.000 execuções mais novas).' })
      const nome = execs.find(e => String(e.leadId) === contato && e.nome)?.nome || 'Contato'
      const r = await pedir('', { fonte: 'real', contato, nome, ts: String(b.ts), lead: `(conversa real no WhatsApp, textos no ar)\n${ctx.lead}`, resposta: ctx.resposta, comoDeveria, porque })
      if (r.erro) return res.status(409).json({ erro: r.erro })
      return res.status(200).json({ ok: true, resposta: r.ia, ...(await estado()) })
    }
    if (acao === 'desfazer') {
      const r = await desfazer(String(b.mensagem || ''))
      if (!r.ok) return res.status(409).json({ erro: r.erro })
      return res.status(200).json({ ok: true, ...(await estado()) })
    }
    if (acao === 'descartar') {
      const id = b.id ? String(b.id) : undefined
      if (id && !ehItem(id) && !ehExtraId(id)) return res.status(400).json({ error: 'item desconhecido' })
      await descartarRascunho(id)
      return res.status(200).json({ ok: true, ...(await estado()) })
    }
    if (acao === 'publicar') {
      const r = await iniciarExame(String(b.nota || ''))
      return res.status(r.erro ? 409 : 202).json(r)
    }
    if (acao === 'voltar') {
      const v = await voltarPara(Number(b.versao))
      if (!v) return res.status(404).json({ error: 'versão não encontrada no histórico' })
      return res.status(200).json({ ok: true, ...(await estado()) })
    }
    return res.status(400).json({ error: 'acao inválida (pedir | corrigir | corrigir_real | desfazer | descartar | publicar | voltar)' })
  } catch (e) {
    return res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) })
  }
}

/** Contexto da correção: a conversa do laboratório até a resposta marcada (travada, a equipe não digita isso). */
async function montarCorrecao(sessao: string, mensagemId: string, comoDeveria: string, porque: string): Promise<Correcao | { erro: string }> {
  if (!/^[\w-]{8,64}$/.test(sessao)) return { erro: 'sessão inválida' }
  if (!comoDeveria.trim() && !porque.trim()) return { erro: 'Diga como deveria ser ou por que está errado.' }
  const s = await lerSessao(sessao)
  if (!s) return { erro: 'A conversa de teste expirou (fica 6 horas). Refaça o teste e corrija de novo.' }
  const i = s.history.findIndex(m => m.id === mensagemId)
  if (i < 0 || s.history[i].dir !== 'out') return { erro: 'Mensagem não encontrada nesta conversa de teste.' }
  const antes = s.history.slice(Math.max(0, i - 8), i)
  const d = s.detalhes[mensagemId]
  const contexto = [
    `(simulação: ${s.opcoes.perfil === 'cliente' ? 'quem escreve já é cliente do escritório' : 'lead novo do Funil/SDR'}, textos ${s.opcoes.versao === 'rascunho' ? 'do rascunho' : 'no ar'})`,
    ...antes.map(m => `${m.dir === 'in' ? 'LEAD' : 'LIA'}: ${m.text}`),
    d ? `(nessa resposta a Lia usou: ${d.tools.join(', ') || 'nenhuma ferramenta'}${d.guard.length ? `; travas: ${d.guard.join(' | ')}` : ''})` : '',
  ].filter(Boolean).join('\n')
  return {
    fonte: 'teste', sessao, mensagemId, lead: contexto.slice(0, 6000), resposta: s.history[i].text.slice(0, 3000),
    comoDeveria: comoDeveria.trim().slice(0, 1500), porque: porque.trim().slice(0, 1500),
  }
}

async function estado() {
  const [vig, rasc, hist, exame, c, conversa, pedidos] = await Promise.all([
    lerVigente(), lerRascunho(), lerHistorico(), lerExame(), candidata(), lerConversa(100), contarPedidosControl(),
  ])
  const base = padrao()
  const extrasNoAr = vig.extras || []
  return {
    versao: vig.versao,
    publicadoEm: vig.publicadoEm,
    nota: vig.nota || null,
    rascunhoEm: rasc.atualizadoEm,
    grupos: { ...GRUPOS, extras: 'Informações acrescentadas pela equipe' },
    itens: [
      ...ITENS.map(i => ({
        id: i.id, grupo: i.grupo as string, titulo: i.titulo, ajuda: i.ajuda,
        padrao: base[i.id],
        noAr: c.vigente[i.id],
        rascunho: rasc.textos[i.id] ?? null,
        problemas: rasc.textos[i.id] !== undefined ? validarTexto(i.id, rasc.textos[i.id]!) : [],
      })),
      // informações acrescentadas: as que estão no ar e as do rascunho (novas, mudadas ou removidas)
      ...[...new Set([...extrasNoAr.map(e => e.id), ...c.extras.map(e => e.id)])].map(id => {
        const ar = extrasNoAr.find(e => e.id === id)
        const ra = c.extras.find(e => e.id === id)
        const mudou = !ar || !ra || ar.texto !== ra.texto || ar.titulo !== ra.titulo
        return {
          id, grupo: 'extras', titulo: (ra || ar)!.titulo,
          ajuda: !ra ? 'Será removida quando o rascunho for publicado.' : !ar ? 'Informação nova: entra quando o rascunho for publicado.' : 'A assistente usa quando alguém pergunta sobre isto.',
          padrao: '', noAr: ar?.texto || '', rascunho: mudou ? (ra?.texto ?? '') : null,
          problemas: ra && mudou ? validarExtra(ra) : [],
        }
      }),
    ],
    alteracoes: c.mudou,
    conversa,
    pedidosControlGestao: pedidos,
    historico: hist.map(h => ({ versao: h.versao, publicadoEm: h.publicadoEm, nota: h.nota || null, mudancas: h.mudancas || [] })),
    exame,
  }
}
