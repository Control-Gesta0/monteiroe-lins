/**
 * A página do Painel de gestão (GET /api/painel?k=<segredo>). HTML único, sem
 * bibliotecas de fora: busca os dados em /api/painel?formato=json e desenha.
 * Tudo o que vem do Kommo ou do WhatsApp passa por esc() antes de virar HTML.
 */
export const PAGINA_PAINEL = String.raw`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Painel Monteiro &amp; Lins</title>
<style>
:root {
  color-scheme: light;
  --page: #f9f9f7; --surface: #fcfcfb; --surface-2: #f2f1ed; --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
  --grid: #e1e0d9; --axis: #c3c2b7; --border: rgba(11,11,11,0.10);
  --brand: #27476e; --brand-ink: #ffffff; --accent: #ef4d22;
  --series-1: #2a78d6; --series-1-soft: #cde2fb;
  --good: #0ca30c; --good-ink: #006300; --warning: #fab219; --serious: #ec835a; --critical: #d03b3b;
  --shadow: 0 1px 2px rgba(11,11,11,.06);
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --page: #0d0d0d; --surface: #1a1a19; --surface-2: #232322; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
    --brand: #1d3656; --series-1: #3987e5; --series-1-soft: #184f95; --good-ink: #0ca30c; --shadow: none;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --page: #0d0d0d; --surface: #1a1a19; --surface-2: #232322; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781;
  --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
  --brand: #1d3656; --series-1: #3987e5; --series-1-soft: #184f95; --good-ink: #0ca30c; --shadow: none;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
a { color: var(--series-1); }
header { background: var(--brand); color: var(--brand-ink); padding: 14px 24px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
header h1 { font-size: 18px; margin: 0; font-weight: 650; letter-spacing: .2px; }
header h1 span { color: #ffb59f; font-weight: 500; }
header .meta { font-size: 12px; opacity: .85; margin-left: auto; }
header button { background: rgba(255,255,255,.12); color: #fff; border: 1px solid rgba(255,255,255,.25); border-radius: 8px; padding: 6px 12px; font: inherit; cursor: pointer; }
header button:hover { background: rgba(255,255,255,.2); }
nav { display: flex; gap: 4px; padding: 0 24px; background: var(--surface); border-bottom: 1px solid var(--border); overflow-x: auto; position: sticky; top: 0; z-index: 5; }
nav button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 12px 10px; font: inherit; color: var(--ink-2); cursor: pointer; white-space: nowrap; }
nav button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); font-weight: 600; }
main { max-width: 1280px; margin: 0 auto; padding: 20px 24px 60px; }
h2 { font-size: 16px; margin: 28px 0 10px; }
h2 small { font-weight: 400; color: var(--muted); font-size: 12px; margin-left: 6px; }
h3 { font-size: 13px; margin: 0 0 10px; color: var(--ink-2); font-weight: 600; text-transform: uppercase; letter-spacing: .4px; }
.box { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; box-shadow: var(--shadow); }
.grid { display: grid; gap: 12px; }
.g2 { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
.g3 { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; box-shadow: var(--shadow); }
.tile .r { font-size: 12px; color: var(--ink-2); display: flex; gap: 6px; align-items: center; }
.tile .v { font-size: 26px; font-weight: 650; margin-top: 4px; }
.tile .d { font-size: 11px; color: var(--muted); margin-top: 2px; }
.st { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--border); white-space: nowrap; }
.st i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.st.bom i { background: var(--good); } .st.atencao i { background: var(--warning); } .st.critico i { background: var(--critical); } .st.neutro i { background: var(--axis); }
.wa { display: flex; flex-direction: column; gap: 8px; }
.wa .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px 8px; flex-wrap: wrap; }
.wa .nome { font-weight: 650; font-size: 15px; white-space: nowrap; }
.wa .papel { color: var(--ink-2); font-size: 12px; }
.wa .linha { font-size: 12px; color: var(--muted); }
.wa .acoes { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
.btn { display: inline-flex; align-items: center; gap: 6px; border-radius: 8px; padding: 7px 12px; font: inherit; font-size: 13px; cursor: pointer; text-decoration: none; border: 1px solid var(--border); background: var(--surface-2); color: var(--ink); }
.btn.pri { background: var(--brand); color: #fff; border-color: transparent; }
.btn[aria-disabled="true"] { opacity: .5; pointer-events: none; }
.passos { margin: 0; padding-left: 20px; color: var(--ink-2); font-size: 13px; }
.passos li { margin: 3px 0; }
.check { list-style: none; margin: 0; padding: 0; }
.check li { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--grid); align-items: baseline; }
.check li:last-child { border-bottom: 0; }
.check .ic { font-weight: 700; width: 18px; text-align: center; }
.check .ok { color: var(--good-ink); } .check .no { color: var(--critical); }
.check .det { color: var(--muted); font-size: 12px; margin-left: auto; text-align: right; }
.bars { display: grid; grid-template-columns: minmax(120px, 44%) 1fr auto; gap: 6px 10px; align-items: center; font-size: 13px; }
.bars .lb { color: var(--ink-2); overflow-wrap: anywhere; line-height: 1.25; }
.bars .tr { height: 14px; background: transparent; border-left: 1px solid var(--axis); position: relative; }
.bars .b { height: 100%; background: var(--series-1); border-radius: 0 4px 4px 0; min-width: 2px; }
.bars .b.zero { background: transparent; }
.bars .vl { font-variant-numeric: tabular-nums; color: var(--ink); text-align: right; min-width: 3ch; }
.bars .vl small { color: var(--muted); margin-left: 4px; }
.tag { font-size: 10px; font-weight: 700; padding: 0 5px; border-radius: 4px; background: var(--series-1-soft); color: var(--ink); margin-left: 6px; vertical-align: 1px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; font-weight: 600; color: var(--ink-2); border-bottom: 1px solid var(--axis); padding: 6px 8px; white-space: nowrap; }
td { border-bottom: 1px solid var(--grid); padding: 6px 8px; vertical-align: top; }
td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
.tbl { overflow-x: auto; }
.filtros { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.filtros select, .filtros input { font: inherit; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2); color: var(--ink); }
.vazio { color: var(--muted); font-size: 13px; padding: 8px 0; }
.aviso { border-left: 3px solid var(--warning); padding: 10px 14px; background: var(--surface); border-radius: 8px; margin: 12px 0; font-size: 13px; }
.aviso.erro { border-left-color: var(--critical); }
#tip { position: fixed; pointer-events: none; background: var(--ink); color: var(--page); font-size: 12px; padding: 6px 8px; border-radius: 6px; max-width: 280px; display: none; z-index: 20; }
.carregando { padding: 60px; text-align: center; color: var(--muted); }
@media (max-width: 640px) { main { padding: 16px; } header, nav { padding-left: 16px; padding-right: 16px; } .bars { grid-template-columns: 40% 1fr auto; } }
</style>
</head>
<body>
<header>
  <h1>Monteiro &amp; Lins Advocacia <span>· Painel de gestão</span></h1>
  <div class="meta" id="meta">carregando…</div>
  <button id="atualizar" type="button">Atualizar</button>
  <button id="tema" type="button" aria-label="Alternar tema claro e escuro">◐</button>
</header>
<nav id="abas" role="tablist"></nav>
<main id="conteudo"><div class="carregando">Carregando os números do Kommo (a primeira vez leva até 1 minuto)…</div></main>
<div id="tip" role="tooltip"></div>
<script>
(function () {
  var params = new URLSearchParams(location.search)
  var chave = params.get('k') || ''
  try { if (chave) sessionStorage.setItem('painel-k', chave); else chave = sessionStorage.getItem('painel-k') || '' } catch (e) {}
  if (params.get('k')) { params.delete('k'); history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '')) }
  try { var t = localStorage.getItem('painel-tema'); if (t) document.documentElement.dataset.theme = t } catch (e) {}

  var D = null, aba = 'inicio'
  try { aba = sessionStorage.getItem('painel-aba') || 'inicio' } catch (e) {}
  // Abas: Início, um funil por aba (achados ao vivo no Kommo) e a operação da Lia
  function abas() { return [['inicio', 'Início']].concat(D ? D.funis.map(function (f) { return [f.chave, f.curto] }) : []).concat([['operacao', 'Lia e operação']]) }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
  function num(n) { return typeof n === 'number' ? n.toLocaleString('pt-BR') : esc(n) }
  function brl(n) { return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) }
  var ROT = { bom: 'ok', atencao: 'atenção', critico: 'crítico', neutro: '—' }
  function status(s) { return s ? '<span class="st ' + s + '"><i></i>' + ROT[s] + '</span>' : '' }
  function quando(iso) {
    if (!iso) return 'nunca'
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
    if (m < 1) return 'agora'; if (m < 60) return 'há ' + m + ' min'; if (m < 1440) return 'há ' + Math.round(m / 60) + ' h'
    return 'há ' + Math.round(m / 1440) + ' dias'
  }
  function tiles(lista) {
    return '<div class="tiles">' + lista.map(function (d) {
      return '<div class="tile"' + (d.dica ? ' data-tip="' + esc(d.dica) + '"' : '') + '><div class="r">' + esc(d.rotulo) + ' ' + status(d.status) + '</div><div class="v">' + num(d.valor) + '</div></div>'
    }).join('') + '</div>'
  }
  // Barras horizontais de uma série: rótulo, barra e valor escritos (é a própria tabela).
  function barras(itens, opts) {
    opts = opts || {}
    if (!itens.length) return '<div class="vazio">' + (opts.vazio || 'Nada por aqui ainda.') + '</div>'
    var max = Math.max.apply(null, itens.map(function (i) { return i.n })) || 1
    return '<div class="bars">' + itens.map(function (i) {
      var w = i.n ? Math.max(1.5, 100 * i.n / max) : 0
      var tip = esc(i.rotulo) + ': ' + num(i.n) + (i.tip ? ' · ' + esc(i.tip) : '')
      return '<div class="lb" title="' + esc(i.rotulo) + '">' + esc(i.rotulo) + (i.ia ? '<span class="tag">IA</span>' : '') + '</div>' +
        '<div class="tr" data-tip="' + tip + '"><div class="b' + (i.n ? '' : ' zero') + '" style="width:' + w + '%"></div></div>' +
        '<div class="vl">' + num(i.n) + (i.extra ? '<small>' + esc(i.extra) + '</small>' : '') + '</div>'
    }).join('') + '</div>'
  }

  function inicio() {
    var h = ''
    if (D.erroKommo) h += '<div class="aviso erro">Não consegui ler o Kommo agora (' + esc(D.erroKommo) + ').' + (D.kommoDe ? ' Os números abaixo são de ' + esc(new Date(D.kommoDe).toLocaleString('pt-BR')) + '.' : '') + ' Clique em Atualizar daqui a pouco.</div>'
        h += '<h2>1. Conectar os WhatsApps <small>abra o link de cada número no computador e leia o QR com o celular daquele número</small></h2>'
    h += '<div class="grid g2" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr))">' + D.conexoes.map(function (c) {
      var s = c.status === 'conectado' ? 'bom' : c.status === 'desconectado' ? 'critico' : 'atencao'
      var rot = { conectado: 'Conectado', desconectado: 'Desconectado', aguardando: 'Aguardando conexão', erro: 'Sem resposta da Stevo' }[c.status]
      return '<div class="box wa"><div class="top"><div><div class="nome">' + esc(c.instancia) + '</div><div class="papel">' + esc(c.papel) + '</div></div>' +
        '<span class="st ' + s + '"><i></i>' + esc(rot) + '</span></div>' +
        '<div class="linha">Número: ' + esc(c.numero || 'a definir') + (c.whatsapp ? ' · ' + esc(c.whatsapp) : '') + ' · ' + (c.ia ? 'a Lia atende' : 'só a equipe') + '</div>' +
        '<div class="linha">Última mensagem recebida: ' + esc(quando(c.ultimaMensagem)) + '</div>' +
        '<div class="acoes"><a class="btn pri" target="_blank" rel="noopener noreferrer" href="' + esc(c.link || '#') + '"' + (c.link ? '' : ' aria-disabled="true"') + '>Abrir link de conexão</a>' +
        (c.link ? '<button class="btn" type="button" data-copiar="' + esc(c.link) + '">Copiar link</button>' : '<span class="linha">link não configurado</span>') + '</div>' +
        (c.webhook ? '<div class="acoes"><button class="btn" type="button" data-copiar="' + esc(c.webhook) + '" data-tip="Cole em Configurações → Webhook da instância na Stevo, com MESSAGE e SEND_MESSAGE marcados">Copiar URL do webhook</button></div>' : '') + '</div>'
    }).join('') + '</div>'
    h += '<div class="box" style="margin-top:12px"><ol class="passos">' +
      (D.conexoes.some(function (c) { return c.webhook }) ? '<li>Na Stevo, em cada instância: Configurações → <b>Webhook</b> → cole a URL do botão "Copiar URL do webhook" daquele número, marque <b>MESSAGE</b>, <b>SEND_MESSAGE</b> e <b>CONNECTION</b> e salve.</li>' : '') +
      '<li>Abra o link do número no computador (ou mande o link para quem está com o celular).</li>' +
      '<li>No celular daquele número: WhatsApp → <b>Dispositivos conectados</b> → <b>Conectar um dispositivo</b>.</li>' +
      '<li>Leia o QR Code que aparece no link. Em alguns segundos o status aqui vira <b>Conectado</b> (clique em Atualizar).</li>' +
      '<li>Mande um "oi" de outro celular para o número: a linha "Última mensagem recebida" confirma que as mensagens estão chegando.</li></ol></div>'

    h += '<h2>2. Implantação</h2><div class="box"><ul class="check">' + D.implantacao.map(function (i) {
      return '<li><span class="ic ' + (i.ok ? 'ok">✓' : 'no">!') + '</span><span>' + esc(i.item) + '</span><span class="det">' + esc(i.detalhe) + '</span></li>'
    }).join('') + '</ul>'
    var e = D.estrutura
    if (e && !e.ok) h += '<div class="aviso">Falta no Kommo: ' + esc([].concat(e.faltaFunil || [], e.faltaEtapa || []).join(' · ')) + '</div>'
    h += '</div>'

    h += '<h2>3. Resumo <small>últimos 30 dias e agora</small></h2>' + tiles(D.resumo)

    h += '<div class="grid g2" style="margin-top:12px">'
    var j = D.jornada || []
    h += '<div class="box"><h3>Jornada do cliente (30 dias)</h3>' + barras(j.map(function (x, i) {
      var p = i && j[i - 1].n ? Math.round(100 * x.n / j[i - 1].n) + '% da etapa anterior' : ''
      return { rotulo: x.etapa, n: x.n, extra: p ? Math.round(100 * x.n / j[i - 1].n) + '%' : '', tip: p }
    }), { vazio: 'Nenhum card novo no Funil/SDR nos últimos 30 dias.' }) + '<div class="vazio">Clientes únicos que entraram no Funil/SDR nos últimos 30 dias, pela etapa em que estão hoje.</div></div>'
    h += '<div class="box"><h3>Cards abertos por funil</h3>' + barras(D.funis.filter(function (f) { return f.existe }).map(function (f) {
      return { rotulo: f.curto, n: f.abertos, tip: f.parados + ' parados há 7+ dias' }
    })) + '</div>'
    h += '<div class="box"><h3>Perdas por motivo (30 dias)</h3>' + barras(D.perdas, { vazio: 'Nenhum card perdido nos últimos 30 dias.' }) + '</div>'
    h += '<div class="box"><h3>Ganhos e perdas por funil (30 dias)</h3><div class="tbl"><table><thead><tr><th>Funil</th><th class="n">Ganhos</th><th class="n">Perdidos</th><th class="n">Parados</th></tr></thead><tbody>' +
      D.funis.filter(function (f) { return f.existe }).map(function (f) { return '<tr><td>' + esc(f.curto) + '</td><td class="n">' + f.ganhos30 + '</td><td class="n">' + f.perdidos30 + '</td><td class="n">' + f.parados + '</td></tr>' }).join('') +
      '</tbody></table></div></div>'
    h += '</div>'
    return h
  }

  function funil(chave) {
    var f = D.funis.filter(function (x) { return x.chave === chave })[0]
    if (D.erroKommo && (!f || !f.existe)) return '<div class="aviso erro">Não consegui ler o Kommo agora: ' + esc(D.erroKommo) + '</div>'
    if (!f || !f.existe) return '<div class="aviso">Funil não encontrado no Kommo' + (f ? ': ' + esc(f.nome) : '') + '.</div>'
    var h = '<h2>' + esc(f.nome) + ' <small><a target="_blank" rel="noopener" href="' + esc(D.kommoUrl) + '/leads/pipeline/">abrir no Kommo</a></small></h2>' + tiles(f.destaques)
    h += '<div class="grid g2" style="margin-top:12px"><div class="box"><h3>Cards por etapa</h3>' + barras(f.etapas.map(function (e) {
      return { rotulo: e.nome, n: e.n, ia: e.ia, extra: e.parados ? e.parados + ' parados' : '', tip: 'tempo médio sem mexer: ' + e.diasMedio + ' dias' + (e.valor ? ' · ' + brl(e.valor) : '') }
    })) + (f.etapas.some(function (e) { return e.ia }) ? '<div class="vazio"><span class="tag">IA</span> etapas em que a Lia conversa com o cliente (com a tag dela); nas outras, a equipe.</div>' : '') + '</div>'
    f.quebras.forEach(function (q) { h += '<div class="box"><h3>' + esc(q.titulo) + '</h3>' + barras(q.itens) + '</div>' })
    h += '</div>'
    var temValor = f.etapas.some(function (e) { return e.valor })
    h += '<h2>Cards <small>do que está parado há mais tempo para o mais recente</small></h2><div class="box"><div class="filtros"><select id="fEtapa"><option value="">Todas as etapas</option>' +
      f.etapas.map(function (e) { return '<option>' + esc(e.nome) + '</option>' }).join('') + '</select><input id="fBusca" type="search" placeholder="Buscar cliente ou responsável"></div><div class="tbl"><table><thead><tr><th>Cliente</th><th>Etapa</th><th>Responsável</th><th>Tags</th>' +
      (temValor ? '<th class="n">Valor</th>' : '') + '<th class="n">Sem mexer</th></tr></thead><tbody id="linhas"></tbody></table></div></div>'
    setTimeout(function () { linhas(f, temValor) }, 0)
    return h
  }
  function linhas(f, temValor) {
    var et = document.getElementById('fEtapa'), bu = document.getElementById('fBusca'), tb = document.getElementById('linhas')
    function pinta() {
      var q = (bu.value || '').toLowerCase()
      var cards = [].concat.apply([], f.etapas.map(function (e) { return e.cards }))
        .filter(function (c) { return (!et.value || c.etapa === et.value) && (!q || (c.nome + ' ' + c.responsavel).toLowerCase().indexOf(q) >= 0) })
        .sort(function (a, b) { return b.dias - a.dias })
      tb.innerHTML = cards.length ? cards.slice(0, 200).map(function (c) {
        var s = c.dias >= 7 ? ' ' + status(c.dias >= 15 ? 'critico' : 'atencao') : ''
        return '<tr><td><a target="_blank" rel="noopener noreferrer" href="' + esc(c.link) + '">' + esc(c.nome) + '</a></td><td>' + esc(c.etapa) + '</td><td>' + esc(c.responsavel) + '</td><td>' + esc(c.tags || '—') + '</td>' +
          (temValor ? '<td class="n">' + (c.valor ? brl(c.valor) : '—') + '</td>' : '') + '<td class="n">' + c.dias + ' d' + s + '</td></tr>'
      }).join('') : '<tr><td colspan="6" class="vazio">Nenhum card.</td></tr>'
    }
    et.onchange = pinta; bu.oninput = pinta; pinta()
  }

  function operacao() {
    var ia = D.ia || {}
    var h = '<h2>Lia hoje</h2>' + tiles([
      { rotulo: 'Respostas', valor: ia.respostas || 0 }, { rotulo: 'Não respondeu (regra)', valor: ia.pulou || 0, dica: 'Sem a tag da Lia, equipe falou há menos de 6 h, card fora das etapas dela…' },
      { rotulo: 'Erros', valor: ia.erros || 0, status: ia.erros ? 'critico' : 'bom' },
      { rotulo: 'Custo', valor: (ia.custoHoje || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
      { rotulo: 'Contracheques analisados', valor: ia.contracheques || 0 }, { rotulo: 'Reuniões marcadas', valor: ia.agendou || 0, status: 'bom' },
    ])
    h += '<div class="grid g2" style="margin-top:12px"><div class="box"><h3>O que a Lia fez hoje</h3>' + barras((ia.ferramentas || []).map(function (t) {
      return { rotulo: t.rotulo, n: t.n }
    }), { vazio: 'Nenhuma ação hoje.' }) + '</div>'
    h += '<div class="box"><h3>Tarefas vencidas por responsável</h3>' + barras((D.tarefas && D.tarefas.porResponsavel) || [], { vazio: 'Nenhuma tarefa vencida.' }) +
      '<div class="vazio">' + num((D.tarefas && D.tarefas.abertas) || 0) + ' tarefas em aberto no Kommo.</div></div></div>'
    h += '<h2>Clientes esperando resposta <small>a mensagem mais antiga sem resposta de cada conversa</small></h2><div class="box"><div class="tbl"><table><thead><tr><th>Número do escritório</th><th>Cliente</th><th class="n">Esperando</th></tr></thead><tbody>' +
      (D.semResposta.length ? D.semResposta.map(function (s) {
        var m = s.minutos, t = m < 60 ? m + ' min' : m < 1440 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' dias'
        return '<tr><td>' + esc(s.numero) + '</td><td>' + esc(s.cliente) + '</td><td class="n">' + t + ' ' + status(m > 120 ? 'critico' : m > 30 ? 'atencao' : 'bom') + '</td></tr>'
      }).join('') : '<tr><td colspan="3" class="vazio">Ninguém esperando.</td></tr>') + '</tbody></table></div></div>'
    return h
  }

  function desenha() {
    if (D && aba !== 'inicio' && aba !== 'operacao' && !D.funis.some(function (f) { return f.chave === aba })) aba = 'inicio'
    document.getElementById('abas').innerHTML = abas().map(function (a) { return '<button role="tab" type="button" data-aba="' + a[0] + '" aria-selected="' + (a[0] === aba) + '">' + a[1] + '</button>' }).join('')
    if (!D) return
    var c = document.getElementById('conteudo')
    c.innerHTML = aba === 'inicio' ? inicio() : aba === 'operacao' ? operacao() : funil(aba)
    document.getElementById('meta').textContent = 'Atualizado ' + new Date(D.geradoEm).toLocaleString('pt-BR') + ' · Lia ' + (D.canalLia === 'stevo' ? 'pela Stevo' : 'pelo WhatsApp do Kommo')
  }
  // Sem chave (ou chave errada): pede a chave aqui mesmo e esquece a que estava guardada.
  function pedirChave(msg) {
    chave = ''
    try { sessionStorage.removeItem('painel-k') } catch (e) {}
    document.getElementById('meta').textContent = ''
    document.getElementById('conteudo').innerHTML = '<div class="box" style="max-width:460px;margin:40px auto"><h3>Chave de acesso</h3>' +
      (msg ? '<div class="aviso erro">' + esc(msg) + '</div>' : '') +
      '<form id="fChave" class="filtros" style="margin:0"><input id="iChave" type="password" autocomplete="current-password" placeholder="Cole a chave de acesso" style="flex:1;min-width:200px" required>' +
      '<button class="btn pri" type="submit">Entrar</button></form>' +
      '<div class="vazio">A chave fica só nesta aba do navegador e some quando ela é fechada.</div></div>'
    document.getElementById('fChave').onsubmit = function (ev) {
      ev.preventDefault()
      chave = document.getElementById('iChave').value.trim()
      try { sessionStorage.setItem('painel-k', chave) } catch (e) {}
      carrega(false)
    }
    document.getElementById('iChave').focus()
  }
  function carrega(forcar) {
    if (!chave) { pedirChave(''); return }
    document.getElementById('meta').textContent = 'carregando…'
    fetch('/api/painel?formato=json' + (forcar ? '&atualizar=1' : ''), { headers: { 'x-painel-chave': chave } })
      .then(function (r) { if (r.status === 401) { pedirChave('Chave de acesso inválida.'); return null } if (!r.ok) throw new Error('Erro ' + r.status); return r.json() })
      .then(function (d) { if (d) { D = d; desenha() } })
      .catch(function (e) { document.getElementById('meta').textContent = ''; document.getElementById('conteudo').innerHTML = '<div class="aviso erro">' + esc(e.message) + '</div>' })
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-aba]')
    if (t) { aba = t.getAttribute('data-aba'); try { sessionStorage.setItem('painel-aba', aba) } catch (e) {} desenha(); window.scrollTo(0, 0); return }
    var cp = ev.target.closest('[data-copiar]')
    if (cp) { var antes = cp.textContent; navigator.clipboard && navigator.clipboard.writeText(cp.getAttribute('data-copiar')).then(function () { cp.textContent = 'Copiado'; setTimeout(function () { cp.textContent = antes }, 1500) }) }
  })
  var tip = document.getElementById('tip')
  document.addEventListener('mousemove', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-tip]')
    if (!el) { tip.style.display = 'none'; return }
    tip.textContent = el.getAttribute('data-tip'); tip.style.display = 'block'
    tip.style.left = Math.min(ev.clientX + 12, innerWidth - 300) + 'px'; tip.style.top = (ev.clientY + 14) + 'px'
  })
  document.getElementById('atualizar').onclick = function () { carrega(true) }
  document.getElementById('tema').onclick = function () {
    var escuro = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.dataset.theme = escuro ? 'light' : 'dark'
    try { localStorage.setItem('painel-tema', document.documentElement.dataset.theme) } catch (e) {}
  }
  desenha(); carrega(false)
  setInterval(function () { if (!document.hidden) carrega(false) }, 120000)
})()
</script>
</body>
</html>`
