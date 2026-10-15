import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { CONFIG } from '../lib/config'
import { googleConfigurado, nomeDaAgenda, salvarRefreshToken, trocarCodigo, urlDeConsentimento } from '../lib/google-calendar'
import { k, redis } from '../lib/redis'

/**
 * Liga a Google Agenda do escritório (uma vez, pelo dono da agenda).
 *   1. GET /api/google-oauth?secret=WEBHOOK_SECRET (ou ?convite=, link de 7 dias para o cliente,
 *      criado por scripts/google-convite.ts) → manda para a tela "Permitir" do Google
 *   2. o Google volta aqui com ?code&state → guarda o refresh token e prova lendo a agenda
 * O redirect URI precisa estar cadastrado no cliente OAuth: SELF_URL + /api/google-oauth
 */

const pagina = (titulo: string, texto: string) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title>` +
  `<body style="font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;line-height:1.5"><h2>${titulo}</h2><p>${texto}</p></body>`

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  if (!googleConfigurado() || !CONFIG.selfUrl) return res.status(500).send(pagina('Agenda não configurada', 'Faltam GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALENDAR_ID ou SELF_URL nas variáveis da Vercel.'))

  const code = String(req.query.code || '')
  const state = String(req.query.state || '')
  if (req.query.error) return res.status(400).send(pagina('Autorização cancelada', esc(String(req.query.error))))

  if (!code) {
    const secret = String(req.query.secret || '')
    const convite = String(req.query.convite || '')
    const okSecret = crypto.timingSafeEqual(crypto.createHash('sha256').update(secret).digest(), crypto.createHash('sha256').update(CONFIG.webhookSecret).digest())
    const okConvite = /^[a-f0-9]{32}$/.test(convite) && !!(await redis.get(k('google', 'convite', convite)))
    if (!okSecret && !okConvite) return res.status(401).send(pagina('Link expirado ou inválido', 'Peça um link novo para a Control Gestão.'))
    const nonce = crypto.randomBytes(16).toString('hex')
    await redis.set(k('google', 'state', nonce), okConvite ? convite : '1', { ex: 600 })
    res.setHeader('Location', urlDeConsentimento(nonce))
    return res.status(302).end()
  }

  // Volta do Google: o state precisa ser o que emitimos (uso único, 10 min)
  const origem = state ? await redis.getdel<string>(k('google', 'state', state)) : null
  if (!origem) return res.status(400).send(pagina('Link expirado', 'Abra o link de conexão de novo.'))
  const { refreshToken, erro } = await trocarCodigo(code)
  if (!refreshToken) return res.status(400).send(pagina('Não deu certo', esc(erro || 'sem token')))
  await salvarRefreshToken(refreshToken)
  if (origem !== '1') await redis.del(k('google', 'convite', origem)) // convite é de uso único
  try {
    const nome = await nomeDaAgenda()
    return res.status(200).send(pagina('Agenda conectada ✅', `A Lia agora lê e marca reuniões na agenda <b>${esc(nome)}</b>. Pode fechar esta página.`))
  } catch (e) {
    return res.status(200).send(pagina('Conta autorizada, mas a agenda não abriu', `${esc(e instanceof Error ? e.message : String(e))}<br><br>Confira se a conta que autorizou tem acesso de edição à agenda do escritório.`))
  }
}
