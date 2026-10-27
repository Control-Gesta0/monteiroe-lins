'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, BookOpenText, Bot, CheckCircle2, FileText, FlaskConical, History, Link2, Loader2, MessageCircleWarning, MessagesSquare, Paperclip, PenLine, Pencil, Search, Send, ShieldCheck, Undo2, Upload, UserRound, X, XCircle } from 'lucide-react'
import FocusNav, { type FocusItem } from '@/components/FocusNav'
import { PageIntro } from '@/components/ProductUI'
import RefreshButton from '@/components/RefreshButton'
import CorrigirPainel from '@/components/CorrigirPainel'
import MudancasBase from '@/components/MudancasBase'
import { brl, dataHora, MOTIVO_ROTULO } from '@/lib/format'
import { esquecer } from '@/lib/hooks'
import type { BaseEstado, BaseItem, ConversaResumo, Exame, MsgConversa, TurnoReal } from '@/lib/types'

type View = 'conversa' | 'reais' | 'sabe'

const VIEWS: FocusItem<View>[] = [
  { id: 'conversa', label: 'Pedir mudança', description: 'Diga à IA o que mudar', icon: MessagesSquare },
  { id: 'reais', label: 'Conversas reais', description: 'Corrija o que ela respondeu', icon: MessageCircleWarning },
  { id: 'sabe', label: 'O que ela sabe', description: 'Os textos que ela usa', icon: BookOpenText },
]
/** links antigos (?ver=textos, conduz, historico) continuam abrindo o lugar certo */
const ALIAS: Record<string, View> = { textos: 'sabe', conduz: 'sabe', historico: 'conversa' }
/** o resultado do último exame some do topo depois de 15 minutos (a versão no ar já diz o que vale) */
const EXAME_RECENTE = 15 * 60_000

/** Nomes dos cenários do exame (evals/cenarios.ts do agente). */
const CENARIO: Record<string, string> = {
  abertura: 'Primeira mensagem do lead',
  'responde-antes-de-pedir': 'Pergunta antes de mandar o contracheque',
  'sem-promessa': 'Pergunta se vai ganhar',
  golpe: 'Desconfia que é golpe',
  'qualificado-oferece-horario': 'Contracheque qualifica: resultado e dois horários',
  'renda-abaixo': 'Renda abaixo do mínimo',
  'pede-sexta': 'Pede um dia fora da agenda',
  'agenda-e-confirma': 'Escolhe o horário e recebe a confirmação',
  'cliente-no-meio': 'Já é cliente e pergunta da liminar',
  'pede-pessoa': 'Pede para falar com uma pessoa',
}
const N_CENARIOS = Object.keys(CENARIO).length

export default function Ensinar() {
  const [view, setViewBruto] = useState<View>('conversa')
  // abas já abertas ficam montadas (escondidas): rascunho do pedido, anexos e conversa aberta não se perdem
  const [abertas, setAbertas] = useState<Set<View>>(new Set(['conversa']))
  const setView = (v: View) => { setViewBruto(v); setAbertas(a => new Set(a).add(v)) }
  const [dados, setDados] = useState<(BaseEstado & { demo?: boolean }) | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [exame, setExame] = useState<Exame | null>(null)
  const [nota, setNota] = useState('')
  const [publicando, setPublicando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [destaque, setDestaque] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seguindo = useRef<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const d = await (await fetch('/api/base', { cache: 'no-store' })).json()
      if (d.error) { setErro(d.error); return }
      setDados(d); setErro(null)
      esquecer('/api/base')
      if (d.exame) setExame(d.exame)
    } catch (e) { setErro(String(e)) }
  }, [])

  useEffect(() => {
    const pedida = new URLSearchParams(window.location.search).get('ver')
    const v = pedida ? (ALIAS[pedida] || pedida) : null
    if (v && VIEWS.some(x => x.id === v)) setView(v as View)
    // /ensinar?ver=sabe#item-<id> (vem de Como usar): abre aquele texto
    const alvo = window.location.hash.match(/^#item-([\w-]+)$/)?.[1]
    if (alvo) { setView('sabe'); setDestaque(alvo) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    carregar()
    window.addEventListener('central:refresh', carregar)
    return () => { window.removeEventListener('central:refresh', carregar); if (timer.current) clearTimeout(timer.current) }
  }, [carregar])

  // Exame rodando: acompanha a cada 2,5 s até terminar
  const acompanhar = useCallback((id: string) => {
    if (seguindo.current === id) return
    seguindo.current = id
    setPublicando(true)
    const passo = async () => {
      try {
        const d = await (await fetch(`/api/base?exame=${id}`, { cache: 'no-store' })).json()
        if (d.exame) setExame(d.exame)
        if (d.exame?.status === 'rodando') { timer.current = setTimeout(passo, 2500); return }
        seguindo.current = null
        setPublicando(false)
        carregar()
      } catch { timer.current = setTimeout(passo, 4000) }
    }
    passo()
  }, [carregar])

  useEffect(() => {
    if (exame?.status === 'rodando') acompanhar(exame.id)
  }, [exame, acompanhar])

  const post: Post = async (corpo) => {
    try {
      const r = await fetch('/api/base', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
      const d = await r.json()
      if (d.itens) { setDados(d); esquecer('/api/base') }
      return { ok: r.ok, d }
    } catch (e) {
      return { ok: false, d: { erro: `Não consegui falar com o agente: ${e instanceof Error ? e.message : String(e)}` } }
    }
  }

  const publicar = async () => {
    setAviso(null)
    setPublicando(true)
    const { ok, d } = await post({ acao: 'publicar', nota })
    if (!ok || !d.exame) {
      setPublicando(false)
      setAviso(d.erro || d.error || 'Não consegui iniciar o exame.')
      return
    }
    setNota('')
    setExame(d.exame)
    acompanhar(d.exame.id)
  }

  const itens = dados?.itens || []
  const grupos = dados ? Object.entries(dados.grupos).filter(([g]) => itens.some(i => i.grupo === g)) : []
  const alteracoes = dados?.alteracoes.length || 0
  const comProblema = itens.filter(i => i.rascunho !== null && i.problemas.length).length

  useEffect(() => {
    if (destaque && dados) document.getElementById(`item-${destaque}`)?.scrollIntoView({ block: 'start' })
  }, [destaque, dados])

  const exameVisivel = !!exame && (exame.status !== 'aprovado' || (!!exame.fim && Date.now() - Date.parse(exame.fim) < EXAME_RECENTE))
  const bloqueado = publicando || !!dados?.demo

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="ENSINAR" title="O que a Lia" accent="sabe." description="Peça em português, com arquivo ou link se quiser. A IA muda o rascunho e o exame automático decide se vale no WhatsApp." action={<RefreshButton />} />

      {dados?.demo && <p className="text-[12px] text-warning">Modo demonstração: os textos são os de verdade, mas pedir mudança e publicar precisam do agente.</p>}
      {erro && <div className="panel p-5 text-[13px] text-warning">Não consegui ler a base: {erro}</div>}

      <section className="panel overflow-hidden">
        <div className="p-5 md:p-6 flex items-start gap-4">
          <div className={`state-orb shrink-0 ${alteracoes ? 'text-warning bg-warning/[0.08]' : 'text-success bg-success/[0.08]'}`}>
            {alteracoes ? <Pencil size={16} /> : <ShieldCheck size={16} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-cyan">{dados ? `Versão ${dados.versao} no ar` : 'Carregando'}{dados?.publicadoEm ? ` · publicada em ${dataHora(dados.publicadoEm)}${dados.nota ? ` · ${dados.nota}` : ''}` : dados ? ' · textos originais' : ''}</div>
            <h2 className="font-impact font-bold text-[18px] md:text-[20px] text-ink mt-2">
              {!dados ? 'Lendo a base…' : alteracoes ? `${alteracoes} ${alteracoes === 1 ? 'mudança da IA espera' : 'mudanças da IA esperam'} o exame para valer.` : 'É isso que a Lia usa agora.'}
            </h2>
            {alteracoes > 0 && <p className="text-[12.5px] text-body-mid leading-relaxed mt-1.5">O exame roda {N_CENARIOS} conversas de teste com o rascunho (cerca de 1 minuto) e só publica se todas passarem.</p>}
          </div>
        </div>

        {alteracoes > 0 && (
          <div className="border-t border-line-soft p-5 md:px-6 flex flex-wrap items-center gap-3">
            <input value={nota} onChange={e => setNota(e.target.value)} maxLength={200} placeholder="O que mudou? (opcional, aparece nas versões)" className="campo rounded-[8px] px-3.5 py-2.5 text-[12.5px] flex-1 min-w-[220px]" />
            <Link href="/teste?versao=rascunho" className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-[8px] border border-line-soft text-[12px] text-body-mid hover:text-ink hover-raise">
              <FlaskConical size={13} /> Testar o rascunho
            </Link>
            <button type="button" onClick={publicar} disabled={publicando || comProblema > 0 || !!dados?.demo}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[8px] border border-cyan/30 bg-cyan/[0.12] text-cyan text-[12.5px] font-medium disabled:opacity-40">
              {publicando ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Publicar com exame
            </button>
            <button type="button" onClick={() => post({ acao: 'descartar' })} disabled={bloqueado} className="text-[11.5px] text-body-faint hover:text-ink disabled:opacity-40">descartar tudo</button>
            {comProblema > 0 && <p className="basis-full text-[11.5px] text-warning">Corrija {comProblema === 1 ? 'o texto marcado' : `os ${comProblema} textos marcados`} antes de publicar.</p>}
          </div>
        )}
        {aviso && <div className="border-t border-line-soft px-5 md:px-6 py-3 text-[12px] text-warning">{aviso}</div>}
        {exameVisivel && <ResultadoExame exame={exame!} />}
        {dados && dados.historico.length > 0 && (
          <details className="group border-t border-line-soft">
            <summary className="list-none cursor-pointer px-5 md:px-6 py-3 flex items-center gap-2 text-[12px] text-body-mid hover:text-ink hover-raise">
              <History size={13} className="shrink-0" /> Versões anteriores ({dados.historico.length})
              <span className="ml-auto text-[11px] text-body-faint group-open:rotate-90 transition-transform">▷</span>
            </summary>
            <div className="border-t border-line-soft">
              {dados.historico.map((h, i) => (
                <div key={`${h.versao}-${h.publicadoEm}`} className={`px-5 md:px-6 py-3 flex items-center gap-3 ${i ? 'border-t border-line-soft' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] text-ink">Versão {h.versao}</div>
                    <div className="text-[11px] text-body-muted mt-0.5">{h.publicadoEm ? `${dataHora(h.publicadoEm)} · ${h.nota || 'sem nota'}` : 'textos originais da implantação'}</div>
                  </div>
                  <button type="button" disabled={bloqueado}
                    onClick={() => { if (confirm(`Voltar para a versão ${h.versao}? Ela passa a valer no WhatsApp agora (já passou no exame quando foi publicada).`)) void post({ acao: 'voltar', versao: h.versao }) }}
                    className="inline-flex items-center gap-1.5 text-[11.5px] text-cyan disabled:opacity-40 shrink-0"><Undo2 size={12} /> Voltar para esta</button>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      <FocusNav items={VIEWS} value={view} onChange={setView} label="Áreas de Ensinar" />

      <div className={view === 'conversa' ? '' : 'hidden'}><Conversa dados={dados} post={post} bloqueado={bloqueado} /></div>

      {abertas.has('reais') && <div className={view === 'reais' ? '' : 'hidden'}><ConversasReais onMudou={carregar} bloqueado={bloqueado} /></div>}

      {abertas.has('sabe') && (
        <div className={`space-y-8 ${view === 'sabe' ? '' : 'hidden'}`}>
          <p className="text-[12.5px] text-body-muted">Só leitura: para mudar, peça em Pedir mudança. Clique num texto para abrir. O roteiro e as travas estão em <Link href="/como-usar?ver=fluxo" className="text-cyan">Como usar › Fluxo do cliente</Link>.</p>
          {grupos.map(([g, titulo]) => (
            <section key={g} className="space-y-3">
              <h2 className="font-impact font-bold text-[18px] md:text-[20px] text-ink">{titulo}</h2>
              <div className="space-y-2">
                {itens.filter(i => i.grupo === g).map(i => <Item key={i.id} item={i} post={post} bloqueado={bloqueado} destacado={destaque === i.id} />)}
              </div>
            </section>
          ))}
          {!dados && !erro && <div className="panel h-60 animate-pulse surface-alt" />}
        </div>
      )}
    </div>
  )
}

type Post = (c: Record<string, unknown>) => Promise<{ ok: boolean; d: { erro?: string; error?: string; resposta?: MsgConversa; exame?: Exame } }>

/** Texto da base, só leitura: quem muda é a IA, a pedido da equipe. */
function Item({ item, post, bloqueado, destacado }: { item: BaseItem; post: Post; bloqueado: boolean; destacado?: boolean }) {
  const noRascunho = item.rascunho !== null
  const removido = noRascunho && item.rascunho === '' && item.grupo === 'extras'
  const atual = noRascunho ? item.rascunho! : item.noAr
  const editadoNoAr = item.grupo !== 'extras' && item.noAr !== item.padrao
  return (
    <details id={`item-${item.id}`} open={noRascunho || destacado} className={`panel overflow-hidden group scroll-mt-6 ${noRascunho ? 'border-warning/30' : destacado ? 'border-cyan/40' : ''}`}>
      <summary className="list-none cursor-pointer px-5 py-3.5 flex items-center gap-3 hover-raise">
        <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
          <h3 className="text-[13.5px] font-medium text-ink">{item.titulo}</h3>
          {noRascunho && <span className="font-mono text-[8.5px] tracking-[0.1em] px-1.5 py-0.5 rounded border border-warning/40 text-warning">{removido ? 'SAI NO RASCUNHO' : item.noAr ? 'RASCUNHO' : 'NOVA NO RASCUNHO'}</span>}
          {!noRascunho && editadoNoAr && <span className="font-mono text-[8.5px] tracking-[0.1em] px-1.5 py-0.5 rounded border border-cyan/40 text-cyan">ALTERADO</span>}
        </div>
        <span className="text-[11px] text-body-faint group-open:rotate-90 transition-transform shrink-0">▷</span>
      </summary>
      <div className="px-5 pb-5">
        <div className="flex items-start gap-3 mb-3">
          <p className="text-[11.5px] text-body-muted leading-relaxed flex-1">{item.ajuda}</p>
          {noRascunho && (
            <button type="button" disabled={bloqueado} onClick={() => post({ acao: 'descartar', id: item.id })} className="inline-flex items-center gap-1 text-[11.5px] text-body-faint hover:text-ink disabled:opacity-40 shrink-0"><XCircle size={12} /> descartar do rascunho</button>
          )}
        </div>
        {removido
          ? <div className="surface-alt rounded-[8px] px-4 py-3 text-[12.5px] leading-relaxed text-body-mid whitespace-pre-wrap break-words line-through">{item.noAr}</div>
          : <div className="surface-alt rounded-[8px] px-4 py-3 text-[12.5px] leading-relaxed text-ink whitespace-pre-wrap break-words">{atual}</div>}
        {noRascunho && item.problemas.length > 0 && (
          <ul className="mt-3 space-y-1">
            {item.problemas.map(p => <li key={p} className="text-[11.5px] text-warning flex gap-2"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{p}</li>)}
          </ul>
        )}
        {noRascunho && item.noAr && !removido && (
          <details className="mt-3 group">
            <summary className="list-none cursor-pointer text-[11px] text-body-faint hover:text-body-mid">ver o texto que está no ar ▷</summary>
            <div className="mt-2 rounded-[8px] border border-line-soft px-4 py-3 text-[12px] leading-relaxed text-body-mid whitespace-pre-wrap break-words">{item.noAr}</div>
          </details>
        )}
      </div>
    </details>
  )
}

const EXEMPLOS = [
  'Acrescenta que o escritório também atende empresas com dívida bancária',
  'Acrescenta que tem estacionamento rotativo na Rua da Quitanda',
  'A mensagem de renda abaixo do mínimo está fria, deixa mais acolhedora',
  'O prazo médio até a decisão do juiz é de 6 a 7 meses',
]

const DESTINO: Record<string, { rotulo: string; cor: string }> = {
  base: { rotulo: 'TEXTO ALTERADO NO RASCUNHO', cor: '#06b6d4' },
  nova_informacao: { rotulo: 'INFORMAÇÃO NO RASCUNHO', cor: '#06b6d4' },
  control_gestao: { rotulo: 'PEDIDO PARA A CONTROL GESTÃO', cor: '#a78bfa' },
  recusado: { rotulo: 'NÃO ENTRA NA BASE', cor: '#f59e0b' },
  pergunta: { rotulo: 'PRECISA DE MAIS DETALHE', cor: '#737373' },
  nenhum: { rotulo: 'NADA MUDOU', cor: '#737373' },
}

/** Material para a IA ler (o agente transforma em texto; o arquivo não fica guardado). */
type Arquivo = { nome: string; tipo: string; tamanho: number; base64: string }
const ACEITOS = ['pdf', 'docx', 'txt', 'md', 'csv', 'json', 'png', 'jpg', 'jpeg', 'webp']
const MAX_BYTES = 3 * 1024 * 1024
const tem_link = (t: string) => /https?:\/\/\S+/.test(t)
const tamanhoLegivel = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`)

function lerBase64(f: File): Promise<string> {
  return new Promise((ok, falha) => {
    const fr = new FileReader()
    fr.onload = () => ok(String(fr.result).replace(/^data:[^,]*,/, ''))
    fr.onerror = () => falha(fr.error)
    fr.readAsDataURL(f)
  })
}

/** Pedir mudança: a conversa da equipe com a IA que cuida da base (com o histórico). */
function Conversa({ dados, post, bloqueado }: { dados: (BaseEstado & { demo?: boolean }) | null; post: Post; bloqueado: boolean }) {
  const [texto, setTexto] = useState('')
  const [arquivos, setArquivos] = useState<Arquivo[]>([])
  const [arrastando, setArrastando] = useState(false)
  const seletor = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [desfazendo, setDesfazendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const lista = useRef<HTMLDivElement>(null)
  const msgs = dados?.conversa || []

  // rola só a caixa da conversa (a página fica onde está)
  useEffect(() => { const l = lista.current; if (l) l.scrollTop = l.scrollHeight }, [msgs.length, enviando])

  const adicionar = async (lista: FileList | null) => {
    if (!lista?.length) return
    setErro(null)
    const novos: Arquivo[] = []
    for (const f of Array.from(lista)) {
      const ext = (f.name.split('.').pop() || '').toLowerCase()
      if (!ACEITOS.includes(ext)) { setErro(`"${f.name}": formato não aceito. Use PDF, Word (.docx), texto, CSV ou imagem${ext === 'xlsx' || ext === 'xls' ? ' (planilha: salve como CSV)' : ''}.`); continue }
      if (arquivos.length + novos.length >= 3) { setErro('No máximo 3 arquivos por pedido.'); break }
      const total = [...arquivos, ...novos].reduce((n, a) => n + a.tamanho, 0) + f.size
      if (total > MAX_BYTES) { setErro(`"${f.name}" passa do limite de 3 MB por pedido (somando os arquivos).`); continue }
      try { novos.push({ nome: f.name, tipo: f.type, tamanho: f.size, base64: await lerBase64(f) }) }
      catch { setErro(`Não consegui abrir "${f.name}".`) }
    }
    if (novos.length) setArquivos(a => [...a, ...novos])
    if (seletor.current) seletor.current.value = ''
  }

  const enviar = async (t = texto) => {
    const pedido = t.trim()
    const anexos = t === texto ? arquivos : []
    if ((!pedido && !anexos.length) || enviando) return
    setEnviando(true); setErro(null); setTexto(''); if (anexos.length) setArquivos([])
    setLendo(anexos.length > 0 || tem_link(pedido))
    const { ok, d } = await post({ acao: 'pedir', texto: pedido, ...(anexos.length ? { anexos: anexos.map(({ nome, tipo, base64 }) => ({ nome, tipo, base64 })) } : {}) })
    setEnviando(false)
    if (!ok) { setErro(d.erro || d.error || 'A IA não respondeu. Tente de novo.'); setTexto(pedido); setArquivos(anexos) }
  }
  const desfazer = async (id: string) => {
    setDesfazendo(true); setErro(null)
    const { ok, d } = await post({ acao: 'desfazer', mensagem: id })
    setDesfazendo(false)
    if (!ok) setErro(d.erro || d.error || 'Não deu para desfazer.')
  }

  return (
    <section className="space-y-4">
      <div className="panel overflow-hidden flex flex-col">
        <div ref={lista} className="p-4 md:p-5 space-y-4 max-h-[64vh] overflow-y-auto scroll-thin">
          {!msgs.length && (
            <div className="py-6 text-center">
              <MessagesSquare size={20} className="text-cyan mx-auto" />
              <p className="text-[13px] text-body-mid mt-3 max-w-[560px] mx-auto">Escreva como falaria com alguém da equipe. A IA decide onde a mudança entra e mostra o antes e o depois. As correções feitas no Teste e nas conversas reais também aparecem aqui. Exemplos:</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {EXEMPLOS.map(e => <button key={e} type="button" disabled={bloqueado || enviando} onClick={() => enviar(e)} className="px-3 py-2 rounded-full border border-line-soft text-[11.5px] text-body-mid hover:text-ink hover:border-cyan/25 disabled:opacity-40">{e}</button>)}
              </div>
            </div>
          )}
          {msgs.map(m => m.papel === 'equipe' ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[88%] md:max-w-[75%] flex flex-col items-end">
                {m.correcao ? (
                  <div className="rounded-[12px] rounded-br-[4px] px-3.5 py-3 bg-cyan/[0.10] border border-cyan/25 text-[12.5px] text-ink space-y-2 w-full">
                    <div className="font-mono text-[8.5px] tracking-[0.1em] text-cyan">{m.origem === 'real' ? `CORREÇÃO DE CONVERSA REAL${m.correcao.nome ? ` · ${m.correcao.nome.toUpperCase()}` : ''}` : 'CORREÇÃO FEITA NO TESTE'}</div>
                    <div><span className="text-body-muted text-[11px]">Resposta marcada como errada:</span><p className="whitespace-pre-wrap break-words text-body-mid mt-0.5">{m.correcao.resposta}</p></div>
                    {m.correcao.comoDeveria && <div><span className="text-body-muted text-[11px]">Como deveria ser:</span><p className="whitespace-pre-wrap break-words mt-0.5">{m.correcao.comoDeveria}</p></div>}
                    {m.correcao.porque && <div><span className="text-body-muted text-[11px]">Por que está errado:</span><p className="whitespace-pre-wrap break-words mt-0.5">{m.correcao.porque}</p></div>}
                  </div>
                ) : m.texto ? (
                  <div className="rounded-[12px] rounded-br-[4px] px-3.5 py-2.5 bg-cyan/[0.12] border border-cyan/25 text-[13px] text-ink whitespace-pre-wrap break-words">{m.texto}</div>
                ) : null}
                {m.anexos && m.anexos.length > 0 && (
                  <div className="flex flex-wrap justify-end gap-1.5 mt-1.5">
                    {m.anexos.map((a, i) => <ChipMaterial key={i} a={a} />)}
                  </div>
                )}
                <span className="font-mono text-[9px] text-body-faint mt-1 inline-flex items-center gap-1"><UserRound size={9} /> equipe · {dataHora(m.ts)}</span>
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[94%] md:max-w-[82%] flex flex-col items-start gap-2 w-full">
                <div className="rounded-[12px] rounded-bl-[4px] px-3.5 py-2.5 surface-alt border border-line-soft text-[13px] text-ink whitespace-pre-wrap break-words">
                  {m.destino && <div className="font-mono text-[8.5px] tracking-[0.1em] mb-1.5" style={{ color: DESTINO[m.destino]?.cor }}>{DESTINO[m.destino]?.rotulo}</div>}
                  {m.texto}
                </div>
                {m.analise && (m.analise.comoDeveria || m.analise.porque) && (
                  <div className="w-full grid md:grid-cols-2 gap-2">
                    {m.analise.comoDeveria && <div className="rounded-[8px] border border-success/30 bg-success/[0.05] px-3 py-2.5"><div className="font-mono text-[8.5px] tracking-[0.1em] text-success">COMO DEVERIA SER</div><p className="text-[12px] text-ink whitespace-pre-wrap break-words mt-1">{m.analise.comoDeveria}</p></div>}
                    {m.analise.porque && <div className="rounded-[8px] border border-warning/30 bg-warning/[0.05] px-3 py-2.5"><div className="font-mono text-[8.5px] tracking-[0.1em] text-warning">POR QUE ESTAVA ERRADO</div><p className="text-[12px] text-ink whitespace-pre-wrap break-words mt-1">{m.analise.porque}</p></div>}
                  </div>
                )}
                {m.mudancas && m.mudancas.length > 0 && <MudancasBase mudancas={m.mudancas} desfeita={m.desfeita} onDesfazer={bloqueado ? undefined : () => desfazer(m.id)} ocupado={desfazendo} />}
                <span className="font-mono text-[9px] text-body-faint inline-flex items-center gap-1"><Bot size={9} /> IA da base · {dataHora(m.ts)}{typeof m.custoUsd === 'number' ? ` · ${brl(m.custoUsd * 5.4, 3)}` : ''}</span>
              </div>
            </div>
          ))}
          {enviando && <div className="text-[11.5px] text-body-muted animate-pulse">{lendo ? 'A IA está lendo o material e a base… (arquivo grande ou PDF pode levar até 1 minuto)' : 'A IA está lendo o pedido e a base… (uns 10 segundos)'}</div>}
        </div>
        <div className={`border-t border-line-soft p-3 md:p-4 transition-colors ${arrastando ? 'bg-cyan/[0.06]' : ''}`}
          onDragOver={e => { if (bloqueado) return; e.preventDefault(); setArrastando(true) }}
          onDragLeave={() => setArrastando(false)}
          onDrop={e => { e.preventDefault(); setArrastando(false); if (!bloqueado) adicionar(e.dataTransfer.files) }}>
          {erro && <p className="text-[12px] text-warning mb-2">{erro}</p>}
          {arquivos.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {arquivos.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 max-w-full pl-2.5 pr-1 py-1 rounded-full border border-cyan/25 bg-cyan/[0.08] text-[11.5px] text-ink">
                  <FileText size={12} className="text-cyan shrink-0" />
                  <span className="truncate max-w-[180px]">{a.nome}</span>
                  <span className="font-mono text-[9.5px] text-body-muted shrink-0">{tamanhoLegivel(a.tamanho)}</span>
                  <button type="button" onClick={() => setArquivos(l => l.filter((_, j) => j !== i))} disabled={enviando} className="p-1 rounded-full text-body-muted hover:text-ink" aria-label={`Tirar ${a.nome}`}><X size={11} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input ref={seletor} type="file" multiple hidden accept={ACEITOS.map(e => `.${e}`).join(',')} onChange={e => adicionar(e.target.files)} />
            <button type="button" onClick={() => seletor.current?.click()} disabled={bloqueado || enviando || arquivos.length >= 3} aria-label="Anexar arquivo" title="Anexar arquivo (PDF, Word, texto, CSV ou imagem)"
              className="px-3 rounded-[10px] border border-line-soft text-body-mid hover:text-ink hover:border-cyan/25 disabled:opacity-30"><Paperclip size={16} /></button>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} disabled={bloqueado} placeholder={arquivos.length ? 'O que a IA deve fazer com o material? (opcional)' : 'Ex.: acrescenta que tem estacionamento perto do escritório · a mensagem de renda abaixo está fria'}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
              className="campo flex-1 min-w-0 rounded-[10px] px-3.5 py-2.5 text-[13px] resize-none" />
            <button type="button" onClick={() => enviar()} disabled={(!texto.trim() && !arquivos.length) || enviando || bloqueado} aria-label="Enviar pedido"
              className="px-4 rounded-[10px] border border-cyan/30 bg-cyan/[0.12] text-cyan disabled:opacity-30">{enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}</button>
          </div>
          <p className="text-[10.5px] text-body-faint mt-2 leading-relaxed">Pode anexar PDF, Word, texto, CSV ou imagem (até 3 arquivos, 3 MB, ou arraste para cá) ou colar um link de site, Google Docs ou Planilhas. Honorários e promessa de resultado não entram; regra da planilha, agenda e roteiro viram pedido para a Control Gestão{dados?.pedidosControlGestao ? ` (${dados.pedidosControlGestao} registrado${dados.pedidosControlGestao === 1 ? '' : 's'})` : ''}.</p>
        </div>
      </div>
    </section>
  )
}

/** Arquivo ou link de um pedido, como a IA leu (ou por que não leu). */
function ChipMaterial({ a }: { a: NonNullable<MsgConversa['anexos']>[number] }) {
  const Icone = a.origem === 'link' ? Link2 : FileText
  const corpo = (
    <>
      <Icone size={11} className={a.erro ? 'text-warning shrink-0' : 'text-cyan shrink-0'} />
      <span className="truncate max-w-[200px]">{a.nome}</span>
      <span className={`font-mono text-[9.5px] shrink-0 ${a.erro ? 'text-warning' : 'text-body-muted'}`}>{a.erro ? 'não lido' : `${a.caracteres.toLocaleString('pt-BR')} caracteres lidos`}</span>
    </>
  )
  const cls = `inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-full border text-[11px] text-body-mid ${a.erro ? 'border-warning/30 bg-warning/[0.05]' : 'border-line-soft surface-alt'}`
  return a.url
    ? <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.erro || a.url} className={`${cls} hover:text-ink`}>{corpo}</a>
    : <span title={a.erro || a.tipo} className={cls}>{corpo}</span>
}

/** Conversas reais do WhatsApp (do diário, com PII mascarada): abrir, ver cada resposta e corrigir. */
function ConversasReais({ onMudou, bloqueado }: { onMudou: () => void; bloqueado: boolean }) {
  const [lista, setLista] = useState<(ConversaResumo[]) | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<ConversaResumo | null>(null)
  const [turnos, setTurnos] = useState<TurnoReal[] | null>(null)
  const [corrigindo, setCorrigindo] = useState<TurnoReal | null>(null)
  const [correcoes, setCorrecoes] = useState<Record<string, MsgConversa>>({})
  const conversa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/base?conversas=1', { cache: 'no-store' }).then(r => r.json())
      .then(d => { if (d.error) setErro(d.error); else setLista(d.conversas || []) })
      .catch(e => setErro(String(e)))
  }, [])

  const abrir = async (c: ConversaResumo) => {
    setSel(c); setTurnos(null)
    try {
      const d = await (await fetch(`/api/base?conversa=${encodeURIComponent(c.contato)}`, { cache: 'no-store' })).json()
      setTurnos(d.turnos || [])
    } catch (e) { setErro(String(e)) }
    setTimeout(() => conversa.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const filtradas = (lista || []).filter(c => !busca.trim() || `${c.nome} ${c.previa}`.toLowerCase().includes(busca.trim().toLowerCase()))
  const chave = (t: TurnoReal) => `${sel?.contato}|${t.ts}`

  return (
    <section className="space-y-4">
      <p className="text-[12.5px] text-body-muted">Abra uma conversa do WhatsApp e clique em Corrigir na resposta que saiu errada. CPF, CNPJ, telefone e e-mail aparecem mascarados.</p>
      {erro && <div className="panel p-5 text-[12.5px] text-warning">Não consegui ler as conversas: {erro}</div>}
      <div className="grid lg:grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
        <div className="panel overflow-hidden">
          <div className="p-3 border-b border-line-soft relative">
            <Search size={13} className="absolute left-6 top-1/2 -translate-y-1/2 text-body-faint" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou texto" className="campo w-full rounded-[8px] pl-9 pr-3 py-2 text-[12.5px]" />
          </div>
          <div className="max-h-[62vh] overflow-y-auto scroll-thin">
            {filtradas.map(c => (
              <button key={c.contato} type="button" onClick={() => abrir(c)}
                className={`w-full text-left px-4 py-3 border-b border-line-soft hover-raise ${sel?.contato === c.contato ? 'bg-cyan/[0.08]' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-ink truncate flex-1">{c.nome}</span>
                  <span className="font-mono text-[9px] text-body-faint shrink-0">{dataHora(c.ultima)}</span>
                </div>
                <p className="text-[11.5px] text-body-mid truncate mt-1">{c.previa}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  {c.perfil && <span className="font-mono text-[8.5px] text-body-faint">{c.perfil === 'cliente' ? 'CLIENTE DO ESCRITÓRIO' : 'LEAD NOVO'}</span>}
                  {c.passou && <span className="font-mono text-[8.5px] text-purple-400">ENCERROU · {(MOTIVO_ROTULO[c.passou] || c.passou).toUpperCase()}</span>}
                  <span className="font-mono text-[8.5px] text-body-faint ml-auto">{c.respostas} resp.</span>
                </div>
              </button>
            ))}
            {lista && !filtradas.length && (
              <p className="p-6 text-center text-[12px] text-body-muted">{lista.length ? 'Nada com essa busca.' : 'Ainda não há conversa real com texto guardado. Quando a Lia atender pelo WhatsApp, as conversas aparecem aqui.'}</p>
            )}
            {!lista && !erro && <div className="h-40 animate-pulse surface-alt" />}
          </div>
        </div>

        <div ref={conversa} className="panel overflow-hidden scroll-mt-6">
          {!sel ? (
            <div className="p-8 text-center text-[12.5px] text-body-muted">Escolha uma conversa ao lado para ver as respostas e corrigir.</div>
          ) : (
            <>
              <div className="px-5 py-3.5 border-b border-line-soft flex items-center gap-3 flex-wrap">
                <UserRound size={15} className="text-cyan" />
                <span className="text-[13.5px] font-medium text-ink">{sel.nome}</span>
                {sel.passou && <span className="font-mono text-[8.5px] text-purple-400">A LIA ENCERROU · {(MOTIVO_ROTULO[sel.passou] || sel.passou).toUpperCase()}</span>}
              </div>
              <div className="p-4 md:p-5 space-y-3 max-h-[62vh] overflow-y-auto scroll-thin">
                {(turnos || []).map(t => (
                  <div key={t.ts} className="space-y-2">
                    {t.cliente && (
                      <div className="flex justify-end">
                        <div className="max-w-[85%] rounded-[12px] rounded-br-[4px] px-3.5 py-2.5 bg-cyan/[0.12] border border-cyan/25 text-[13px] text-ink whitespace-pre-wrap break-words">{t.cliente}</div>
                      </div>
                    )}
                    <div className="flex justify-start">
                      <div className="max-w-[88%] flex flex-col items-start">
                        <div className="rounded-[12px] rounded-bl-[4px] px-3.5 py-2.5 surface-alt border border-line-soft text-[13px] text-ink whitespace-pre-wrap break-words">{t.resposta}</div>
                        <div className="flex items-center gap-3 flex-wrap mt-1">
                          <span className="font-mono text-[9px] text-body-faint">
                            {dataHora(t.ts)}{t.tipo === 'finalizou' ? ` · encerrou: ${MOTIVO_ROTULO[t.motivo || ''] || t.motivo || 'outro'}` : ''}{t.travas.length ? ` · ${t.travas.length} trava(s)` : ''}
                          </span>
                          {!bloqueado && (
                            <button type="button" onClick={() => setCorrigindo(t)} className={`inline-flex items-center gap-1 text-[10.5px] font-medium ${correcoes[chave(t)] ? 'text-success' : 'text-cyan'} hover:underline`}>
                              <PenLine size={11} /> {correcoes[chave(t)] ? 'corrigida · ver' : 'Corrigir'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {!turnos && <div className="h-40 animate-pulse surface-alt rounded-lg" />}
              </div>
            </>
          )}
        </div>
      </div>

      {corrigindo && sel && (
        <CorrigirPainel origem="real" nome={sel.nome} resposta={corrigindo.resposta}
          cliente={(turnos || []).slice(0, (turnos || []).indexOf(corrigindo) + 1).reverse().find(x => x.cliente)?.cliente || ''}
          onMudou={onMudou}
          pedido={{ acao: 'corrigir_real', contato: sel.contato, ts: corrigindo.ts }} resultado={correcoes[chave(corrigindo)]}
          onResultado={r => { setCorrecoes(c => ({ ...c, [chave(corrigindo)]: r })); onMudou() }}
          onFechar={() => setCorrigindo(null)} />
      )}
    </section>
  )
}

function ResultadoExame({ exame: e }: { exame: Exame }) {
  if (e.status === 'rodando') {
    const pct = e.total ? Math.round((e.feitos / e.total) * 100) : 0
    return (
      <div className="border-t border-line-soft px-5 md:px-6 py-4">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-ink inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin text-cyan" /> Exame rodando com os textos novos…</span>
          <span className="font-mono text-body-muted">{e.feitos}/{e.total}</span>
        </div>
        <div className="h-1.5 surface-alt rounded-full overflow-hidden mt-2.5"><div className="h-full rounded-full bg-cyan transition-all" style={{ width: `${Math.max(4, pct)}%` }} /></div>
      </div>
    )
  }
  if (e.status === 'aprovado') {
    return (
      <div className="border-t border-line-soft px-5 md:px-6 py-4 flex items-start gap-3">
        <CheckCircle2 size={16} className="text-success shrink-0 mt-0.5" />
        <p className="text-[12.5px] text-body-mid leading-relaxed"><strong className="text-ink">Publicado: versão {e.versao}.</strong> Passou nos {N_CENARIOS} cenários{e.instaveis?.length ? ` (${e.instaveis.length} precisou de nova tentativa e passou nas duas)` : ''}{e.fim ? `, em ${dataHora(e.fim)}` : ''}. A assistente já usa os textos novos no WhatsApp.</p>
      </div>
    )
  }
  return (
    <div className="border-t border-line-soft px-5 md:px-6 py-4">
      <div className="flex items-start gap-3">
        <XCircle size={16} className="text-danger shrink-0 mt-0.5" />
        <p className="text-[12.5px] text-body-mid leading-relaxed">
          <strong className="text-ink">{e.status === 'erro' ? 'O exame não terminou.' : `Não publicado: ${new Set((e.falhas || []).map(f => f.cenario)).size} de ${N_CENARIOS} cenários falharam.`}</strong>{' '}
          {e.status === 'erro' ? e.erro : 'Nada mudou no WhatsApp. Veja abaixo o que falhou, ajuste o texto e publique de novo.'}
        </p>
      </div>
      {(e.falhas || []).map((f, i) => (
        <details key={`${f.cenario}-${i}`} className="mt-3 rounded-[8px] border border-line-soft group">
          <summary className="list-none cursor-pointer px-4 py-3 text-[12.5px] text-ink flex items-center gap-2">
            <AlertTriangle size={13} className="text-warning shrink-0" /> {CENARIO[f.cenario] || f.cenario}
            <span className="ml-auto text-[10.5px] text-body-faint group-open:hidden">ver conversa</span>
          </summary>
          <div className="px-4 pb-4 space-y-3">
            <ul className="space-y-1">{f.motivos.map(m => <li key={m} className="text-[11.5px] text-warning">· {m}</li>)}</ul>
            <div className="space-y-2">
              {f.conversa.map((t, i) => (
                <div key={i} className="text-[11.5px] leading-relaxed">
                  <div className="text-body-muted"><strong className="text-body-mid">Cliente:</strong> {t.lead}</div>
                  <div className="text-body-mid whitespace-pre-wrap break-words mt-0.5"><strong className="text-ink">Lia:</strong> {t.resposta}</div>
                </div>
              ))}
            </div>
          </div>
        </details>
      ))}
    </div>
  )
}
