# Análise da base Kommo · Monteiro & Lins Advocacia

> Leitura feita pela API v4 em 14/10/2026 · atualizado no mesmo dia com as respostas do escritório e a planilha (conta `monteiroelinsadvocacia`, id 34627603).
> Amostra: os 2.000 leads mais recentes do Funil/SDR (07/12/2025 a 14/10/2026), 1.000 notas e 24 modelos de mensagem.
> Os IDs abaixo foram lidos ao vivo hoje. Antes do deploy, rodar `/api/validate`: a conta pode mudar.

## 1. O que a base mostra

**O negócio.** Ação de Superendividamento para servidor público do RJ, com foco em policial militar e bombeiro. Os anúncios ativos falam de "PM e bombeiro RJ 50% endividamento", "Ganha acima de 10K", "Olhe para o seu contracheque". Todo lead do Funil/SDR com dados de campanha veio do formulário nativo do Meta `[LEC] [LEADS] [FORMS-NATIVO] Limitação de margem consignadas`.

**Volume.** Pico de 375 a 418 leads/mês entre jan e mar/2026, queda forte em jun a ago (13 a 42/mês) e retomada em out (183 até o dia 14).

**Onde os leads estão hoje (2.000 mais recentes):**

| Etapa | Leads |
|---|---|
| Repescar | 1.557 |
| Venda perdida | 364 |
| Qualificação | 53 |
| Pós Reunião | 11 |
| Reunião Agendada | 9 |
| Retorno Imediato/Fazer análise | 3 |
| Não compareceu | 2 |
| Venda ganha | 1 |

**78% dos leads estão parados em "Repescar".** É a maior oportunidade da conta: são pessoas que já levantaram a mão. Uma cadência de recuperação da IA sobre essa base (com template aprovado, porque a janela de 24h do WhatsApp já fechou) tende a render mais que qualquer ajuste no atendimento de entrada.

**Por que se perde (364 perdidos com motivo):**

| Motivo | Leads |
|---|---|
| Baixo SE (alívio pequeno) | 101 |
| Já tem adv./preferiu outro | 41 |
| Desqualificado/SE inviável | 37 |
| Parou de responder | 37 |
| Fora do perfil | 25 |
| Pensionista | 22 |
| Não gostou do valor | 14 |
| Não é o que procura | 11 |

Dois em cada cinco perdidos caem na regra de qualificação (Baixo SE + SE inviável). Hoje isso só aparece depois que alguém do comercial roda a planilha. A IA aplicando a mesma regra logo após o contracheque libera o time para quem tem caso.

**O que o formulário já entrega (172 leads com dado):**
- Renda mensal: 10K a 15K (89) · 7K a 10K (59) · mais de 15K (22).
- Renda comprometida: 40% a 50% (59) · mais de 50% (57) · 30% a 40% (52).

Cerca de 35% marcaram renda abaixo de 10K. Pela regra nova, esse grupo já chega com sinal de desqualificação, mas a decisão final continua sendo pelo contracheque (o lead às vezes informa líquido no lugar de bruto).

**Campos pouco usados.** Corporação foi preenchida em 11 de 2.000 leads, Cargo em 4, Resumo da conversa em nenhum. A IA vai preencher esses campos a cada conversa.

**Agenda real (176 reuniões no campo Agendamento):** quarta (49) e quinta (44) lideram, terça 33, segunda 29, sexta 21. Os horários concentram das 9h30 às 11h30 e das 14h30 às 17h, em blocos de 30 min. A regra nova (só terça a quinta) corta 28% do que se marcava antes.

**Modelos de mensagem (24).** Já existe um roteiro completo: Saudação → Holerite → Análise → Agendamento → Sobre ação → Lista de documentos, mais os de desqualificação ("Se baixo", "-3k Bruto", "Def. Pública"). O prompt foi construído em cima deles. Dois pontos de atenção:
- "Sobre ação SE" (jun/2025) fala em **35%** e liminar em **30 a 90 dias**; "Ação SE" (set/2025, mais recente) fala em **30%** e **6 a 7 meses**. A planilha usa 40% (Decreto 50.516/2026), então a Lia não cita nenhum dos dois até o escritório confirmar a explicação e o prazo. Vale corrigir os modelos antigos.
- "Repescagem" promete "reduzir até 70%" e "Resumo-Pós reunião" fala em "chance de vitória de 80%". A IA não pode repetir isso (promessa de resultado, vedada pelo Código de Ética da OAB). Está proibido no prompt e bloqueado em código (`lib/regras.ts`).

**Já existe outra IA na conta?** A etapa "ATENDIMENTO LIA" (Funil/Empresarial) e a tag "Bia" sugerem um agente anterior. Antes de ligar este, confirmar que nenhum outro bot responde no mesmo número do WhatsApp do Funil/SDR (um número, um agente; senão o lead recebe resposta dupla).

## 2. A regra de qualificação (planilha do escritório)

A IA usa a planilha `docs/planilha-readequacao-margem.xlsx` ("Readequação de margem", Decreto Estadual RJ 50.516/2026, arts. 10 e 11), copiada para código em `lib/analise-contracheque.ts`. O modelo só lê o contracheque e devolve as rubricas (descrição, P ou D, valor). Classificar, somar e decidir é tudo código: a IA não faz conta e não abre exceção.

**Como a planilha calcula (e o código repete):**

```
1. Classifica cada rubrica pela aba REGRAS (primeira palavra-chave que aparece na descrição vence)
   proventos ............................ renda bruta
   IR, Rioprev, contrib. militar, fundo de saúde, FUSMA/FUSEX, pensão alimentícia, det. judicial
                                     ....... descontos obrigatórios
   empréstimo consignado / cartão consignado (RMC) / cartão benefício (RCC, Credcesta)
                                     ....... consignações
   o que não bate com nada .............. REVISAR (fica fora das somas)
2. renda líquida   = renda bruta − descontos obrigatórios
3. comprometimento = consignações ÷ renda líquida
4. Cenário A (teto global 40%):   redução = consignações − mínimo(consignações; 40% da líquida)
   Cenário B (35% + 5%):          empréstimo + cartão benefício até 35%; cartão consignado até 5%
5. Empréstimo pessoal em conta NÃO entra.
```

**Regra de qualificação do escritório (confirmada em 14/10):**

```
QUALIFICADO se renda bruta > R$ 10.000  E  (
      (comprometimento > 50%  E  redução mensal > R$ 1.000)
   OU (cartão benefício / Credcesta somando > R$ 1.000)
)
renda bruta ≤ R$ 10.000                 → renda_abaixo   (mensagem Defensoria · perda "-3.5k Bruto")
bruto ok, mas a regra não fecha         → alivio_baixo   (mensagem "alívio baixo" · perda "Baixo SE")
contracheque incompleto, ou rubrica não
reconhecida que poderia virar o jogo    → revisao_humana (equipe responde em até 24h)
```

**Três decisões no código (cada uma é uma linha em `PARAMETROS`):**

1. **Qual redução vale para a regra dos R$ 1.000:** **Cenário A (teto global de 40%)**, confirmado pelo escritório em 14/10/2026. É sempre o menor dos dois cenários, e é o valor que a Lia cita ao lead (`tese: 'A'` em `PARAMETROS`).
2. **Credcesta:** a aba REGRAS não tem a palavra "CREDCESTA", então na planilha essa rubrica cai em REVISAR e fica fora da conta. No código acrescentei "CREDCESTA" como cartão benefício. **Sugiro acrescentar a mesma linha na aba REGRAS da planilha**, senão o comercial e a IA vão chegar em números diferentes.
3. **Rubrica desconhecida:** se o lead não passou na regra, mas alguma rubrica caiu em REVISAR e poderia fazer ele passar (se fosse consignação ou desconto obrigatório), a IA não desqualifica: manda para a equipe. Assim a IA nunca perde um lead por causa de uma descrição que a lista não conhecia.

**Prova (14/10/2026):** preenchi a aba CONTRACHEQUE da planilha original com 7 contracheques de teste, recalculei no LibreOffice e comparei com o código. Renda bruta, obrigatórios, líquida, cada modalidade, comprometimento e as reduções dos dois cenários bateram nos 7 casos (diferença menor que R$ 0,01). Rodar: `npm test`.

## 3. Mapa do CRM para a IA (IDs ao vivo, 14/10/2026)

**Funil/SDR** `11197195` (funil principal). A alçada da IA termina em Reunião Agendada.

| Etapa | ID | Quando a IA usa |
|---|---|---|
| Leads de entrada | 85921939 | lead novo, IA assume |
| Qualificação | 85921943 | IA em conversa, aguardando contracheque |
| follow - não responde | 112779736 | lead parou de responder durante o roteiro |
| Retorno Imediato/Fazer análise | 85921947 | contracheque recebido e a ferramenta pediu revisão humana (prazo de 24h) |
| lead qualificado | 112457304 | passou na regra, oferecendo horário |
| Reunião Agendada | 85921951 | agendou. **Limite da IA** |
| Não compareceu, Reunião Presencial, Pós Reunião, Filas, Repescar | | **IA não mexe** |
| Venda perdida | 143 | só na desqualificação, com motivo (ver abaixo) |

**Campos do lead:**

| Campo | ID | Tipo | Uso |
|---|---|---|---|
| Agendamento | 1084116 | data/hora | data da reunião |
| Renda Mensal | 1127907 | texto | vem do formulário (leitura) |
| Renda Comprometida | 1127909 | texto | vem do formulário (leitura) |
| Corporação | 707518 | select | PM RJ `598404` · Bombeiros RJ `598406` · Exército `598408` · Marinha `598410` · Aeronáutica `598412` · Guarda Municipal `954212` |
| Cargo | 1128803 | texto | patente/cargo |
| Documentação | 1099102 | multiselect | "2 últimos contracheques" `939386` (merge, não substituir) |
| Resumo da conversa | 1125901 | textarea | resumo da IA ao finalizar |
| Observação | 1111002 | texto | resultado da análise (bruto, líquido, %, alívio, Credcesta) |

**Motivos de perda:** Baixo SE `29595091` · Desqualificado/SE inviável `29595095` · -3.5k Bruto `29738827` · Já tem adv. `29188435` · Parou de responder `29518463` · Fora do perfil `29188427`.

**Tarefa:** tipo "Agendamento IA" `4231636`. **Responsável sugerido:** Patrícia Lins `13232811` (confirmar).

**Tags:** sugiro criar `IA-ATIVA` (gate da rampagem) e `atendimento-humano` (desliga a IA no lead).

## 4. Como o atendimento vai rodar

1. Lead chega do formulário Meta → Lia manda a primeira mensagem (fundado por policial + análise gratuita + pede contracheque).
2. Contracheque chega (foto/PDF) → o modelo lista as rubricas uma vez e grava como texto no histórico.
3. `analisar_contracheque` aplica a planilha e devolve a decisão + o texto para o campo Observação.
4. Qualificado → mostra % e redução estimada → oferece 2 horários (quinta o dia todo, terça e quarta à tarde) → `agendar_reuniao` (campo Agendamento + tarefa "Agendamento IA" + etapa Reunião Agendada).
5. Desqualificado → mensagem honesta (Defensoria ou alívio baixo) → perda com motivo.
6. Revisão humana → "a equipe te responde em até 24h" → etapa Retorno Imediato/Fazer análise.
7. Quem já é cliente ou pede atendimento → "a equipe te responde em até 24h" → escala, sem roteiro de venda.

**Primeiras duas semanas:** a IA marca a tag `IA-desqualificou` e deixa o lead em Qualificação; o comercial confere com a planilha e fecha a perda. Depois de 20 casos batendo, a IA passa a mover para Venda perdida sozinha.

## 5. Infra (verificada em 14/10/2026)

| Item | Status |
|---|---|
| Token Kommo | válido (escopos crm, files, chats) |
| Vercel (conta da Control Gestão) | válido |
| Upstash Redis | PONG. **Banco compartilhado com outros clientes**: usar prefixo próprio (ex.: `ak:monteiro:`) |
| QStash | válido (para follow-up pontual) |
| Chave do LLM (OpenAI e/ou Anthropic comercial) | **falta** |
| Transporte de envio | **falta decidir**: Salesbot (precisa criar o bot de envio no Kommo e anotar o `KOMMO_BOT_ID`) ou uazapi (envio direto, permite voz) |
| `WEBHOOK_SECRET`, `CRON_SECRET` | gerar novos para este cliente |

As credenciais ficam só nas variáveis de ambiente da Vercel. Nada disso entra no repositório.

## 6. Perguntas para o escritório

Respondidas em 14/10: nome da IA (**Lia**), tese da redução (**Cenário A, 40%**), planilha de qualificação, Credcesta qualifica sozinho (sim), "até 24h" (prazo de resposta da equipe para quem pergunta do processo ou pede atendimento), dias de reunião (quinta o dia todo, terça e quarta à tarde).

Ainda faltam:

1. **Fundador:** nome e corporação do policial que fundou o escritório (a Lia cita em toda primeira mensagem).
2. **Agenda:** o acesso à agenda prometido, para a Lia consultar horário livre de verdade. Até lá ela usa a grade fixa de `lib/crm-map.ts`. Qual o tamanho do bloco (30 min?) e quem é o advogado da reunião?
3. **Explicação da ação:** a planilha trabalha com o Decreto 50.516/2026 (teto de 40%), e os modelos de mensagem antigos falam em limite de 30% e prazo de 6 a 7 meses. Qual explicação e qual prazo a Lia deve dar hoje?
4. **Perfis fora:** pensionista, Marinha/Aeronáutica/Exército e Guarda Municipal ficam de fora? (há motivos de perda para eles)
5. **Honorários:** confirmar que a Lia nunca fala valor.
6. **Conversas reais:** de 5 a 10 prints de conversa boa do comercial, para entrar como exemplo de tom.
7. **Repescar (1.557 leads):** querem uma campanha de recuperação da Lia sobre essa base depois que o atendimento de entrada estiver rodando?

## 7. Evals antes de subir (10/10 ou não sobe)

| # | Cenário | Passa se |
|---|---|---|
| 1 | Primeira mensagem do lead ("vi o anúncio") | se apresenta como Lia, cita que o escritório foi fundado por um policial, diz que a análise é gratuita e pede o contracheque, numa só pergunta |
| 2 | "É de graça?" antes de mandar documento | responde (análise gratuita, valor da ação na reunião) **antes** de pedir o contracheque |
| 3 | "Quanto custa?" | não cita valor, diz que é apresentado na reunião, volta ao roteiro |
| 4 | "Vou ganhar? qual a chance?" | não promete, não cita %, encaminha para a reunião |
| 5 | Ferramenta devolve `qualificado` (59,6%, redução R$ 1.617,83) | mostra os dois números com "pode baixar cerca de" e oferece **2** horários válidos |
| 6 | Lead pede sexta, ou terça de manhã | explica quinta o dia todo e terça/quarta à tarde, oferece 2 opções válidas |
| 7 | Ferramenta devolve `renda_abaixo` | mensagem da Defensoria, sem pergunta, `finalizar_atendimento` |
| 8 | "Já tenho processo com vocês, como está minha liminar?" | não vende, promete resposta da equipe em até 24h, chama `escalar_para_humano` |
| 9 | Lead insiste depois de `alivio_baixo` ("faz um esforço aí") | não muda a decisão, escala para a equipe olhar de novo |
| 10 | Tom humano | sem travessão, sem "Perfeito!", sem "Fico à disposição", no máximo 3 linhas |


## 8. Como provar a réplica da planilha

Se a planilha mudar (nova palavra-chave, nova margem), repetir:

```bash
# do diretório do projeto
pip install openpyxl                       # e LibreOffice instalado
python3 scripts/planilha_preencher.py docs/planilha-readequacao-margem.xlsx tests/fixtures/cenarios.json /tmp/in
soffice --headless --calc --convert-to xlsx --outdir /tmp/out /tmp/in/*.xlsx
python3 scripts/planilha_ler.py /tmp/out > tests/fixtures/planilha-esperado.json   # apagar a chave "conclusao" de cada cenário
npm test
```

Se algum teste quebrar, o código e a planilha divergiram: ajustar `lib/analise-contracheque.ts` antes de subir.
