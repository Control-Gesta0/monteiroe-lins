// Confere o código contra a planilha do escritório recalculada pelo LibreOffice.
// Regenerar o esperado: ver docs/analise-base-kommo.md, seção "Como provar a réplica da planilha".
// Rodar: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analisarContracheque, calcularTotais, classificar, PARAMETROS, type Rubrica } from '../lib/analise-contracheque.ts';

type Linha = [string, 'P' | 'D', number, string?];
const cenarios: Record<string, Linha[]> = JSON.parse(readFileSync(new URL('./fixtures/cenarios.json', import.meta.url), 'utf8'));
const esperado = JSON.parse(readFileSync(new URL('./fixtures/planilha-esperado.json', import.meta.url), 'utf8'));
const rubricas = (linhas: Linha[], comManual = true): Rubrica[] =>
  linhas.map(([descricao, tipo, valor, manual]) => ({ descricao, tipo, valor, ...(comManual && manual ? { classificacaoManual: manual as Rubrica['classificacaoManual'] } : {}) }));

for (const [nome, linhas] of Object.entries(cenarios)) {
  test(`bate com a planilha: ${nome}`, () => {
    const r = rubricas(linhas);
    assert.deepEqual(r.map(classificar), esperado[nome].classes);
    const t = calcularTotais(r);
    for (const campo of Object.keys(t) as (keyof typeof t)[])
      assert.ok(Math.abs(t[campo] - esperado[nome][campo]) < 0.005, `${campo}: código ${t[campo]} × planilha ${esperado[nome][campo]}`);
  });
}

const decisao = (nome: string, comManual = true) => analisarContracheque(rubricas(cenarios[nome], comManual)).decisao;

test('decisões da regra do escritório', () => {
  assert.equal(decisao('1_qualifica_comprometimento'), 'qualificado');
  assert.equal(decisao('2_renda_abaixo'), 'renda_abaixo');
  assert.equal(decisao('3_qualifica_credcesta_manual'), 'qualificado');
  assert.equal(decisao('4_alivio_baixo'), 'alivio_baixo');
  assert.equal(decisao('7_tudo_dentro_margem'), 'alivio_baixo');
});

test('Credcesta é reconhecido sem classificação manual', () => {
  assert.equal(decisao('3_qualifica_credcesta_manual', false), 'qualificado');
});

test('rubrica não reconhecida que pode virar o jogo vai para revisão humana', () => {
  const base: Rubrica[] = [
    { descricao: 'SOLDO', tipo: 'P', valor: 12000 },
    { descricao: 'IMP RENDA', tipo: 'D', valor: 2000 },
    { descricao: 'EMPREST BRADESCO', tipo: 'D', valor: 4500 },
  ];
  assert.equal(analisarContracheque(base).decisao, 'alivio_baixo'); // 45%, abaixo de 50%
  const comDesconhecida = [...base, { descricao: 'DESC DIVERSOS', tipo: 'D' as const, valor: 900 }];
  assert.equal(analisarContracheque(comDesconhecida).decisao, 'revisao_humana');
});

test('limites são estritos (maior que, não maior ou igual)', () => {
  const r: Rubrica[] = [
    { descricao: 'SOLDO', tipo: 'P', valor: 10000 },
    { descricao: 'CREDCESTA', tipo: 'D', valor: 3000 },
  ];
  assert.equal(analisarContracheque(r).decisao, 'renda_abaixo');
  const r2: Rubrica[] = [{ descricao: 'SOLDO', tipo: 'P', valor: 10001 }, { descricao: 'CREDCESTA', tipo: 'D', valor: 1000 }];
  assert.equal(analisarContracheque(r2).decisao, 'alivio_baixo');
});

test('contracheque sem tipo ou sem provento vai para revisão humana', () => {
  assert.equal(analisarContracheque([{ descricao: 'SOLDO', tipo: '', valor: 9000 }]).decisao, 'revisao_humana');
  assert.equal(analisarContracheque([{ descricao: 'EMPREST', tipo: 'D', valor: 900 }]).decisao, 'revisao_humana');
});

test('tese configurável muda a redução citada', () => {
  const r = rubricas(cenarios['6_tese_B_diferente']);
  const a = analisarContracheque(r, { ...PARAMETROS, tese: 'A' }).reducaoMensal;
  const b = analisarContracheque(r, { ...PARAMETROS, tese: 'B' }).reducaoMensal;
  assert.ok(b >= a);
});
