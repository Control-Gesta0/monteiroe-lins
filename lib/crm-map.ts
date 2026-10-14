/**
 * MAPA DO CRM · MONTEIRO & LINS ADVOCACIA (patch do cliente, nunca copie por cima).
 *
 * IDs lidos ao vivo na conta `monteiroelinsadvocacia` (34627603) em 14/10/2026.
 * Antes de cada deploy: GET /api/validate?secret=... tem que voltar ok:true.
 *
 * Duas portas:
 *  - superendividamento: lead novo do Funil/SDR. Contracheque → análise em código
 *    (lib/analise-contracheque.ts, réplica da planilha) → reunião ou desqualificação.
 *  - atendimento: quem já é cliente (lead fora do Funil/SDR, ou depois da reunião,
 *    ou que fala de processo/liminar/audiência). Sem LLM: mensagem fixa de 24h,
 *    tarefa para a equipe e a IA sai da conversa.
 */

import type { AgendaConfig, Alerta, Campo, Etapa, Porta } from './crm-map-types'
export type { AgendaConfig, Alerta, Campo, CampoTipo, Etapa, FerramentaExtra, Porta } from './crm-map-types'

const CAMPOS = {
  cargo: { key: 'cargo', id: 1128803, kommoName: 'Cargo', name: 'Cargo ou patente', type: 'text', sinal: /[a-zà-ú]{3,}/i },
} satisfies Record<string, Campo>

const TEXTO_24H = 'Vou passar a sua mensagem pra equipe do escritório, e eles te respondem por aqui em até 24 horas.'

export const CRM_MAP = {
  /** textarea que o Salesbot envia. Criar o campo "Resposta IA (Lia)" no Kommo e colar o ID aqui. */
  respostaFieldId: 0,

  /** a IA NUNCA escreve nestes campos: CPF/CNPJ, Nº do Processo, Processo, E-mail */
  camposProibidos: [641670, 707674, 1114058, 1111586] as number[],

  campos: CAMPOS as Record<string, Campo>,

  portas: [
    {
      id: 'superendividamento',
      label: 'Análise do contracheque e reunião',
      menu: null,
      ativa: true,
      promptFile: 'superendividamento.md',
      sinais: /$^/,
      roteiro: [],
      obrigatorios: [],
      ferramentas: ['analisar_contracheque', 'consultar_horarios', 'agendar_reuniao'],
    },
    {
      id: 'atendimento',
      label: 'Cliente do escritório / pedido de atendimento',
      menu: null,
      ativa: false,
      // Só fala de processo em andamento. "processo" sozinho não basta: o lead novo pergunta "como é o processo?"
      sinais: /\b(meu|minha|do meu|da minha|no meu|na minha)\s+(processo|a[cç][aã]o|liminar|audi[eê]ncia|contrato|peti[cç][aã]o)\b|\b(andamento|j[aá] sou cliente|sou cliente|meu advogado|minha advogada|n[uú]mero do processo)\b/i,
      roteiro: [],
      obrigatorios: [],
      mensagemSemAgente: `Oi! ${TEXTO_24H}`,
    },
  ] as Porta[],

  menu: {
    outros: 9,
    portaPadraoOutros: 'atendimento',
    classificarTextoLivre: true,
    /** Monteiro & Lins: sem menu. Mensagem sem sinal de cliente vai direto para o SDR. */
    portaPadrao: 'superendividamento' as string | undefined,
    texto: '',
    pedirResumo: '',
    naoEntendi: '',
  },

  finalizar: {
    removerGate: true,
    tags: ['lia-finalizou'] as string[],
    tagUrgente: 'lia-urgente' as string,
    nota: true,
  },

  alertas: [
    {
      nome: 'advogado ativo',
      re: /\b(j[aá] tenho|tenho um|tenho uma|estou com|t[oô] com)\s+(advogad|defensor)|\bdefensoria\b.*\b(cuidando|entrou|est[aá])\b/i,
      aviso: 'O lead disse que já tem advogado ou defensor no caso. Confirme se é a mesma dívida; se for, chame finalizar_atendimento(advogado_ativo).',
    },
  ] as Alerta[],

  /** A IA não move etapa por ferramenta livre: quem move é o código (ver `sdr`). */
  etapas: [] as Etapa[],
  /** Reunião Agendada em diante, ganho e perdido: a IA não mexe */
  etapasProtegidas: [85921951, 86687847, 88985691, 85921955, 86854727, 97779631, 86791959, 142, 143] as number[],

  textoSeguro: 'Entendi. Essa parte o advogado avalia com você na reunião. Me manda o seu último contracheque pra eu fazer a análise?',
  textoSeguroFinal: `Obrigada. ${TEXTO_24H}`,

  /** Saídas que NÃO são de humano (template de abertura disparado pelo Salesbot): não pausam a IA. */
  saidasAutomaticas: [/Aqui é a Lia, assistente virtual/i] as RegExp[],

  midia: {
    maxTokens: 3000,
    instrucaoVisao: [
      'Você lê arquivos que um lead mandou pelo WhatsApp para um escritório de advocacia.',
      'Se for CONTRACHEQUE (holerite, demonstrativo de pagamento, ficha financeira), transcreva só neste formato, sem comentários:',
      'CONTRACHEQUE | <órgão pagador> | <competência MM/AAAA> | <legível: sim, parcial ou não>',
      'RUBRICA | <código> | <descrição exatamente como está escrita> | <P se for provento/vantagem/crédito, D se for desconto> | <valor com vírgula decimal, ex.: 1.234,56>',
      'Escreva uma linha RUBRICA para CADA linha de provento e de desconto, na ordem do documento. Não inclua linhas de total (total bruto, total de descontos, líquido a receber, base de cálculo).',
      'Se o valor de uma linha estiver ilegível, escreva ILEGÍVEL no lugar do valor. Nunca invente nem arredonde valor.',
      'Se NÃO for contracheque: descreva em no máximo 4 frases o tipo de documento, quem emitiu, datas e valores legíveis. Não avalie direitos.',
    ].join('\n'),
  },

  /** Funil/SDR: o que o código move e grava (fail-closed: fora destas etapas, não mexe). */
  sdr: {
    pipelineId: 11197195,
    etapas: {
      entrada: 85921939, // Leads de entrada
      qualificacao: 85921943, // Qualificação
      semResposta: 112779736, // follow - não responde
      revisao: 85921947, // Retorno Imediato/Fazer analise
      qualificado: 112457304, // lead qualificado
      agendada: 85921951, // Reunião Agendada (limite da IA)
    },
    /** a IA só move o lead se ele estiver numa destas */
    etapasDaIA: [85921939, 85921943, 112779736, 85921947, 112457304] as number[],
    campos: {
      agendamento: 1084116, // date_time
      resumo: 1125901, // textarea "Resumo da conversa"
      corporacao: 707518, // select
    },
    corporacaoPorOrgao: [
      { re: /PMERJ|POL[IÍ]CIA MILITAR/i, enumId: 598404 }, // Polícia militar RJ
      { re: /CBMERJ|BOMBEIRO/i, enumId: 598406 }, // Corpo de bombeiros RJ
    ],
    tarefas: {
      tipoAgendamento: 4231636, // "Agendamento IA"
      tipoRetorno: 1, // "Follow-up"
      horasRetorno: 24,
      /** motivos de finalização que viram tarefa de retorno em 24h */
      motivosComRetorno: ['porta_sem_agente', 'pediu_humano', 'fora_do_escopo', 'revisao_humana', 'urgencia', 'discordou_analise'],
    },
    desqualificacao: {
      /** rampagem: false = só marca a tag e o comercial confere. true = move para Venda perdida com motivo */
      moverParaPerdido: false,
      tag: 'lia-desqualificou',
      motivoPerda: { renda_abaixo: 29738827, alivio_baixo: 29595091 } as Record<string, number>, // "-3.5k Bruto", "Baixo SE"
    },
    endereco: 'Rua da Quitanda, 19, sala 711, Centro',
    textos: {
      renda_abaixo: 'Olhando a sua situação com cuidado, pelas exigências da lei e pelos custos do processo, a ação não seria vantajosa pra você agora. A Defensoria Pública do RJ atende de graça e pode te orientar nesse caso. Se a sua situação mudar, pode chamar a gente de novo.',
      alivio_baixo: 'Fiz a análise e a redução na parcela seria pequena, não compensaria o custo de entrar com a ação. Prefiro ser sincera com você do que te indicar algo que não vai trazer retorno. Se a situação mudar, me chama aqui.',
      revisao_humana: `Recebi tudo. Tem uns descontos no seu contracheque que a equipe precisa conferir, e eles te respondem por aqui em até 24 horas.`,
      atendimento: TEXTO_24H,
    },
  },

  agenda: {
    offsetUtc: '-03:00',
    duracaoMin: 30,
    // Quinta o dia todo; terça e quarta só à tarde (definido pelo escritório em 14/10/2026).
    // Horários tirados das 176 reuniões já marcadas no CRM. Trocar quando a agenda real for ligada.
    grade: {
      2: ['14:30', '15:00', '15:30', '16:00', '16:30'],
      3: ['14:30', '15:00', '15:30', '16:00', '16:30'],
      4: ['09:30', '10:00', '10:30', '11:00', '14:30', '15:00', '15:30', '16:00', '16:30'],
    },
    diasAFrente: 10,
    aPartirDeAmanha: true,
    etapasOcupadas: [85921951, 88985691], // Reunião Agendada, Reunião Presencial
  } satisfies AgendaConfig,
}

export const portaById = (id?: string) => CRM_MAP.portas.find(p => p.id === id)
export const campoByKey = (key: string) => CRM_MAP.campos[key]
