'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, CalendarCheck, ChevronDown, FileText, FlaskConical, PenLine, RotateCcw, Route, Send, Tags } from 'lucide-react'
import CorrigirPainel from '@/components/CorrigirPainel'
import { PageIntro, SectionTitle } from '@/components/ProductUI'
import { brl, DECISAO_ROTULO, MOTIVO_ROTULO } from '@/lib/format'
import type { MsgConversa, TesteOpcoes, TesteSessao, TesteUso } from '@/lib/types'

const CC_QUALIFICA = ['[imagem do lead]: CONTRACHEQUE | PMERJ | 09/2026 | sim', 'RUBRICA | 001 | SOLDO | P | 6.200,00', 'RUBRICA | 010 | GRAT HABILITACAO | P | 5.400,00', 'RUBRICA | 300 | IMP RENDA RETIDO | D | 1.850,33', 'RUBRICA | 310 | CONTRIB MILIT RIOPREV | D | 1.276,00', 'RUBRICA | 320 | FUNDO SAUDE PM | D | 210,50', 'RUBRICA | 501 | EMPREST BRADESCO | D | 2.500,00', 'RUBRICA | 502 | CONSIG ITAU | D | 2.010,90', 'RUBRICA | 503 | CARTAO RMC BMG | D | 412,20'].join('\n')
const CC_RENDA_BAIXA = ['[imagem do lead]: CONTRACHEQUE | PMERJ | 09/2026 | sim', 'RUBRICA | 001 | SOLDO | P | 5.200,00', 'RUBRICA | 010 | ADIC TEMPO SERV | P | 1.800,00', 'RUBRICA | 300 | IMP RENDA | D | 600,00', 'RUBRICA | 501 | EMP CONSIG SANTANDER | D | 2.600,00'].join('\n')

/** O laboratório não recebe foto: os contracheques de exemplo já vêm como o sistema lê a imagem. */
const SUGESTOES: Array<{ rotulo: string; texto: string }> = [
  { rotulo: 'Oi, vi o anúncio do consignado', texto: 'Oi, vi o anúncio do consignado' },
  { rotulo: 'Isso é de graça? Quanto custa?', texto: 'Isso é de graça? Quanto custa?' },
  { rotulo: 'Isso não é golpe?', texto: 'Como vou saber que isso não é golpe?' },
  { rotulo: 'Vou ganhar?', texto: 'Mas eu vou ganhar a ação?' },
  { rotulo: 'Contracheque de exemplo (qualifica)', texto: CC_QUALIFICA },
  { rotulo: 'Contracheque de exemplo (renda abaixo)', texto: CC_RENDA_BAIXA },
  { rotulo: 'Já sou cliente, e a minha liminar?', texto: 'Já tenho processo com vocês, como está a minha liminar?' },
  { rotulo: 'Prefiro falar com uma pessoa', texto: 'Prefiro falar com uma pessoa' },
]

const TOOL: Record<string, string> = {
  analisar_contracheque: 'analisou o contracheque',
  consultar_horarios: 'consultou a agenda',
  agendar_reuniao: 'marcou a reunião',
  finalizar_atendimento: 'passou para a equipe',
  registrar_respondente: 'anotou quem escreve',
  'trava:texto-aprovado': 'mensagem aprovada pelo sistema',
  'trava:atendimento-24h': 'mensagem fixa de 24 horas',
}

const ETAPA: Record<number, string> = {
  85921939: 'Leads de entrada', 85921943: 'Qualificação', 112779736: 'follow - não responde', 85921947: 'Retorno Imediato/Fazer analise',
  112457304: 'lead qualificado', 85921951: 'Reunião Agendada', 86791959: 'Repescar', 143: 'Venda perdida',
}
const TAREFA: Record<number, string> = { 4231636: 'Agendamento IA', 1: 'Follow-up (24h)' }

const PADRAO: TesteOpcoes = { perfil: 'novo', versao: 'vigente' }

function novoId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export default function Teste() {
  const [id, setId] = useState<string | null>(null)
  const [sessao, setSessao] = useState<TesteSessao | null>(null)
  const [uso, setUso] = useState<TesteUso | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [demo, setDemo] = useState(false)
  const lista = useRef<HTMLDivElement>(null)
  const [corrigindo, setCorrigindo] = useState<string | null>(null)
  const [correcoes, setCorrecoes] = useState<Record<string, MsgConversa>>({})
  const opcoes = sessao?.opcoes || PADRAO

  const aplicar = (d: { sessao?: TesteSessao | null; uso?: TesteUso; error?: string; erro?: string; demo?: boolean }) => {
    if (d.sessao !== undefined) setSessao(d.sessao)
    if (d.uso) setUso(d.uso)
    if (d.demo) setDemo(true)
    setErro(d.erro || d.error || null)
  }

  const recomecar = useCallback(async (sid: string, o: Partial<TesteOpcoes>) => {
    setErro(null)
    const r = await fetch('/api/teste', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessao: sid, acao: 'recomecar', opcoes: o }) })
    aplicar(await r.json())
  }, [])

  // Sessão do laboratório: um id por navegador (fica 6 h no agente)
  useEffect(() => {
    let sid = ''
    try { sid = localStorage.getItem('teste-sessao') || '' } catch { /* modo privado */ }
    if (!/^[\w-]{8,64}$/.test(sid)) { sid = novoId(); try { localStorage.setItem('teste-sessao', sid) } catch { /* idem */ } }
    setId(sid)
    const pedida = new URLSearchParams(window.location.search).get('versao')
    if (pedida === 'rascunho') { recomecar(sid, { versao: 'rascunho' }); window.history.replaceState(null, '', '/teste'); return }
    fetch(`/api/teste?sessao=${sid}`).then(r => r.json()).then(aplicar).catch(e => setErro(String(e)))
  }, [recomecar])

  // rola só a caixa da conversa (a página fica onde está)
  useEffect(() => { const l = lista.current; if (l) l.scrollTop = l.scrollHeight }, [sessao?.history.length, enviando])

  const enviar = async (msg = texto) => {
    const t = msg.trim()
    if (!t || !id || enviando) return
    setEnviando(true)
    setErro(null)
    setTexto('')
    // mostra a mensagem na hora; a resposta substitui a sessão inteira
    setSessao(s => s ? { ...s, history: [...s.history, { id: `tmp${Date.now()}`, dir: 'in', text: t, ts: Date.now() }] } : s)
    try {
      const r = await fetch('/api/teste', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessao: id, texto: t }) })
      const d = await r.json()
      if (!r.ok && !d.sessao) {
        // não entrou: devolve o texto para o campo
        setSessao(s => s ? { ...s, history: s.history.filter(m => !m.id.startsWith('tmp')) } : s)
        setTexto(t)
      }
      aplicar(d)
    } catch (e) {
      setErro(`Não consegui falar com o agente: ${e instanceof Error ? e.message : String(e)}`)
      setTexto(t)
    } finally {
      setEnviando(false)
    }
  }

  const trocar = (o: Partial<TesteOpcoes>) => { if (id) recomecar(id, { ...opcoes, ...o }) }
  const historia = sessao?.history || []
  const fechado = !!sessao?.mundo.state.finalizado
  const usdBrl = uso?.usdBrl || 5.4

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="TESTE" title="Converse com a Lia," accent="sem risco." description="Mesmo cérebro, mesmas ferramentas e travas do WhatsApp. Nada vai para o Kommo, para a agenda nem para nenhum lead." />

      {demo && <p className="text-[12px] text-warning">Modo demonstração: a conversa abaixo é um exemplo. Para conversar de verdade, a Central precisa do agente.</p>}

      <section className="panel p-4 md:p-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Opcao rotulo="Quem escreve" valor={opcoes.perfil} onChange={v => trocar({ perfil: v as TesteOpcoes['perfil'] })}
          itens={[['novo', 'Lead novo'], ['cliente', 'Já é cliente']]} />
        <Opcao rotulo="Textos" valor={opcoes.versao} onChange={v => trocar({ versao: v as TesteOpcoes['versao'] })}
          itens={[['vigente', 'No ar'], ['rascunho', 'Rascunho']]} />
        <button type="button" onClick={() => id && recomecar(id, opcoes)} className="ml-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-[8px] border border-line-soft text-[12px] text-body-mid hover:text-ink hover-raise">
          <RotateCcw size={13} /> Recomeçar
        </button>
      </section>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <section className="panel overflow-hidden flex flex-col min-h-[520px]">
          <div ref={lista} className="flex-1 p-4 md:p-5 space-y-3 overflow-y-auto max-h-[62vh] scroll-thin">
            {!historia.length && (
              <div className="py-8 text-center">
                <FlaskConical size={20} className="text-cyan mx-auto" />
                <p className="text-[13px] text-body-mid mt-3">Escreva como um lead escreveria no WhatsApp, ou comece por um destes:</p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {SUGESTOES.map(s => (
                    <button key={s.rotulo} type="button" onClick={() => enviar(s.texto)} disabled={enviando || demo}
                      className="px-3 py-2 rounded-full border border-line-soft text-[11.5px] text-body-mid hover:text-ink hover:border-cyan/25 disabled:opacity-40">{s.rotulo}</button>
                  ))}
                </div>
              </div>
            )}
            {historia.map(m => {
              const d = sessao?.detalhes[m.id]
              return (
                <div key={m.id} className={`flex ${m.dir === 'in' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[86%] md:max-w-[78%] ${m.dir === 'in' ? 'items-end' : 'items-start'} flex flex-col`}>
                    <div className={`rounded-[12px] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                      m.dir === 'in' ? 'bg-cyan/[0.12] border border-cyan/25 text-ink rounded-br-[4px]' : 'surface-alt border border-line-soft text-ink rounded-bl-[4px]'}`}>
                      {m.text}
                    </div>
                    {d && (
                      <div className="flex items-start gap-3 flex-wrap">
                        <Detalhes d={d} usdBrl={usdBrl} />
                        {!demo && (
                          <button type="button" onClick={() => setCorrigindo(m.id)} className={`mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium ${correcoes[m.id] ? 'text-success' : 'text-cyan'} hover:underline`}>
                            <PenLine size={11} /> {correcoes[m.id] ? 'corrigida · ver' : 'Corrigir'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {enviando && <div className="text-[11.5px] text-body-muted animate-pulse">A Lia está escrevendo… (pode levar uns 15 segundos)</div>}
          </div>

          <div className="border-t border-line-soft p-3 md:p-4">
            {erro && <p className="text-[12px] text-warning mb-2">{erro}</p>}
            {fechado ? (
              <div className="flex items-center justify-between gap-3 text-[12.5px] text-body-mid">
                <span>A Lia encerrou este atendimento. No WhatsApp, daqui em diante ela não responde mais este lead.</span>
                <button type="button" onClick={() => id && recomecar(id, opcoes)} className="shrink-0 inline-flex items-center gap-1.5 text-cyan text-[12px]"><RotateCcw size={12} /> Recomeçar</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={1} placeholder="Escreva como o lead…" disabled={demo}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                  className="campo flex-1 rounded-[10px] px-3.5 py-2.5 text-[13.5px] resize-none min-h-[44px] max-h-40" />
                <button type="button" onClick={() => enviar()} disabled={!texto.trim() || enviando || demo} aria-label="Enviar"
                  className="px-4 rounded-[10px] border border-cyan/30 bg-cyan/[0.12] text-cyan disabled:opacity-30"><Send size={16} /></button>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="panel p-5">
            <SectionTitle eyebrow="NO KOMMO, ISSO FARIA" title="O que mudaria no lead." />
            <div className="space-y-4 text-[12.5px]">
              <Linha icon={Route} rotulo="Etapa do Funil/SDR" valor={sessao ? ETAPA[sessao.mundo.statusId] || String(sessao.mundo.statusId) : opcoes.perfil === 'cliente' ? 'Repescar' : 'Leads de entrada'} />
              <Linha icon={FileText} rotulo="Análise do contracheque" valor={sessao?.mundo.state.analise
                ? `${DECISAO_ROTULO[sessao.mundo.state.analise.decisao] || sessao.mundo.state.analise.decisao} · ${(sessao.mundo.state.analise.comprometimento * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% comprometido · pode baixar cerca de ${brl(sessao.mundo.state.analise.reducaoMensal)}/mês`
                : 'Ainda não mandou contracheque'} />
              <Linha icon={CalendarCheck} rotulo="Tarefas para a equipe" valor={sessao?.mundo.tasks.length ? sessao.mundo.tasks.map(t => TAREFA[t.typeId] || `tipo ${t.typeId}`).join(' · ') : 'nenhuma'} />
              <div className="flex items-start gap-3">
                <Tags size={14} className="text-cyan shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-body-muted text-[11px]">Tags</div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {(sessao?.mundo.tags || ['lia']).map(t => <span key={t} className="font-mono text-[10px] px-2 py-0.5 rounded border border-line-soft text-ink">{t}</span>)}
                    {sessao && !sessao.mundo.tags.length && <span className="text-[11px] text-body-faint">nenhuma (a Lia saiu da conversa)</span>}
                  </div>
                </div>
              </div>
              {sessao?.mundo.state.finalizado && (
                <div className="rounded-[8px] border border-purple-400/30 bg-purple-400/[0.06] p-3">
                  <div className="font-mono text-[9px] tracking-[0.1em] text-purple-400">A LIA ENCERROU · {(MOTIVO_ROTULO[sessao.mundo.state.finalizado.motivo] || sessao.mundo.state.finalizado.motivo).toUpperCase()}</div>
                  {sessao.mundo.notes[sessao.mundo.notes.length - 1] && <pre className="mt-2 text-[11px] text-body-mid whitespace-pre-wrap break-words font-space">{sessao.mundo.notes[sessao.mundo.notes.length - 1]}</pre>}
                </div>
              )}
            </div>
          </section>
          <p className="text-[10.5px] text-body-faint leading-relaxed px-1">
            {sessao ? `Esta conversa: ${sessao.turnos} mensagem(ns), ${brl(sessao.custoUsd * usdBrl, 3)} de modelo. ` : ''}
            {uso ? `Laboratório hoje: ${uso.mensagens} de ${uso.limite} mensagens, ${brl(uso.custoUsd * usdBrl, 2)}.` : ''} Fotos e áudios não entram no teste: use os contracheques de exemplo, que já vêm como o sistema lê a imagem.
          </p>
        </aside>
      </div>

      {corrigindo && id && sessao && (() => {
        const i = sessao.history.findIndex(m => m.id === corrigindo)
        if (i < 0) return null
        const ultimaOut = sessao.history.slice(0, i).map(m => m.dir).lastIndexOf('out')
        const cliente = sessao.history.slice(ultimaOut + 1, i).filter(m => m.dir === 'in').map(m => m.text).join('\n')
        return (
          <CorrigirPainel origem="teste" cliente={cliente} resposta={sessao.history[i].text}
            pedido={{ acao: 'corrigir', sessao: sessao.id, mensagem: corrigindo }} resultado={correcoes[corrigindo]}
            onResultado={r => setCorrecoes(c => ({ ...c, [corrigindo]: r }))}
            onFechar={() => setCorrigindo(null)}
            onTestarRascunho={() => { setCorrigindo(null); recomecar(id, { ...opcoes, versao: 'rascunho' }) }} />
        )
      })()}
    </div>
  )
}

function Opcao({ rotulo, valor, itens, onChange }: { rotulo: string; valor: string; itens: Array<[string, string]>; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-body-muted">{rotulo}</span>
      <div className="segmented">
        {itens.map(([v, l]) => <button key={v} type="button" onClick={() => v !== valor && onChange(v)} className={`whitespace-nowrap ${v === valor ? 'active' : ''}`}>{l}</button>)}
      </div>
    </div>
  )
}

function Linha({ icon: Icon, rotulo, valor }: { icon: typeof Bot; rotulo: string; valor: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={14} className="text-cyan shrink-0 mt-0.5" />
      <div className="min-w-0"><div className="text-body-muted text-[11px]">{rotulo}</div><div className="text-ink mt-0.5 break-words">{valor}</div></div>
    </div>
  )
}

function Detalhes({ d, usdBrl }: { d: TesteSessao['detalhes'][string]; usdBrl: number }) {
  const [aberto, setAberto] = useState(false)
  const resumo = [
    d.tools.length ? [...new Set(d.tools.map(t => TOOL[t] || t))].join(', ') : 'sem ação no lead',
    `${(d.ms / 1000).toFixed(1)} s`,
    brl(d.custoUsd * usdBrl, 3),
    d.guard.length ? `${d.guard.length} trava(s)` : '',
  ].filter(Boolean).join(' · ')
  return (
    <div className="mt-1 max-w-full">
      <button type="button" onClick={() => setAberto(v => !v)} className="inline-flex items-center gap-1 font-mono text-[9.5px] text-body-faint hover:text-body-mid text-left">
        {resumo} <ChevronDown size={10} className={aberto ? 'rotate-180' : ''} />
      </button>
      {aberto && (
        <div className="mt-1.5 rounded-[8px] border border-line-soft p-3 space-y-1.5 text-[11px] text-body-mid break-words">
          {d.log.map((l, i) => <div key={i}>· {l}</div>)}
          {d.guard.map((g, i) => <div key={`g${i}`} className="text-warning">trava: {g}</div>)}
          {!d.log.length && !d.guard.length && <div>Respondeu sem chamar ferramenta.</div>}
        </div>
      )}
    </div>
  )
}
