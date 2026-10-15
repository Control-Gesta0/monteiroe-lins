'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  ArrowDown, ArrowRight, Ban, Building2, CircleHelp, Compass, FileText, Handshake, Headset, ListOrdered,
  MessageCircle, ShieldCheck, Sparkles, Tag, UserRound, Users, Workflow, Wrench,
} from 'lucide-react'
import FocusNav, { type FocusItem } from '@/components/FocusNav'
import { PageIntro, SectionTitle } from '@/components/ProductUI'
import { abrirPergunta } from '@/lib/pergunta'
import { dataHora, MOTIVO_ROTULO } from '@/lib/format'
import { useBase } from '@/lib/hooks'
import type { BaseEstado, BaseItem } from '@/lib/types'
import {
  ACOES, CLIENTE, COMBINADOS, ENTRADA, ENTRADA_NOTA, FAQ, FORA_DO_HORARIO, INICIO, NAO_CLIENTE, PASSAGEM, PASSOS,
  QUALQUER_MOMENTO, QUEM_MUDA, TAGS, TRAVAS, type Assunto,
} from '@/lib/como-usar'

type View = 'passos' | 'fluxo' | 'base' | 'equipe'

const VIEWS: FocusItem<View>[] = [
  { id: 'passos', label: 'Passo a passo', description: 'Como usar a Central e a IA', icon: ListOrdered },
  { id: 'fluxo', label: 'Fluxo do lead', description: 'Do WhatsApp à reunião', icon: Workflow },
  { id: 'base', label: 'Sua base', description: 'O que ela sabe e quem muda', icon: FileText },
  { id: 'equipe', label: 'Equipe no Kommo', description: 'Tags, combinados e dúvidas', icon: Users },
]

/**
 * Como usar: o manual vivo da Central. O fluxo do cliente e "Sua base" leem a
 * base publicada (GET /api/base), então mudou um texto em Ensinar, mudou aqui.
 */
export default function ComoUsar() {
  const [view, setView] = useState<View>('passos')
  const { data: base, erro } = useBase()

  useEffect(() => {
    const pedida = new URLSearchParams(window.location.search).get('ver')
    if (pedida && VIEWS.some(v => v.id === pedida)) setView(pedida as View)
  }, [])
  const trocar = (v: View) => {
    setView(v)
    window.history.replaceState(null, '', v === 'passos' ? '/como-usar' : `/como-usar?ver=${v}`)
  }

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="COMO USAR" title="Como a Lia" accent="trabalha com vocês."
        description="O passo a passo da Central, o caminho que o lead faz no WhatsApp e o que ela sabe hoje, lido da base publicada." />
      <FocusNav items={VIEWS} value={view} onChange={trocar} label="Partes do Como usar" />
      {erro && view !== 'passos' && view !== 'equipe' && <p className="text-[12px] text-warning">Não consegui ler a base agora ({erro}). O fluxo aparece sem os textos.</p>}

      {view === 'passos' && <Passos />}
      {view === 'fluxo' && <Fluxo base={base} />}
      {view === 'base' && <SuaBase base={base} />}
      {view === 'equipe' && <Equipe />}
    </div>
  )
}

function Passos() {
  return (
    <section className="space-y-3">
      {PASSOS.map((p, i) => (
        <div key={p.titulo} className="panel p-5 flex items-start gap-4">
          <span className="w-8 h-8 rounded-full border border-cyan/30 bg-cyan/[0.08] text-cyan font-mono text-[12px] flex items-center justify-center shrink-0">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <h3 className="font-impact font-bold text-[16px] text-ink">{p.titulo}</h3>
            <p className="text-[12.5px] text-body-mid leading-relaxed mt-1.5 max-w-[760px]">{p.texto}</p>
            <Link href={p.href} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-cyan mt-3">{p.acao} <ArrowRight size={12} /></Link>
          </div>
        </div>
      ))}
      <button type="button" onClick={abrirPergunta} className="panel interactive-card w-full p-4 flex items-center gap-3 text-left">
        <Sparkles size={15} className="text-cyan shrink-0" />
        <span className="text-[12.5px] text-body-mid flex-1">Quer um número rápido? Use o <strong className="text-ink">Pergunte à Central</strong> (no menu ou Ctrl K): &quot;quantos foram para a equipe?&quot;, &quot;quanto estamos gastando?&quot;.</span>
        <ArrowRight size={13} className="text-cyan shrink-0" />
      </button>
    </section>
  )
}

/* ---------- Fluxo do cliente ---------- */

function Fluxo({ base }: { base: BaseEstado | null }) {
  const itens = new Map((base?.itens || []).map(i => [i.id, i]))
  return (
    <section className="space-y-3">
      <Etapa icon={MessageCircle} titulo="Chega uma mensagem no WhatsApp">
        <p className="text-[12.5px] text-body-mid">Ela responde só quando tudo isto vale; se faltar um, fica quieta:</p>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 mt-2.5">
          {ENTRADA.map(e => <li key={e} className="text-[12.5px] text-ink flex gap-2"><ShieldCheck size={13} className="text-success shrink-0 mt-[3px]" />{e}</li>)}
        </ul>
        <p className="text-[11.5px] text-body-muted leading-relaxed mt-3">{ENTRADA_NOTA}</p>
      </Etapa>
      <Seta />
      <Etapa icon={UserRound} titulo={FORA_DO_HORARIO.titulo} discreto>
        <p className="text-[12.5px] text-body-mid leading-relaxed">{FORA_DO_HORARIO.texto}</p>
        <TextosDaBase ids={FORA_DO_HORARIO.base} itens={itens} />
      </Etapa>
      <Seta />
      <div className="grid md:grid-cols-2 gap-3">
        {INICIO.map((s, i) => (
          <Etapa key={s.titulo} numero={i + 1} titulo={s.titulo}><p className="text-[12.5px] text-body-mid leading-relaxed">{s.texto}</p></Etapa>
        ))}
      </div>
      <Seta />
      <div className="grid lg:grid-cols-2 gap-3 items-start">
        <div className="panel overflow-hidden">
          <Cabeca icon={FileText} titulo="Resultado da análise (planilha)" cor="#06b6d4" />
          {CLIENTE.map((a, i) => <AssuntoLinha key={a.titulo} a={a} itens={itens} primeira={i === 0} />)}
        </div>
        <div className="panel overflow-hidden">
          <Cabeca icon={Building2} titulo="Qualificado: marca a reunião" cor="#a78bfa" />
          <div className="p-5">
            <p className="text-[12.5px] text-body-mid leading-relaxed">{NAO_CLIENTE.texto}</p>
            <ol className="mt-3 space-y-1.5">
              {NAO_CLIENTE.perguntas.map((q, i) => (
                <li key={q} className="text-[12.5px] text-ink flex gap-2.5"><span className="font-mono text-[10px] text-purple-400 w-4 shrink-0 mt-[2px]">{i + 1}</span>{q}</li>
              ))}
            </ol>
            <div className="font-mono text-[9px] tracking-[0.1em] text-purple-400 mt-4">TERMINA COMO: {(MOTIVO_ROTULO[NAO_CLIENTE.motivo] || '').toUpperCase()}</div>
            <TextosDaBase ids={NAO_CLIENTE.base} itens={itens} />
          </div>
        </div>
      </div>
      <p className="text-[12px] text-body-muted px-1 flex gap-2"><Handshake size={13} className="text-cyan shrink-0 mt-[2px]" />{QUALQUER_MOMENTO}</p>
      <Seta />
      <Etapa icon={Headset} titulo="Passa para vocês (24 horas)">
        <ul className="space-y-1.5">
          {PASSAGEM.map(p => <li key={p} className="text-[12.5px] text-ink flex gap-2"><ArrowRight size={12} className="text-cyan shrink-0 mt-[4px]" />{p}</li>)}
        </ul>
        <p className="text-[11.5px] text-body-muted leading-relaxed mt-3">Reunião marcada e desqualificação também encerram a Lia naquele lead, cada uma com a sua mensagem da base.</p>
      </Etapa>

      <div className="pt-6">
        <SectionTitle eyebrow="TRAVAS EM CÓDIGO" title="O que ela não faz, mesmo que o modelo tente." description="Mudança no roteiro ou nestas regras passa pela Control Gestão e pelo mesmo exame antes de valer." />
        <div className="grid md:grid-cols-2 gap-2.5">
          {TRAVAS.map(t => <div key={t} className="panel p-4 flex gap-3"><ShieldCheck size={14} className="text-success shrink-0 mt-0.5" /><p className="text-[12.5px] text-body-mid leading-relaxed">{t}</p></div>)}
        </div>
      </div>
    </section>
  )
}

function Etapa({ icon: Icon, numero, titulo, discreto, children }: { icon?: typeof MessageCircle; numero?: number; titulo: string; discreto?: boolean; children: React.ReactNode }) {
  return (
    <div className={`panel p-5 ${discreto ? 'border-dashed' : ''}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className="w-8 h-8 rounded-full border border-cyan/30 bg-cyan/[0.08] text-cyan flex items-center justify-center shrink-0">
          {Icon ? <Icon size={14} /> : <span className="font-mono text-[12px]">{numero}</span>}
        </span>
        <h3 className="font-impact font-bold text-[15px] text-ink">{titulo}</h3>
      </div>
      {children}
    </div>
  )
}

function Seta() {
  return <div className="flex justify-center text-body-faint"><ArrowDown size={16} /></div>
}

function Cabeca({ icon: Icon, titulo, cor }: { icon: typeof UserRound; titulo: string; cor: string }) {
  return (
    <div className="px-5 py-4 border-b border-line-soft flex items-center gap-3">
      <span className="w-8 h-8 rounded-full border flex items-center justify-center shrink-0" style={{ color: cor, borderColor: `${cor}50`, background: `${cor}14` }}><Icon size={14} /></span>
      <h3 className="font-impact font-bold text-[15px] text-ink">{titulo}</h3>
    </div>
  )
}

function AssuntoLinha({ a, itens, primeira }: { a: Assunto; itens: Map<string, BaseItem>; primeira: boolean }) {
  return (
    <div className={`px-5 py-4 ${primeira ? '' : 'border-t border-line-soft'}`}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="text-[13px] font-medium text-ink">{a.titulo}</span>
        <span className="font-mono text-[8.5px] tracking-[0.1em] text-cyan">TERMINA COMO: {(MOTIVO_ROTULO[a.motivo] || a.motivo).toUpperCase()}</span>
      </div>
      <p className="text-[12px] text-body-mid leading-relaxed mt-1">{a.texto}</p>
      <TextosDaBase ids={a.base} itens={itens} />
    </div>
  )
}

/** Os textos da base que a Lia usa naquela etapa, como estão no ar agora. */
function TextosDaBase({ ids, itens }: { ids: string[]; itens: Map<string, BaseItem> }) {
  const lista = ids.map(id => itens.get(id)).filter((i): i is BaseItem => !!i)
  if (!lista.length) return null
  return (
    <div className="mt-3 space-y-1.5">
      <div className="font-mono text-[8.5px] tracking-[0.12em] text-body-faint">TEXTO DA BASE QUE ELA USA{lista.length > 1 ? ` (${lista.length})` : ''}</div>
      {lista.map(i => (
        <details key={i.id} className="group rounded-[8px] border border-line-soft">
          <summary className="list-none cursor-pointer px-3 py-2 flex items-center gap-2 hover-raise rounded-[8px]">
            <FileText size={12} className="text-cyan shrink-0" />
            <span className="text-[12px] text-ink flex-1 min-w-0 truncate">{i.titulo}</span>
            {i.rascunho !== null && <span className="font-mono text-[8px] tracking-[0.1em] px-1.5 py-0.5 rounded border border-warning/40 text-warning shrink-0">MUDANÇA NO RASCUNHO</span>}
            <span className="text-[10px] text-body-faint group-open:rotate-90 transition-transform shrink-0">▷</span>
          </summary>
          <div className="px-3 pb-3">
            <div className="surface-alt rounded-[6px] px-3 py-2.5 text-[12px] leading-relaxed text-ink whitespace-pre-wrap break-words max-h-64 overflow-y-auto scroll-thin">{i.noAr}</div>
            <Link href={`/ensinar?ver=sabe#item-${i.id}`} className="inline-flex items-center gap-1 text-[11px] text-cyan mt-2">Mudar em Ensinar <ArrowRight size={11} /></Link>
          </div>
        </details>
      ))}
    </div>
  )
}

/* ---------- Sua base ---------- */

const CAMINHO = [
  { t: 'Você pede', d: 'Texto, arquivo, link ou a correção de uma resposta.' },
  { t: 'A IA muda o rascunho', d: 'Mostra o antes e o depois; dá para desfazer.' },
  { t: 'Você testa', d: 'Teste › Textos: Rascunho.' },
  { t: 'O exame confere', d: '10 conversas de teste; se uma falhar, nada muda.' },
  { t: 'Vale no WhatsApp', d: 'E dá para voltar a uma versão anterior.' },
]

function SuaBase({ base }: { base: BaseEstado | null }) {
  if (!base) return <div className="panel h-48 animate-pulse surface-alt" />
  const grupos = Object.entries(base.grupos).filter(([g]) => base.itens.some(i => i.grupo === g))
  const extras = base.itens.filter(i => i.grupo === 'extras' && i.noAr)
  const alteracoes = base.alteracoes.length
  return (
    <section className="space-y-8">
      <div className="panel p-5 md:p-6 flex items-start gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-cyan">Versão {base.versao} no ar{base.publicadoEm ? ` · publicada em ${dataHora(base.publicadoEm)}` : ' · textos originais da implantação'}</div>
          <h2 className="font-impact font-bold text-[18px] md:text-[20px] text-ink mt-2">
            {base.itens.filter(i => i.noAr).length} textos e informações no ar{extras.length ? `, ${extras.length} ${extras.length === 1 ? 'acrescentada' : 'acrescentadas'} pela equipe` : ''}.
          </h2>
          <p className="text-[12.5px] text-body-mid mt-1.5">{alteracoes ? `${alteracoes} ${alteracoes === 1 ? 'mudança espera' : 'mudanças esperam'} o exame no rascunho.` : 'Nada esperando no rascunho.'}</p>
        </div>
        <Link href="/ensinar" className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-[8px] border border-cyan/30 bg-cyan/[0.1] text-cyan text-[12px] font-medium shrink-0">Abrir Ensinar <ArrowRight size={12} /></Link>
      </div>

      <div>
        <SectionTitle eyebrow="O QUE ELA SABE HOJE" title="Os textos da base, por assunto." description="Clique num texto para abrir em Ensinar." />
        <div className="grid md:grid-cols-2 gap-3">
          {grupos.map(([g, titulo]) => {
            const lista = base.itens.filter(i => i.grupo === g && (i.noAr || i.rascunho))
            if (!lista.length) return null
            return (
              <div key={g} className="panel p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[13.5px] font-medium text-ink">{titulo}</h3>
                  <span className="font-mono text-[10px] text-body-muted">{lista.length}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {lista.map(i => (
                    <Link key={i.id} href={`/ensinar?ver=sabe#item-${i.id}`} className={`px-2.5 py-1 rounded-full border text-[11.5px] hover:text-ink ${i.rascunho !== null ? 'border-warning/40 text-warning' : 'border-line-soft text-body-mid'}`}>{i.titulo}</Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <SectionTitle eyebrow="DO PEDIDO AO WHATSAPP" title="Como uma mudança passa a valer." />
        <ol className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {CAMINHO.map((c, i) => (
            <li key={c.t} className="panel p-4">
              <span className="font-mono text-[10px] text-cyan">{i + 1}</span>
              <div className="text-[13px] font-medium text-ink mt-1">{c.t}</div>
              <p className="text-[11.5px] text-body-mid leading-relaxed mt-1">{c.d}</p>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <SectionTitle eyebrow="QUEM MUDA O QUÊ" title="O que vocês mudam e o que não." />
        <div className="grid md:grid-cols-3 gap-3">
          <Coluna icon={Sparkles} cor="#06b6d4" titulo="Vocês, pela IA em Ensinar" itens={QUEM_MUDA.voce} />
          <Coluna icon={Wrench} cor="#a78bfa" titulo="A Control Gestão" itens={QUEM_MUDA.control} nota="Peça em Ensinar: a IA registra o pedido." />
          <Coluna icon={Ban} cor="#f59e0b" titulo="Nunca entra na base" itens={QUEM_MUDA.nunca} nota="Fica com o advogado, na reunião." />
        </div>
      </div>
    </section>
  )
}

function Coluna({ icon: Icon, cor, titulo, itens, nota }: { icon: typeof Sparkles; cor: string; titulo: string; itens: string[]; nota?: string }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2.5">
        <Icon size={14} style={{ color: cor }} />
        <h3 className="text-[13.5px] font-medium text-ink">{titulo}</h3>
      </div>
      <ul className="mt-3 space-y-1.5">
        {itens.map(i => <li key={i} className="text-[12.5px] text-body-mid flex gap-2"><span style={{ color: cor }}>·</span>{i}</li>)}
      </ul>
      {nota && <p className="text-[11px] text-body-faint mt-3">{nota}</p>}
    </div>
  )
}

/* ---------- Equipe no Kommo ---------- */

function Equipe() {
  return (
    <section className="space-y-8">
      <div>
        <SectionTitle eyebrow="TAGS" title="O que cada tag faz." />
        <div className="panel overflow-hidden">
          {TAGS.map((t, i) => (
            <div key={t.tag} className={`px-5 py-4 grid md:grid-cols-[170px_1fr_1fr] gap-x-5 gap-y-1.5 ${i ? 'border-t border-line-soft' : ''}`}>
              <span className="inline-flex items-center gap-2 font-mono text-[11.5px] text-ink"><Tag size={12} className="text-cyan" />{t.tag}</span>
              <span className="text-[12.5px] text-body-mid">{t.significa}</span>
              <span className="text-[11.5px] text-body-muted">{t.quem}</span>
            </div>
          ))}
        </div>
        <div className="grid md:grid-cols-3 gap-3 mt-3">
          {ACOES.map(a => (
            <div key={a.titulo} className="panel p-5">
              <h3 className="text-[13.5px] font-medium text-ink">{a.titulo}</h3>
              <p className="text-[12.5px] text-body-mid leading-relaxed mt-1.5">{a.texto}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle eyebrow="COMBINADOS" title="Para tudo continuar funcionando." />
        <div className="panel overflow-hidden">
          {COMBINADOS.map((c, i) => (
            <div key={c.titulo} className={`px-5 py-4 ${i ? 'border-t border-line-soft' : ''}`}>
              <div className="text-[13px] font-medium text-ink">{c.titulo}</div>
              <p className="text-[12px] text-body-mid leading-relaxed mt-1">{c.porque}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle eyebrow="DÚVIDAS FREQUENTES" title="Perguntas da equipe." />
        <div className="space-y-2">
          {FAQ.map(f => (
            <details key={f.p} className="panel group overflow-hidden">
              <summary className="list-none cursor-pointer px-5 py-3.5 flex items-center gap-3 hover-raise">
                <CircleHelp size={14} className="text-cyan shrink-0" />
                <span className="text-[13px] font-medium text-ink flex-1">{f.p}</span>
                <span className="text-[11px] text-body-faint group-open:rotate-90 transition-transform">▷</span>
              </summary>
              <p className="px-5 pb-4 pl-12 text-[12.5px] text-body-mid leading-relaxed">{f.r}</p>
            </details>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-body-faint flex items-center gap-2"><Compass size={12} /> Esta aba acompanha a base publicada: mudou um texto em Ensinar, mudou aqui.</p>
    </section>
  )
}
