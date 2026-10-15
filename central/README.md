# Central de IA · Lia (Monteiro & Lins Advocacia)

Painel **Central v5** (padrão Control Gestão, `assets/central-v5/` da skill) da Lia,
a assistente virtual que analisa o contracheque e marca a reunião no Kommo.
Next.js 15, num projeto Vercel **separado** do agente (`Root Directory = central`).
Fala só com o agente (`AGENT_URL`), nunca com o Kommo direto.

| Aba | Rotas | O que faz |
|---|---|---|
| Estatísticas | `/` · `/operacao` · `/resultados` · `/configuracoes` | Visão geral, Operação (agora, passagens, histórico, funil), Resultados (resumo e funil da Lia) e Sistema. Só leitura, zero tokens |
| Teste | `/teste` | Conversa com a Lia numa porta em memória (nada vai ao Kommo); contracheques de exemplo prontos |
| Ensinar | `/ensinar` | A equipe pede em português; a IA muda o rascunho; publicar só com o exame (10 cenários) |
| Como usar | `/como-usar` | Manual vivo, lido da base publicada |

## Variáveis (Vercel, projeto da Central)

- `AGENT_URL` = `https://lia-monteiro-lins.vercel.app`
- `AGENT_SECRET` = o `CENTRAL_SECRET` do agente
- `APP_PASSWORD` = senha da equipe
- `AUTH_SECRET` = `openssl rand -hex 32`
- `CENTRAL_DEMO` vazio em produção (com `1`, mostra os dados fictícios de `lib/demo-data.json`)

Dados de demonstração: `npx tsx scripts/demo-central.ts` na raiz do agente.

## Limites conhecidos

- O diário guarda as últimas 2.000 execuções.
- Custo = só o modelo de linguagem; leitura do contracheque, áudio e infraestrutura não entram.
- O funil lê até 2.500 leads do Funil/SDR.
