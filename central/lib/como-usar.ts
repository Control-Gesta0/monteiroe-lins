/**
 * Conteúdo da aba "Como usar" · Lia / Monteiro & Lins (o que muda por cliente).
 * A página (app/(painel)/como-usar) é a estrutura e liga cada etapa do fluxo aos
 * textos da base, lidos ao vivo: quando a equipe muda um texto em Ensinar, o
 * fluxo já mostra o novo. `base` são ids de ../lib/base-core.ts (ITENS).
 */

export interface Passo { titulo: string; texto: string; href: string; acao: string }

export const PASSOS: Passo[] = [
  {
    titulo: 'Acompanhe',
    texto: 'Estatísticas mostra se a Lia está bem, quantos contracheques ela analisou, quantas reuniões marcou e o que pede decisão. Em Operação › Passagens fica cada lead que ela passou para vocês, com o resumo e o link do lead no Kommo.',
    href: '/', acao: 'Abrir Estatísticas',
  },
  {
    titulo: 'Atenda o que ela passou (em até 24 horas)',
    texto: 'A Lia promete resposta da equipe em até 24 horas. No Kommo, cada passagem vira uma tarefa Follow-up com esse prazo e uma nota com o resumo: o lead já contou o caso e não precisa repetir.',
    href: '/operacao?aba=passagens', acao: 'Ver passagens',
  },
  {
    titulo: 'Teste antes de mudar',
    texto: 'Em Teste, converse como um lead. É a mesma Lia do WhatsApp, mas nada vai para o Kommo nem para a agenda. Use os contracheques de exemplo para ver a análise. Resposta errada? Clique em Corrigir embaixo dela.',
    href: '/teste', acao: 'Abrir Teste',
  },
  {
    titulo: 'Ensine',
    texto: 'Em Ensinar › Pedir mudança, escreva o que mudou (o nome do fundador, um fato novo do escritório, uma mensagem mais acolhedora), anexe um arquivo ou cole um link. Viu algo errado no WhatsApp? Em Conversas reais, clique em Corrigir.',
    href: '/ensinar', acao: 'Abrir Ensinar',
  },
  {
    titulo: 'Publique com o exame',
    texto: 'Teste o rascunho e clique em Publicar com exame: 10 conversas de teste rodam com os textos novos e só publica se todas passarem. Se não gostar, Versões anteriores › Voltar para esta.',
    href: '/ensinar', acao: 'Ir para a publicação',
  },
]

/** Quando a Lia responde (tudo junto; se faltar um, ela fica quieta). */
export const ENTRADA = [
  'o lead tem a tag lia',
  'não tem a tag atendimento-humano',
  'ninguém da equipe mandou mensagem pelo Kommo nas últimas 6 horas',
  'a Lia ainda não encerrou o atendimento (reunião marcada, desqualificado ou passado para vocês)',
]
export const ENTRADA_NOTA = 'Mensagens seguidas viram uma resposta só: ela espera uns 10 segundos. Áudio ela ouve; foto e PDF do contracheque ela lê linha por linha antes de responder.'

/** Etapa em destaque logo depois da entrada: quem já é cliente do escritório. */
export const FORA_DO_HORARIO = {
  titulo: 'Já é cliente do escritório',
  texto: 'Lead fora do Funil/SDR, depois da reunião, ou que fala do "meu processo", liminar ou audiência: a Lia não vende nada. Manda a mensagem de 24 horas, cria a tarefa para vocês e sai da conversa.',
  base: ['enc_atendimento'],
}

export const INICIO = [
  { titulo: 'Abertura', texto: 'Se apresenta como Lia, diz que o escritório foi fundado por um policial e que a análise é gratuita, e pede o último contracheque (foto ou PDF). Se o lead perguntou algo, responde antes.' },
  { titulo: 'Leitura do contracheque', texto: 'Lê cada linha (proventos e descontos) e aplica a planilha do escritório em código: renda bruta acima de R$ 10.000 e, ou mais de 50% comprometido com redução acima de R$ 1.000, ou Credcesta acima de R$ 1.000. Foto ilegível: pede outra.' },
]

export interface Assunto { titulo: string; texto: string; motivo: string; base: string[] }

/** Coluna 1 do fluxo: o resultado da análise. */
export const CLIENTE: Assunto[] = [
  { titulo: 'Qualificado', texto: 'Mostra a porcentagem da renda comprometida e quanto a parcela pode baixar (teto de 40% do decreto) e já oferece dois horários.', motivo: 'agendou', base: [] },
  { titulo: 'Renda abaixo do mínimo', texto: 'Renda bruta até R$ 10.000: mensagem honesta indicando a Defensoria. Fica com a tag lia-desqualificou para vocês conferirem.', motivo: 'renda_abaixo', base: ['enc_renda_abaixo'] },
  { titulo: 'Redução pequena', texto: 'A regra da planilha não fecha: explica que a ação não compensaria. Tag lia-desqualificou.', motivo: 'alivio_baixo', base: ['enc_alivio_baixo'] },
  { titulo: 'Contracheque para conferir', texto: 'Desconto que o sistema não reconheceu e que poderia mudar o resultado: passa para vocês conferirem na planilha, com prazo de 24 horas. Etapa Retorno Imediato.', motivo: 'revisao_humana', base: ['enc_revisao'] },
]

/** Coluna 2 do fluxo: qualificado marca a reunião. */
export const NAO_CLIENTE = {
  texto: 'Reunião só quinta o dia todo e terça e quarta à tarde, em horário livre no Kommo e na Google Agenda. Ela nunca chuta horário.',
  perguntas: [
    'Oferece os dois horários livres mais próximos',
    'Se o lead pedir outro dia, explica a agenda e oferece outros dois',
    'Pergunta se prefere videochamada ou presencial (sem resposta, vale online)',
    'Marca: campo Agendamento, tarefa "Agendamento IA" e etapa Reunião Agendada',
    'Manda a confirmação e sai da conversa',
  ],
  motivo: 'agendou',
  base: ['confirmacao'],
}

export const QUALQUER_MOMENTO = 'Pediu para falar com uma pessoa, discordou da análise, já tem advogado ou trouxe outro assunto jurídico: passa para vocês na hora, com prazo de 24 horas.'

export const PASSAGEM = [
  'Grava no lead uma nota e o campo Resumo da conversa com o motivo e o que o lead contou.',
  'Cria uma tarefa Follow-up para o responsável do lead, com prazo de 24 horas.',
  'Tira a tag lia e põe lia-finalizou: daqui em diante quem responde são vocês.',
  'Manda ao lead a mensagem de 24 horas da base.',
]

/** Travas em código: valem mesmo que o modelo tente o contrário. */
export const TRAVAS = [
  'Nunca promete resultado nem cita chance de vitória; a redução é sempre "pode baixar cerca de".',
  'Nunca fala valor de honorários nem forma de pagamento: isso é na reunião.',
  'A conta e a decisão são da planilha, em código; o modelo só lê o contracheque.',
  'Nunca desqualifica por causa de um desconto que o sistema não reconheceu: manda para vocês conferirem.',
  'Só move o lead dentro do Funil/SDR e só até Reunião Agendada.',
  'Só marca reunião em horário livre da agenda; agenda fora do ar vira tarefa para vocês proporem o horário.',
]

/** Quem muda o quê na base. */
export const QUEM_MUDA = {
  voce: ['Quem é o escritório (nome e corporação do fundador)', 'Fatos do escritório (endereço, prazo, como é a reunião)', 'Resposta para "isso é golpe?"', 'Exemplos do jeito de escrever', 'Mensagens de desqualificação, revisão, 24 horas e confirmação', 'Informações novas (estacionamento, documentos que pedem)'],
  control: ['A regra da planilha (renda mínima, 50%, R$ 1.000, Credcesta)', 'Dias e horários da agenda', 'Ordem do roteiro e quando passar para vocês', 'Tags, etapas e quem recebe a tarefa', 'Mover desqualificado para Venda perdida'],
  nunca: ['Valor de honorários e forma de pagamento', 'Promessa de resultado ou chance de vitória', 'Dados pessoais de clientes'],
}

export const TAGS = [
  { tag: 'lia', significa: 'A Lia atende este lead.', quem: 'A automação de "Leads de entrada" (na rampagem, só os leads escolhidos).' },
  { tag: 'atendimento-humano', significa: 'Alguém da equipe está com o lead. A Lia não responde.', quem: 'Vocês, a qualquer hora.' },
  { tag: 'lia-finalizou', significa: 'A Lia encerrou (reunião marcada, desqualificado ou passado para vocês).', quem: 'A Lia.' },
  { tag: 'lia-desqualificou', significa: 'Desqualificado pela planilha: confiram na rampagem.', quem: 'A Lia.' },
]

export const ACOES = [
  { titulo: 'Tirar a Lia de um lead', texto: 'Coloque a tag atendimento-humano, ou tire a tag lia. Ela para de responder na hora.' },
  { titulo: 'Devolver um lead para a Lia', texto: 'Tire a tag atendimento-humano e coloque a tag lia. Ela começa um atendimento novo.' },
  { titulo: 'Bloquear um horário', texto: 'Marque o compromisso na Google Agenda do escritório: a Lia não oferece horário ocupado.' },
]

export const COMBINADOS = [
  { titulo: 'Não renomeiem nem apaguem as etapas do Funil/SDR.', porque: 'A Lia move o lead por elas. Mudou alguma? Avise a Control Gestão antes.' },
  { titulo: 'Não apaguem os campos Agendamento, Resumo da conversa e Resposta IA (Lia).', porque: 'É onde ela grava a reunião, o resumo e a mensagem que o robô envia.' },
  { titulo: 'Mudou um fato do escritório ou quer outra mensagem?', porque: 'Peça em Ensinar: a IA atualiza e o exame confere. Mudança na planilha ou na agenda vira pedido para a Control Gestão.' },
  { titulo: 'Viram uma resposta estranha?', porque: 'Corrija em Ensinar › Conversas reais. Se for regra de atendimento, a IA registra o pedido para a Control Gestão.' },
  { titulo: 'Desqualificado que não devia?', porque: 'Na rampagem os desqualificados ficam com a tag lia-desqualificou. Confiram com a planilha e avisem a Control Gestão se a regra errar.' },
]

export const FAQ = [
  { p: 'A Lia diz que é uma IA?', r: 'Sim. Se perguntarem, ela diz que é a Lia, assistente virtual do escritório. Nunca finge ser uma pessoa.' },
  { p: 'E se o lead mandar áudio, foto ou PDF?', r: 'Ela ouve o áudio e lê a foto ou o PDF. No contracheque, lê cada linha de provento e desconto antes da análise.' },
  { p: 'E se o lead insistir no valor da ação?', r: 'Ela diz que o valor depende do caso e o advogado apresenta na reunião, com a análise em mãos. Nunca escreve valor de honorários.' },
  { p: 'Respondi um lead e a Lia parou. Está com problema?', r: 'Não. Quando alguém da equipe manda mensagem pelo Kommo, ela fica quieta por 6 horas naquele lead para não atropelar vocês.' },
  { p: 'Mudei um texto em Ensinar. Já vale no WhatsApp?', r: 'Só depois de publicar. A mudança fica no rascunho até o exame aprovar as 10 conversas de teste.' },
]
