import { CONFIG } from './config'
import { k, redis } from './redis'

/**
 * Google Agenda do escritório (Monteiro & Lins).
 *
 * - Autorização: uma vez, pelo dono da agenda, em /api/google-oauth?secret=...
 *   O refresh token fica no Redis (ou em GOOGLE_REFRESH_TOKEN).
 * - Escopo mínimo: calendar.events (lê e cria eventos; não mexe em compartilhamento).
 * - Sem configuração ou sem token, a Lia segue só com a grade + reuniões do Kommo
 *   (googleAtivo() = false) e o /api/validate avisa.
 */

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const TOKEN_KEY = () => k('google', 'refresh_token')

export const googleConfigurado = () => !!(CONFIG.googleClientId && CONFIG.googleClientSecret && CONFIG.googleCalendarId)

export async function refreshToken(): Promise<string | null> {
  return CONFIG.googleRefreshToken || (await redis.get<string>(TOKEN_KEY())) || null
}

export async function salvarRefreshToken(token: string): Promise<void> {
  await redis.set(TOKEN_KEY(), token)
}

export async function googleAtivo(): Promise<boolean> {
  return googleConfigurado() && !!(await refreshToken())
}

export const redirectUri = () => `${CONFIG.selfUrl}/api/google-oauth`

export function urlDeConsentimento(state: string): string {
  const p = new URLSearchParams({
    client_id: CONFIG.googleClientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
}

async function tokenEndpoint(body: Record<string, string>): Promise<{ access_token?: string; refresh_token?: string; error?: string; error_description?: string }> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CONFIG.googleClientId, client_secret: CONFIG.googleClientSecret, ...body }),
  })
  return r.json() as Promise<{ access_token?: string; refresh_token?: string; error?: string; error_description?: string }>
}

export async function trocarCodigo(code: string): Promise<{ refreshToken: string | null; erro?: string }> {
  const j = await tokenEndpoint({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() })
  if (j.error) return { refreshToken: null, erro: `${j.error}: ${j.error_description || ''}` }
  return { refreshToken: j.refresh_token || null, erro: j.refresh_token ? undefined : 'o Google não devolveu refresh token (tente de novo: a tela pede consentimento de novo)' }
}

let cacheAcesso: { token: string; ate: number } | null = null

async function accessToken(): Promise<string> {
  if (cacheAcesso && cacheAcesso.ate > Date.now() + 60_000) return cacheAcesso.token
  const rt = await refreshToken()
  if (!rt) throw new Error('Google Agenda sem autorização: abra /api/google-oauth?secret=...')
  const j = await tokenEndpoint({ refresh_token: rt, grant_type: 'refresh_token' })
  if (!j.access_token) throw new Error(`Google token: ${j.error || 'sem access_token'} ${j.error_description || ''}`)
  cacheAcesso = { token: j.access_token, ate: Date.now() + 50 * 60_000 }
  return j.access_token
}

async function gcal<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`Google Agenda ${method} ${path.split('?')[0]} -> ${r.status}: ${text.slice(0, 300)}`)
  return (text ? JSON.parse(text) : {}) as T
}

const cal = () => `/calendars/${encodeURIComponent(CONFIG.googleCalendarId)}`

export interface EventoGoogle {
  id: string
  status?: string
  summary?: string
  transparency?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

/** Intervalos ocupados [início, fim) em epoch s. Evento "disponível" (transparent) e cancelado não ocupam. */
export function intervalosOcupados(eventos: EventoGoogle[], offsetUtc = '-03:00'): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const e of eventos) {
    if (e.status === 'cancelled' || e.transparency === 'transparent') continue
    const ini = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00${offsetUtc}` : null)
    const fim = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00${offsetUtc}` : null)
    if (!ini || !fim) continue
    const a = Math.floor(Date.parse(ini) / 1000)
    const b = Math.floor(Date.parse(fim) / 1000)
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) out.push([a, b])
  }
  return out
}

export async function listarEventos(deS: number, ateS: number): Promise<EventoGoogle[]> {
  const out: EventoGoogle[] = []
  let pageToken = ''
  for (let i = 0; i < 5; i++) {
    const q = new URLSearchParams({ timeMin: new Date(deS * 1000).toISOString(), timeMax: new Date(ateS * 1000).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250', ...(pageToken ? { pageToken } : {}) })
    const r = await gcal<{ items?: EventoGoogle[]; nextPageToken?: string }>('GET', `${cal()}/events?${q}`)
    out.push(...(r.items || []))
    if (!r.nextPageToken) break
    pageToken = r.nextPageToken
  }
  return out
}

export async function criarEvento(e: { inicioS: number; fimS: number; titulo: string; descricao: string; local?: string }): Promise<string> {
  const r = await gcal<{ id: string }>('POST', `${cal()}/events`, {
    summary: e.titulo,
    description: e.descricao,
    ...(e.local ? { location: e.local } : {}),
    start: { dateTime: new Date(e.inicioS * 1000).toISOString(), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: new Date(e.fimS * 1000).toISOString(), timeZone: 'America/Sao_Paulo' },
  })
  return r.id
}

/** Prova de acesso: events.list devolve o nome da agenda (calendars.get pediria um escopo maior). */
export async function nomeDaAgenda(): Promise<string> {
  const r = await gcal<{ summary?: string }>('GET', `${cal()}/events?maxResults=1`)
  return r.summary || CONFIG.googleCalendarId
}
