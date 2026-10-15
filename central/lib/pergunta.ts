/** Abre o "Pergunte à Central" de qualquer lugar (menu, topo no celular, Como usar). Sem dependência pesada. */
export const abrirPergunta = () => window.dispatchEvent(new Event('central:perguntar'))
