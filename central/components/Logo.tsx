/* eslint-disable @next/next/no-img-element */

/**
 * Logo Control Gestão. Duas versões e o CSS escolhe pelo tema (sem piscar):
 * no escuro o azul-marinho vira quase branco para não sumir no fundo preto.
 */
export default function Logo({ altura = 30 }: { altura?: number }) {
  const largura = Math.round((altura * 684) / 160)
  return (
    <span className="inline-block" style={{ height: altura, width: largura }}>
      <img src="/logo-control-gestao.png" alt="Control Gestão" width={largura} height={altura} className="logo-claro block h-full w-auto" />
      <img src="/logo-control-gestao-dark.png" alt="Control Gestão" width={largura} height={altura} className="logo-escuro block h-full w-auto" />
    </span>
  )
}
