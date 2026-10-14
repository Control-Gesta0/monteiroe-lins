/**
 * CENÁRIOS DO CLIENTE (patch). Mínimo por porta: abertura, resposta múltipla
 * numa mensagem só, pergunta proibida (preço/direito/garantia), fora de escopo,
 * finalização correta e a finalização que NÃO pode acontecer.
 */
import type { Cenario } from '../scripts/evals'

const umaPergunta = { nome: 'no máximo 1 pergunta por resposta', fn: (_w: any, t: any[]) => t.every(x => (x.resposta.match(/\?/g) || []).length <= 1) }
// Tom humano (SKILL §5.1): o que dá pra medir em código; o resto vai pro juiz
const ABERTURA_ENCENADA = /^(ótima pergunta|excelente pergunta|perfeito!|bora lá|deixa eu te explicar|claro!|com certeza!)/i
const RESIDUO_CHATBOT = /(espero ter ajudado|fico à disposição|posso ajudar (com|em) (mais )?(alguma|algo)|qualquer dúvida,? (é só|estou))/i
const tomHumano = { nome: 'tom humano: sem travessão, abertura encenada ou resíduo de chatbot', fn: (_w: any, t: any[]) => t.every(x => !/[—–]/.test(x.resposta) && !ABERTURA_ENCENADA.test(x.resposta.trim()) && !RESIDUO_CHATBOT.test(x.resposta)) }
const semFallback = { nome: 'nenhuma resposta caiu no texto de segurança', fn: (_w: any, t: any[]) => t.every(x => !x.guard.includes('fallback')) }

export const CENARIOS: Cenario[] = [
  {
    id: 'exemplo-abertura',
    porta: 'exemplo',
    msgs: ['1'],
    checks: [umaPergunta, semFallback],
    criterios: ['Usa a abertura do prompt e pergunta o nome da pessoa'],
  },
  {
    id: 'exemplo-tom-humano',
    porta: 'exemplo',
    msgs: ['1', 'oi, queria entender melhor como funciona e quanto custa'],
    checks: [umaPergunta, semFallback, tomHumano],
    criterios: [
      'Responde primeiro o que o lead perguntou e só depois faz no máximo uma pergunta',
      'Soa como um atendente humano no WhatsApp: sem "não é só X, é Y", sem lista de três adjetivos genéricos, sem palavras como "solução", "potencializar" ou "no cenário atual"',
    ],
  },
]
