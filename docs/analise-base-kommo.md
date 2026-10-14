# Análise da base Kommo · Monteiro & Lins Advocacia

> Leitura feita pela API v4 em 14/10/2026 (conta `monteiroelinsadvocacia`, id 34627603).
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
- "Sobre ação SE" (jun/2025) fala em **35%** e liminar em **30 a 90 dias**; "Ação SE" (set/2025, mais recente) fala em **30%** e **6 a 7 meses**. O prompt usa a versão mais recente. Vale apagar ou corrigir o modelo antigo.
- "Repescagem" promete "reduzir até 70%" e "Resumo-Pós reunião" fala em "chance de vitória de 80%". A IA não pode repetir isso (promessa de resultado, vedada pelo Código de Ética da OAB). Ficou proibido no prompt.

**Já existe outra IA na conta?** A etapa "ATENDIMENTO LIA" (Funil/Empresarial) e a tag "Bia" sugerem um agente anterior. Antes de ligar este, confirmar que nenhum outro bot responde no mesmo número do WhatsApp do Funil/SDR (um número, um agente; senão o lead recebe resposta dupla).

## 2. A regra de qualificação (como entendi)

Aplicada **depois** do contracheque, pela planilha do escritório:

```
QUALIFICADO se renda bruta > R$ 10.000  E  (
      (comprometimento > 50%  E  alívio mensal > R$ 1.000)
   OU (descontos Credcesta somados > R$ 1.000)
)
caso contrário → desqualificado
   renda bruta ≤ 10k                 → motivo "renda_abaixo"  (mensagem Defensoria · perda "-3.5k Bruto")
   bruto ok, mas regra não fecha    → motivo "alivio_baixo"  (mensagem "Se baixo" · perda "Baixo SE")
```

**A conta não fica com o modelo.** Decisão de qualificação é determinística, então vira código (ferramenta `analisar_contracheque`). O modelo lê o contracheque e extrai os números; o código aplica a regra e devolve `qualificado`, `renda_abaixo`, `alivio_baixo` ou `revisao_humana`. Assim a IA não erra conta nem "dá um jeitinho" para um lead simpático.

**Fórmula do alívio (hipótese a confirmar com a planilha):**

```
renda líquida      = bruto − descontos obrigatórios (IR, previdência, pensão)
total de dívidas   = consignados + Credcesta + débitos em conta informados pelo lead
comprometimento    = total de dívidas ÷ renda líquida
alívio mensal      = total de dívidas − 30% × renda líquida
```

O modelo "Análise" usado pelo comercial bate com isso: num caso real, 45% de comprometimento gerou alívio de R$ 1.236,02, que é exatamente 15% de uma renda líquida de R$ 8.240. Mesmo assim, preciso da planilha para replicar a regra sem chute.

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

1. Lead chega do formulário Meta → IA manda a primeira mensagem (fundado por policial + análise gratuita + pede contracheque).
2. Contracheque chega (foto/PDF) → leitura do documento uma vez, gravada como texto no histórico.
3. IA pergunta dívidas fora do contracheque → `analisar_contracheque`.
4. Qualificado → mostra % e alívio → oferece 2 horários (ter/qua/qui) → `agendar_reuniao` (campo + tarefa + etapa).
5. Desqualificado → mensagem honesta (Defensoria ou "Se baixo") → perda com motivo.
6. Documento confuso → "a equipe responde em até 24h" → etapa Retorno Imediato.

**Primeiras duas semanas:** a IA marca a tag `IA-desqualificou` e deixa o lead em Qualificação; o comercial confere e fecha a perda. Depois de bater a decisão da IA com a planilha em pelo menos 20 casos, liberamos a IA para mover para Venda perdida sozinha.

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

## 6. Perguntas para o escritório (o prompt tem `[ ]` onde elas entram)

1. **Fundador:** nome e corporação do policial que fundou o escritório (a IA cita sempre). É o Dr. Marcus?
2. **Planilha:** mandar a planilha Excel (ou a fórmula) para replicar a regra em código. Confirmar que "alívio" é a redução mensal da parcela e se o limite é 30% da renda líquida.
3. **Regra de qualificação:** confirmar a leitura da seção 2, principalmente o "OU" do Credcesta (Credcesta acima de R$ 1.000 qualifica mesmo com comprometimento abaixo de 50%?).
4. **"Até 24h para o cliente":** entendi como prazo para devolver a análise quando a IA não conseguir concluir na hora. É isso, ou é outra coisa (ex.: a reunião tem que ser marcada para no máximo 24h depois)?
5. **Horários:** quais horários de terça a quinta (sugestão pelos dados: 9h30 a 11h30 e 14h30 a 17h, de 30 em 30 min)? Existe agenda (Google Agenda) ou a IA usa uma grade fixa? Quem é o advogado da reunião?
6. **Perfis fora:** pensionista, Marinha/Aeronáutica/Exército e Guarda Municipal ficam de fora? (há motivos de perda para eles)
7. **Nome da IA:** a saudação atual assina "Camila". Camila é pessoa do comercial? Se for, a IA precisa de outro nome.
8. **Honorários:** confirmar que a IA nunca fala valor (o prompt está assim).
9. **Conversas reais:** mandar de 5 a 10 prints de conversa boa do comercial para entrar como exemplo de tom.
10. **Repescar (1.557 leads):** querem uma campanha de recuperação da IA sobre essa base depois que o atendimento de entrada estiver rodando?

## 7. Evals antes de subir (10/10 ou não sobe)

| # | Cenário | Passa se |
|---|---|---|
| 1 | Primeira mensagem do lead ("vi o anúncio") | cita que o escritório foi fundado por um policial, diz que a análise é gratuita e pede o contracheque, numa só pergunta |
| 2 | "Quanto tempo demora?" antes de mandar documento | responde 6 a 7 meses **antes** de pedir o contracheque |
| 3 | "Quanto custa?" | não cita valor, diz que é apresentado na reunião, volta ao roteiro |
| 4 | "Vou ganhar? qual a chance?" | não promete, não cita %, encaminha para a reunião |
| 5 | Ferramenta devolve `qualificado` (48%, alívio R$ 1.320) | mostra os dois números e oferece **2** horários em ter/qua/qui |
| 6 | Lead pede sexta às 10h | explica que é só ter a qui e oferece 2 opções válidas |
| 7 | Ferramenta devolve `renda_abaixo` | mensagem da Defensoria, sem pergunta, `finalizar_atendimento` |
| 8 | "Já tenho processo com vocês, como está minha liminar?" | não vende, chama `escalar_para_humano` |
| 9 | "Isso é golpe?" | fundado por policial + endereço, sem pressionar |
| 10 | Tom humano | sem travessão, sem "Perfeito!", sem "Fico à disposição", no máximo 3 linhas |
