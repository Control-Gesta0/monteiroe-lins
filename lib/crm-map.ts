/**
 * MAPA DO CRM — ARQUIVO DO CLIENTE (patch, nunca copie por cima).
 *
 * Tudo que é número vem da conta VIVA: rode `npm run discover` e copie daqui.
 * Placeholders são 0 de propósito: o /api/validate acusa cada um.
 *
 * Três ideias que este arquivo carrega:
 *  1. PORTAS — um agente, N assuntos. O roteador (lib/router.ts) trava a porta
 *     em CÓDIGO (menu numérico ou sinal inequívoco no texto). Cada porta tem o
 *     próprio prompt em prompts/portas/, carregado SÓ quando ela está ativa.
 *  2. CAMPOS com `sinal` — a evidência do lead precisa falar do campo, senão
 *     a gravação é recusada (comum/PEGADINHAS §48).
 *  3. FINALIZAR — o que acontece no CRM quando a IA termina. Na migração do n8n
 *     o padrão é o do cliente de origem: remover a tag de gate e mais nada.
 */

import type { Alerta, Campo, Etapa, Porta } from './crm-map-types'
export type { Alerta, Campo, CampoTipo, Etapa, Porta } from './crm-map-types'

const CAMPOS = {
  nome: { key: 'nome', id: 0, name: 'Nome do lead', type: 'text', sinal: /[a-zà-ú]{2,}/i, pergunta: 'Pode me dizer seu nome?' },
  // exemplo de select: gravado por enum_id
  // interesse: { key: 'interesse', id: 0, kommoName: '[NOME REAL]', name: 'Interesse', type: 'select',
  //   options: [{ id: 0, value: 'Opção A' }, { id: 0, value: 'Opção B' }], sinal: /opção|a\b|b\b/i },
} satisfies Record<string, Campo>

export const CRM_MAP = {
  /** textarea que o Salesbot envia (na migração do n8n: o MESMO campo que ele usava) */
  respostaFieldId: 0,

  /** a IA NUNCA escreve nestes campos (CPF, senha, nº de processo...) */
  camposProibidos: [] as number[],

  campos: CAMPOS as Record<string, Campo>,

  portas: [
    {
      id: 'exemplo',
      label: '[ASSUNTO 1]',
      menu: 1,
      ativa: true,
      promptFile: 'exemplo.md',
      sinais: /\b(palavra-inequivoca)\b/i,
      roteiro: ['nome'],
      obrigatorios: ['nome'],
    },
    {
      id: 'geral',
      label: 'Outros assuntos',
      menu: null,
      ativa: false,
      sinais: /$^/,
      roteiro: [],
      obrigatorios: [],
      mensagemSemAgente: 'Anotei aqui. Alguém da equipe do escritório continua a conversa com você por aqui.',
    },
  ] as Porta[],

  menu: {
    /** número do menu que abre o modo "me conta seu caso" */
    outros: 9,
    /** porta usada quando o resumo de "outros" não casa com nenhuma porta */
    portaPadraoOutros: 'geral',
    /** true = texto com sinal inequívoco de UMA porta trava direto, sem mostrar menu */
    classificarTextoLivre: true,
    texto: 'Oi! Sobre qual assunto você quer falar? Me responde com o número:\n\n1 - [ASSUNTO 1]\n9 - Outros assuntos',
    pedirResumo: 'Certo. Me conta em uma ou duas frases o que aconteceu.',
    naoEntendi: 'Não entendi qual opção você escolheu. Pode mandar só o número?',
  },

  finalizar: {
    removerGate: true,
    /** tags extras ao finalizar (ex.: ['ia-finalizado']). Vazio = só remove o gate */
    tags: [] as string[],
    tagUrgente: '' as string,
    /** nota no card com resumo e respostas */
    nota: false,
  },

  /** detecções em código que viram aviso no contexto (ex.: advogado ativo, menor, urgência) */
  alertas: [] as Alerta[],

  /** alçada de etapas. Vazio = a IA NUNCA move etapa */
  etapas: [] as Etapa[],
  /** status onde o lead está ADIANTADO — a IA não mexe (kommo/PEGADINHAS §14) */
  etapasProtegidas: [142, 143] as number[],

  textoSeguro: 'Entendi. Isso quem avalia é a nossa equipe. Posso te fazer mais uma pergunta rápida?',
  textoSeguroFinal: 'Obrigado, anotei tudo. Agora a equipe segue com você por aqui.',

  midia: {
    instrucaoVisao: 'Descreva em português, em no máximo 4 frases, o conteúdo do arquivo que um lead enviou pelo WhatsApp: tipo de documento, quem emitiu, datas e valores legíveis. Não avalie direitos. O que não estiver legível, diga "ilegível".',
  },
}

export const portaById = (id?: string) => CRM_MAP.portas.find(p => p.id === id)
export const campoByKey = (key: string) => CRM_MAP.campos[key]
