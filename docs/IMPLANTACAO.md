# Lia · implantação no Kommo da Monteiro & Lins

> Estado em 14/10/2026: código montado e testado localmente. **Ainda não está no ar.**
> Provas feitas: `tsc` limpo · `npm test` com 112 verificações (réplica da planilha, agenda, roteamento, travas e ferramentas) · `/api/validate` rodado contra o Kommo vivo, com todos os IDs conferidos.
> Ainda NÃO provado: evals com o modelo (falta a chave da OpenAI), E2E num WhatsApp real.

## Como a Lia funciona

```
Lead do formulário Meta entra em "Leads de entrada"
  → Digital Pipeline: põe a tag "lia" e dispara o template de boas-vindas ("... Aqui é a Lia, assistente virtual ...")
Lead responde no WhatsApp → webhook add_message → /api/inbound
  → áudio vira texto; foto/PDF do contracheque vira linhas "RUBRICA | ..." (uma vez, na entrada)
  → gate: só atende lead com a tag "lia" e sem "atendimento-humano"; humano falou nas últimas 6h? a Lia recua
  → roteador em código:
       lead fora do Funil/SDR, depois da reunião ou falando do "meu processo" → porta ATENDIMENTO
           mensagem fixa "a equipe responde em até 24 horas" + tarefa Follow-up com prazo de 24h + a Lia sai
       o resto → porta SUPERENDIVIDAMENTO (modelo + ferramentas)
  → analisar_contracheque: a planilha do escritório roda em código (lib/analise-contracheque.ts)
       qualificado   → etapa "lead qualificado" → consultar_horarios (2 opções) → agendar_reuniao
                       campo Agendamento + tarefa "Agendamento IA" + etapa "Reunião Agendada" + confirmação fixa
       renda_abaixo / alivio_baixo → mensagem aprovada (Defensoria / alívio baixo) + tag "lia-desqualificou"
       revisao_humana → etapa "Retorno Imediato/Fazer analise" + tarefa 24h + mensagem de 24h
  → travas de texto (OAB, teto de 40%, travessão, uma pergunta) → resposta no campo do card → Salesbot envia
```

O que é regra do escritório está em código, não no prompt: a conta da planilha, a decisão de qualificar, a agenda (quinta o dia todo, terça e quarta à tarde), as etapas que a Lia pode mover, as mensagens de desqualificação e de confirmação, o prazo de 24h.

## O que mudou em relação ao template da Control Gestão

| Arquivo | Mudança |
|---|---|
| `lib/analise-contracheque.ts` (novo) | Réplica da planilha "Readequação de margem" + regra de qualificação |
| `lib/contracheque-texto.ts` (novo) | Lê a transcrição do contracheque no histórico (junta páginas, pega a competência mais recente) |
| `lib/agenda.ts` (novo) | Grade de horários, ocupação, duas opções |
| `lib/tools.ts` | Ferramentas `analisar_contracheque`, `consultar_horarios`, `agendar_reuniao`; tarefa de 24h ao escalar; `textoFinal` |
| `lib/llm.ts` | Texto aprovado sai pelo código, sem o modelo reescrever; contexto mostra a análise |
| `lib/router.ts` | `menu.portaPadrao`: sem menu, o lead vai direto para o SDR |
| `lib/agent.ts` | Lead fora do Funil/SDR vai para a porta de atendimento; 1ª resposta move para Qualificação |
| `lib/media.ts` | Tamanho da leitura configurável (contracheque inteiro) |
| `lib/kommo.ts`, `lib/port.ts` | Tarefa, reuniões ocupadas, perda com motivo, reserva de horário no Redis |
| `api/inbound.ts` | Template de boas-vindas não pausa a IA |
| `api/validate.ts` | Confere etapas, campos, tipos de tarefa e motivos de perda da Lia |
| `scripts/test-guards.ts` | Falha do teste do cliente agora quebra o `npm test` (antes era engolida) |

## Checklist para ir ao ar

Itens com 🙋 precisam de alguém do escritório ou da Control Gestão no Kommo/Meta.

1. 🙋 **Chave da OpenAI** (conta da Control Gestão ou do escritório).
2. **Rodar os evals:** `EVAL_REPS=3 npm run evals` → 10 cenários aprovados nas 3 rodadas.
3. 🙋 **Fundador:** nome e corporação para o `prompts/nucleo.md` (a Lia cita na primeira mensagem). Rodar os evals de novo depois.
4. ✅ **Campo de resposta:** "Resposta IA (Lia)" criado no lead pela API em 14/10/2026 (ID `1128813`, textarea) e já está em `CRM_MAP.respostaFieldId`.
5. 🙋 **Salesbot de envio** (só pela tela do Kommo): um bot com um passo "Enviar mensagem" cujo texto é o campo do lead "Resposta IA (Lia)". Anotar o ID do bot em `KOMMO_BOT_ID`.
6. 🙋 **Template de boas-vindas no WhatsApp (Meta)**, para lead de formulário que ainda não mandou mensagem. Sugestão (o trecho "Aqui é a Lia, assistente virtual" precisa ficar igual, é como o sistema reconhece que não foi uma pessoa):
   > Oi, {{1}}! Aqui é a Lia, assistente virtual da Monteiro & Lins Advocacia. Recebemos o seu cadastro sobre os descontos de consignado. O escritório foi fundado por um policial e a análise do contracheque é gratuita. Pode me mandar uma foto ou PDF do seu último contracheque?
7. 🙋 **Digital Pipeline** em "Leads de entrada" do Funil/SDR: pôr a tag `lia` e enviar o template acima. Na rampagem, só para os leads escolhidos.
8. **Vercel:** projeto `lia-monteiro-lins`, envs do `.env.local.example` (`WEBHOOK_SECRET` novo, `REDIS_PREFIX=ak-monteiro-lins:`), `vercel deploy --prod`.
9. **Validar no ar:** `GET /api/inbound` (saúde) e `GET /api/validate?secret=...` → `ok: true`.
10. **Webhook:** `npx tsx scripts/create-webhook.ts` lista; confirmar com o escritório; `--criar`.
11. **E2E com número real:** lead de teste com a tag `lia` e o ID em `TEST_LEAD_IDS`. Mandar contracheque de teste, conferir mensagem no celular, card (nota da análise, Agendamento, tarefa, etapa) e `/api/executions`. `reset` recomeça.
12. **Rampagem:** 1 lead → 10 → todos. Nas duas primeiras semanas, desqualificados ficam em Qualificação com a tag `lia-desqualificou` para o comercial conferir. Depois de 20 casos batendo com a planilha: `sdr.desqualificacao.moverParaPerdido = true`.

## Pontos de atenção

- **Agenda:** enquanto a agenda real não é ligada, a Lia usa a grade fixa do `crm-map.ts` e considera ocupado o horário de qualquer lead em Reunião Agendada/Presencial com o campo Agendamento. Reunião marcada fora do Kommo não aparece para ela.
- **Quem já é cliente:** só recebe a mensagem de 24h se o lead dele tiver a tag `lia`. Para atender os funis de clientes, a tag precisa entrar por automação nesses funis também (decisão do escritório).
- **Leads em Repescar (1.557):** estão na lista de etapas protegidas, então a Lia trata como atendimento. Uma campanha de recuperação precisa de porta própria.
- **Planilha:** se o escritório mudar a planilha, refazer a prova de `docs/analise-base-kommo.md` seção 8 e rodar `npm test`.
