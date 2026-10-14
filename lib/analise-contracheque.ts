// Análise do contracheque · réplica em código da planilha do escritório
// ("READEQUAÇÃO DE MARGEM", abas CONTRACHEQUE, REGRAS, SE 40%, SE 35-5 e COMPARATIVO).
//
// O modelo só lê o contracheque e devolve as rubricas (descrição, tipo P/D, valor).
// Classificação, contas e decisão de qualificação ficam aqui, em código, para a IA
// não errar conta nem abrir exceção. Base legal citada na planilha:
// Decreto Estadual (RJ) nº 50.516/2026, arts. 10 e 11.

export type Classificacao =
  | 'PROVENTO'
  | 'DESCONTO OBRIGATÓRIO'
  | 'EMPRÉSTIMO CONSIGNADO'
  | 'CARTÃO CONSIGNADO'
  | 'CARTÃO BENEFÍCIO'
  | 'EMPRÉSTIMO PESSOAL'
  | 'NÃO CONSIDERAR'
  | 'REVISAR'
  | 'INFORMAR TIPO';

export interface Rubrica {
  codigo?: string;
  descricao: string;
  tipo: 'P' | 'D' | '';
  valor: number;
  /** Equivale à coluna F da planilha: quando preenchida, prevalece sobre a automática. */
  classificacaoManual?: Classificacao;
}

export type Decisao = 'qualificado' | 'renda_abaixo' | 'alivio_baixo' | 'revisao_humana';
export type Tese = 'A' | 'B' | 'melhor';

export const PARAMETROS = {
  // Margens (células amarelas da planilha)
  tetoGlobal: 0.4, // SE 40%!H24 · art. 10, caput
  margemEmprestimoEBeneficio: 0.35, // SE 35-5!J5 · art. 10, I
  margemCartaoConsignado: 0.05, // SE 35-5!J6 · art. 10, II
  // Regra de qualificação definida pelo escritório
  rendaBrutaMinima: 10_000, // renda bruta precisa ser MAIOR que isso
  comprometimentoMinimo: 0.5, // e comprometimento MAIOR que 50%
  reducaoMinima: 1_000, // e redução mensal MAIOR que R$ 1.000
  cartaoBeneficioMinimo: 1_000, // OU cartão benefício (Credcesta) somando MAIS que R$ 1.000
  // Qual redução vale para a regra e para a mensagem ao lead.
  // 'A' = teto global de 40% (a menor das duas, conservadora). 'B' = 35% + 5%. 'melhor' = a maior.
  tese: 'A' as Tese,
};

// Aba REGRAS, na mesma ordem (a primeira palavra-chave encontrada na descrição vence).
// As duas primeiras linhas (Credcesta) NÃO existem na planilha: foram acrescentadas porque
// a rubrica "CREDCESTA" não bate com nenhuma palavra da lista e cairia em REVISAR.
export const REGRAS: ReadonlyArray<readonly [string, Classificacao]> = [
  ['CREDCESTA', 'CARTÃO BENEFÍCIO'],
  ['CRED CESTA', 'CARTÃO BENEFÍCIO'],
  ['CARTAO BENEF', 'CARTÃO BENEFÍCIO'],
  ['CARTÃO BENEF', 'CARTÃO BENEFÍCIO'],
  ['CART BENEF', 'CARTÃO BENEFÍCIO'],
  ['CART. BENEF', 'CARTÃO BENEFÍCIO'],
  ['CARTAO-BENEF', 'CARTÃO BENEFÍCIO'],
  ['BENEFICIO CART', 'CARTÃO BENEFÍCIO'],
  ['BENEFÍCIO CART', 'CARTÃO BENEFÍCIO'],
  ['RCC', 'CARTÃO BENEFÍCIO'],
  ['RMC', 'CARTÃO CONSIGNADO'],
  ['CARTAO', 'CARTÃO CONSIGNADO'],
  ['CARTÃO', 'CARTÃO CONSIGNADO'],
  ['CART CRED', 'CARTÃO CONSIGNADO'],
  ['CART. CRED', 'CARTÃO CONSIGNADO'],
  ['CRED CART', 'CARTÃO CONSIGNADO'],
  ['EMPREST', 'EMPRÉSTIMO CONSIGNADO'],
  ['EMPRÉST', 'EMPRÉSTIMO CONSIGNADO'],
  ['EMP CONSIG', 'EMPRÉSTIMO CONSIGNADO'],
  ['EMP. CONSIG', 'EMPRÉSTIMO CONSIGNADO'],
  ['CONSIG', 'EMPRÉSTIMO CONSIGNADO'],
  ['FINANC', 'EMPRÉSTIMO CONSIGNADO'],
  ['BRADESCO', 'EMPRÉSTIMO CONSIGNADO'],
  ['SANTANDER', 'EMPRÉSTIMO CONSIGNADO'],
  ['ITAU', 'EMPRÉSTIMO CONSIGNADO'],
  ['ITAÚ', 'EMPRÉSTIMO CONSIGNADO'],
  ['BMG', 'EMPRÉSTIMO CONSIGNADO'],
  ['BANCO PAN', 'EMPRÉSTIMO CONSIGNADO'],
  ['BCO PAN', 'EMPRÉSTIMO CONSIGNADO'],
  ['DAYCOVAL', 'EMPRÉSTIMO CONSIGNADO'],
  ['MASTER', 'EMPRÉSTIMO CONSIGNADO'],
  ['CAIXA', 'EMPRÉSTIMO CONSIGNADO'],
  ['CEF', 'EMPRÉSTIMO CONSIGNADO'],
  ['BANRISUL', 'EMPRÉSTIMO CONSIGNADO'],
  ['SAFRA', 'EMPRÉSTIMO CONSIGNADO'],
  ['MERCANTIL', 'EMPRÉSTIMO CONSIGNADO'],
  ['CREFISA', 'EMPRÉSTIMO CONSIGNADO'],
  ['PKL', 'EMPRÉSTIMO CONSIGNADO'],
  ['CAPEMISA', 'EMPRÉSTIMO CONSIGNADO'],
  ['POUPEX', 'EMPRÉSTIMO CONSIGNADO'],
  ['BANCO DO BRASIL', 'EMPRÉSTIMO CONSIGNADO'],
  ['BCO BRASIL', 'EMPRÉSTIMO CONSIGNADO'],
  ['BCO DO BRASIL', 'EMPRÉSTIMO CONSIGNADO'],
  ['BANCO', 'EMPRÉSTIMO CONSIGNADO'],
  ['BCO', 'EMPRÉSTIMO CONSIGNADO'],
  ['IMP RENDA', 'DESCONTO OBRIGATÓRIO'],
  ['IMP. RENDA', 'DESCONTO OBRIGATÓRIO'],
  ['IMPOSTO', 'DESCONTO OBRIGATÓRIO'],
  ['IRRF', 'DESCONTO OBRIGATÓRIO'],
  ['IRPF', 'DESCONTO OBRIGATÓRIO'],
  ['PENSAO MILIT', 'DESCONTO OBRIGATÓRIO'],
  ['PENSÃO MILIT', 'DESCONTO OBRIGATÓRIO'],
  ['PENS MILIT', 'DESCONTO OBRIGATÓRIO'],
  ['CONTR MILIT', 'DESCONTO OBRIGATÓRIO'],
  ['CONTR. MILIT', 'DESCONTO OBRIGATÓRIO'],
  ['CONTRIB MILIT', 'DESCONTO OBRIGATÓRIO'],
  ['CONTRIB. MILIT', 'DESCONTO OBRIGATÓRIO'],
  ['CONTR PREV', 'DESCONTO OBRIGATÓRIO'],
  ['CONTRIB PREV', 'DESCONTO OBRIGATÓRIO'],
  ['PREVIDEN', 'DESCONTO OBRIGATÓRIO'],
  ['RIOPREV', 'DESCONTO OBRIGATÓRIO'],
  ['PSS', 'DESCONTO OBRIGATÓRIO'],
  ['FUSMA', 'DESCONTO OBRIGATÓRIO'],
  ['FUSEX', 'DESCONTO OBRIGATÓRIO'],
  ['FUNSA', 'DESCONTO OBRIGATÓRIO'],
  ['FUNDO SAUDE', 'DESCONTO OBRIGATÓRIO'],
  ['FUNDO DE SAUDE', 'DESCONTO OBRIGATÓRIO'],
  ['FUNDO SAÚDE', 'DESCONTO OBRIGATÓRIO'],
  ['FUNSAUDE', 'DESCONTO OBRIGATÓRIO'],
  ['PENSAO ALIM', 'DESCONTO OBRIGATÓRIO'],
  ['PENSÃO ALIM', 'DESCONTO OBRIGATÓRIO'],
  ['PENS ALIM', 'DESCONTO OBRIGATÓRIO'],
  ['DET JUD', 'DESCONTO OBRIGATÓRIO'],
  ['DET. JUD', 'DESCONTO OBRIGATÓRIO'],
  ['DETERM JUD', 'DESCONTO OBRIGATÓRIO'],
];

const maiuscula = (s: string) => s.toLocaleUpperCase('pt-BR');

/** Coluna E da aba CONTRACHEQUE (SEARCH do Excel: sem diferença de maiúscula, com acento). */
export function classificarAutomatico(r: Rubrica): Classificacao {
  if (maiuscula(r.tipo) === 'P') return 'PROVENTO';
  if (!r.tipo) return 'INFORMAR TIPO';
  const desc = maiuscula(r.descricao);
  for (const [palavra, classe] of REGRAS) if (desc.includes(palavra)) return classe;
  return 'REVISAR';
}

/** Coluna G: a manual prevalece sobre a automática. */
export const classificar = (r: Rubrica): Classificacao => r.classificacaoManual ?? classificarAutomatico(r);

export interface Totais {
  rendaBruta: number;
  descontosObrigatorios: number;
  rendaLiquida: number;
  emprestimoConsignado: number;
  cartaoConsignado: number;
  cartaoBeneficio: number;
  totalConsignacoes: number;
  comprometimento: number; // fração da renda líquida (0,48 = 48%)
  reducaoTeseA: number; // teto global 40%
  reducaoTeseB: number; // 35% + 5%
}

export function calcularTotais(rubricas: Rubrica[], p = PARAMETROS): Totais {
  const soma = (c: Classificacao) =>
    rubricas.filter((r) => classificar(r) === c).reduce((s, r) => s + (Number(r.valor) || 0), 0);

  const rendaBruta = soma('PROVENTO');
  const descontosObrigatorios = soma('DESCONTO OBRIGATÓRIO');
  const rendaLiquida = rendaBruta - descontosObrigatorios;
  const emprestimoConsignado = soma('EMPRÉSTIMO CONSIGNADO');
  const cartaoConsignado = soma('CARTÃO CONSIGNADO');
  const cartaoBeneficio = soma('CARTÃO BENEFÍCIO');
  const totalConsignacoes = emprestimoConsignado + cartaoConsignado + cartaoBeneficio;
  const comprometimento = rendaLiquida === 0 ? 0 : totalConsignacoes / rendaLiquida;

  // Cenário A (COMPARATIVO!Z4 e D15): corte proporcional até o teto global.
  const fatorA = totalConsignacoes === 0 ? 1 : Math.min(1, (rendaLiquida * p.tetoGlobal) / totalConsignacoes);
  const depoisA = totalConsignacoes * fatorA;

  // Cenário B (COMPARATIVO!Z12, G12:G14): empréstimo + cartão benefício dividem 35%; cartão consignado tem 5% próprio.
  const grupo35 = emprestimoConsignado + cartaoBeneficio;
  const fator35 = grupo35 === 0 ? 1 : Math.min(1, (rendaLiquida * p.margemEmprestimoEBeneficio) / grupo35);
  const depoisB = grupo35 * fator35 + Math.min(cartaoConsignado, rendaLiquida * p.margemCartaoConsignado);

  return {
    rendaBruta,
    descontosObrigatorios,
    rendaLiquida,
    emprestimoConsignado,
    cartaoConsignado,
    cartaoBeneficio,
    totalConsignacoes,
    comprometimento,
    reducaoTeseA: totalConsignacoes - depoisA,
    reducaoTeseB: totalConsignacoes - depoisB,
  };
}

const reducaoDaTese = (t: Totais, tese: Tese) =>
  tese === 'A' ? t.reducaoTeseA : tese === 'B' ? t.reducaoTeseB : Math.max(t.reducaoTeseA, t.reducaoTeseB);

function passaNaRegra(t: Totais, p: typeof PARAMETROS): boolean {
  if (!(t.rendaBruta > p.rendaBrutaMinima)) return false;
  const porComprometimento = t.comprometimento > p.comprometimentoMinimo && reducaoDaTese(t, p.tese) > p.reducaoMinima;
  const porCartaoBeneficio = t.cartaoBeneficio > p.cartaoBeneficioMinimo;
  return porComprometimento || porCartaoBeneficio;
}

export interface ResultadoAnalise {
  decisao: Decisao;
  motivo: string;
  totais: Totais;
  /** Redução mensal pela tese configurada: é o valor que a IA pode citar ao lead. */
  reducaoMensal: number;
  rubricasARevisar: Rubrica[];
  /** Texto pronto para o campo Observação do lead no Kommo. */
  observacao: string;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (n: number) => `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

export function analisarContracheque(rubricas: Rubrica[], p = PARAMETROS): ResultadoAnalise {
  const totais = calcularTotais(rubricas, p);
  const rubricasARevisar = rubricas.filter((r) => classificar(r) === 'REVISAR');
  const semTipo = rubricas.some((r) => classificar(r) === 'INFORMAR TIPO');
  const reducaoMensal = reducaoDaTese(totais, p.tese);

  const fechar = (decisao: Decisao, motivo: string): ResultadoAnalise => ({
    decisao,
    motivo,
    totais,
    reducaoMensal,
    rubricasARevisar,
    observacao: [
      `Análise IA (${decisao}): ${motivo}`,
      `Bruto ${brl(totais.rendaBruta)} · obrigatórios ${brl(totais.descontosObrigatorios)} · líquido ${brl(totais.rendaLiquida)}`,
      `Consignações ${brl(totais.totalConsignacoes)} (${pct(totais.comprometimento)}): emp. ${brl(totais.emprestimoConsignado)} · cartão consig. ${brl(totais.cartaoConsignado)} · cartão benefício ${brl(totais.cartaoBeneficio)}`,
      `Redução/mês: tese 40% ${brl(totais.reducaoTeseA)} · tese 35+5 ${brl(totais.reducaoTeseB)}`,
      rubricasARevisar.length
        ? `A revisar: ${rubricasARevisar.map((r) => `${r.descricao} ${brl(r.valor)}`).join('; ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
  });

  if (semTipo || totais.rendaBruta <= 0 || totais.rendaLiquida <= 0)
    return fechar('revisao_humana', 'contracheque incompleto ou ilegível');

  if (!(totais.rendaBruta > p.rendaBrutaMinima))
    return fechar('renda_abaixo', `renda bruta ${brl(totais.rendaBruta)} não passa de ${brl(p.rendaBrutaMinima)}`);

  if (passaNaRegra(totais, p)) {
    const porCartao = totais.cartaoBeneficio > p.cartaoBeneficioMinimo;
    return fechar('qualificado', porCartao ? 'cartão benefício acima do mínimo' : 'comprometimento e redução acima do mínimo');
  }

  // Nunca desqualificar por causa de rubrica que a lista não reconheceu: se tratar as
  // rubricas "REVISAR" como consignação ou desconto obrigatório faria o lead passar,
  // quem decide é a equipe.
  if (rubricasARevisar.length) {
    for (const como of ['CARTÃO BENEFÍCIO', 'CARTÃO CONSIGNADO', 'DESCONTO OBRIGATÓRIO'] as const) {
      const simulado = rubricas.map((r) => (classificar(r) === 'REVISAR' ? { ...r, classificacaoManual: como } : r));
      if (passaNaRegra(calcularTotais(simulado, p), p))
        return fechar('revisao_humana', 'rubricas não reconhecidas podem mudar o resultado');
    }
  }

  return fechar('alivio_baixo', `comprometimento ${pct(totais.comprometimento)} e redução ${brl(reducaoMensal)}/mês abaixo da regra`);
}
