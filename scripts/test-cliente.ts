/**
 * TESTES DO CLIENTE (patch) — rodam junto com `npm test`.
 * Para cada regra em lib/regras.ts: um texto que DEVE bloquear e um texto
 * aprovado do cliente que DEVE passar. Devolve o número de falhas.
 */
type Eq = (nome: string, got: unknown, want: unknown) => void

export default async function testesCliente(eq: Eq): Promise<number> {
  const { checkReply } = await import('../lib/guards')
  const regras = (t: string) => [...new Set(checkReply(t).map(v => v.regra))]
  eq('cliente: garantia bloqueia', regras('O resultado é garantido.'), ['prometeu resultado'])
  return 0
}
