function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Env var obrigatória ausente: ${name}`)
  return v
}

function json<T>(v: string | undefined, padrao: T): T {
  try { return v ? (JSON.parse(v) as T) : padrao } catch { return padrao }
}

const list = (v: string | undefined) => (v || '').split(',').map(x => x.trim()).filter(Boolean)

/**
 * Variante KOMMO · Desenho A (WhatsApp oficial dentro do Kommo, envio pelo
 * Salesbot). O Kommo não devolve transcript: o histórico é NOSSO (Redis).
 */
export const CONFIG = {
  clientName: process.env.CLIENT_NAME || 'Cliente · Agente',

  kommoDomain: required('KOMMO_DOMAIN').replace(/\/+$/, '').replace(/^(?!https?:\/\/)/, 'https://'),
  kommoToken: required('KOMMO_TOKEN'),
  kommoAccountId: required('KOMMO_ACCOUNT_ID'),
  kommoBotId: Number(process.env.KOMMO_BOT_ID || 0),

  openaiApiKey: required('OPENAI_API_KEY'),
  llmModel: process.env.LLM_MODEL || 'gpt-5.4-mini-2026-03-17',
  visionModel: process.env.VISION_MODEL || 'gpt-5.4-mini-2026-03-17',
  sttModel: process.env.STT_MODEL || 'gpt-4o-mini-transcribe',

  upstashUrl: required('UPSTASH_REDIS_REST_URL'),
  upstashToken: required('UPSTASH_REDIS_REST_TOKEN'),
  redisPrefix: process.env.REDIS_PREFIX || 'ak:',

  webhookSecret: required('WEBHOOK_SECRET'),
  debounceSeconds: Number(process.env.DEBOUNCE_SECONDS || 10),

  // Gate: só atende quem tem a tag. Vazio = atende todos (só no fim da rampagem).
  gateTag: (process.env.GATE_TAG || '').toLowerCase(),
  humanTag: (process.env.HUMAN_TAG || 'atendimento-humano').toLowerCase(),
  testLeadIds: list(process.env.TEST_LEAD_IDS).map(Number).filter(Boolean),

  // Monteiro & Lins: endereço público do deploy (nunca VERCEL_URL) e Google Agenda
  selfUrl: (process.env.SELF_URL || '').replace(/\/+$/, ''),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID || '',
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',

  // Central v5: segredo próprio da Central (sem ele, vale o WEBHOOK_SECRET) e câmbio do custo
  centralSecret: process.env.CENTRAL_SECRET || '',
  usdBrl: Number(process.env.COST_USD_BRL || 5.5),

  // Stevo (WhatsApp pela Stevo/Evolution Go). CANAL_LIA=stevo: a Lia ouve o webhook da Stevo
  // (/api/canal-hint) e ignora o add_message do Kommo; kommo (padrão): como antes (Salesbot).
  canalLia: (process.env.CANAL_LIA || 'kommo').toLowerCase() === 'stevo' ? 'stevo' as const : 'kommo' as const,
  stevoInstances: json<Record<string, { url?: string; apikey?: string }>>(process.env.STEVO_INSTANCES, {}),
  /** Card novo no número da Lia já ganha a tag de gate (fim da rampagem). Desligado = só quem tem a tag. */
  stevoTagLia: ['1', 'true', 'sim'].includes((process.env.STEVO_TAG_LIA || '').toLowerCase()),

  // Cobrança do contracheque (lib/cobranca.ts): lembretes atrasados pelo QStash. COBRANCA_CONTRACHEQUE=0 desliga.
  cobrancaContracheque: (process.env.COBRANCA_CONTRACHEQUE || '1') !== '0',
  qstashUrl: (process.env.QSTASH_URL || 'https://qstash.upstash.io').replace(/\/+$/, ''),
  qstashToken: process.env.QSTASH_TOKEN || '',
  /** > 0: nos leads de TEST_LEAD_IDS os lembretes saem a cada N minutos (para testar sem esperar) */
  cobrancaTesteMinutos: Number(process.env.COBRANCA_TESTE_MINUTOS || 0),

  // Painel de gestão (/api/painel): a chave do escritório (só vê o painel)
  painelSecret: process.env.PAINEL_SECRET || '',
}
