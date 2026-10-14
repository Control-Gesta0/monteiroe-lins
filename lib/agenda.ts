import type { AgendaConfig } from './crm-map-types'

/**
 * Agenda das reuniões (arquivo puro: sem env, roda em `npm test`).
 *
 * O Kommo não tem API de agenda. Enquanto a agenda real do escritório não é
 * ligada, a grade vem do crm-map e um horário está ocupado quando algum lead
 * em Reunião Agendada/Presencial tem o campo Agendamento naquele horário
 * (mais a reserva no Redis, que evita dois leads no mesmo horário ao mesmo tempo).
 */

export interface Slot {
  /** epoch em segundos (é o valor que o campo date_time do Kommo guarda) */
  inicio: number
  /** "2026-10-16T10:00", horário de Brasília: é o que o modelo devolve no agendar_reuniao */
  iso: string
  /** "quinta (16/10) às 10h" */
  rotulo: string
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const pad = (n: number) => String(n).padStart(2, '0')

function offsetMin(cfg: AgendaConfig): number {
  const m = cfg.offsetUtc.match(/^([+-])(\d{2}):(\d{2})$/)
  if (!m) throw new Error(`offsetUtc inválido: ${cfg.offsetUtc}`)
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}

/** Partes da data no horário local configurado. */
function local(epochS: number, cfg: AgendaConfig) {
  const d = new Date(epochS * 1000 + offsetMin(cfg) * 60_000)
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes() }
}

function epochDe(y: number, mo: number, d: number, h: number, mi: number, cfg: AgendaConfig): number {
  return Math.round((Date.UTC(y, mo - 1, d, h, mi) - offsetMin(cfg) * 60_000) / 1000)
}

export function slotDeEpoch(inicio: number, cfg: AgendaConfig): Slot {
  const p = local(inicio, cfg)
  const hora = p.mi ? `${p.h}h${pad(p.mi)}` : `${p.h}h`
  return { inicio, iso: `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`, rotulo: `${DIAS[p.wd]} (${pad(p.d)}/${pad(p.mo)}) às ${hora}` }
}

/** "2026-10-16T10:00" ou "2026-10-16 10:00" (horário de Brasília) → Slot. */
export function slotDeIso(texto: string, cfg: AgendaConfig): Slot | null {
  const m = String(texto || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/)
  if (!m) return null
  return slotDeEpoch(epochDe(+m[1], +m[2], +m[3], +m[4], +m[5], cfg), cfg)
}

export function naGrade(slot: Slot, cfg: AgendaConfig): boolean {
  const p = local(slot.inicio, cfg)
  return (cfg.grade[p.wd] || []).includes(`${pad(p.h)}:${pad(p.mi)}`)
}

/** Primeiro instante que pode ser oferecido (amanhã 00:00 local, ou agora + 1h). */
export function inicioPermitido(agoraS: number, cfg: AgendaConfig): number {
  if (!cfg.aPartirDeAmanha) return agoraS + 3600
  const p = local(agoraS, cfg)
  return epochDe(p.y, p.mo, p.d, 0, 0, cfg) + 86_400
}

export function ocupado(slot: Slot, ocupados: number[], cfg: AgendaConfig): boolean {
  return ocupados.some(t => Math.abs(t - slot.inicio) < cfg.duracaoMin * 60)
}

/** Todos os horários livres da grade, em ordem. */
export function horariosLivres(agoraS: number, ocupados: number[], cfg: AgendaConfig): Slot[] {
  const desde = inicioPermitido(agoraS, cfg)
  const hoje = local(agoraS, cfg)
  const out: Slot[] = []
  for (let dia = 0; dia <= cfg.diasAFrente; dia++) {
    const base = epochDe(hoje.y, hoje.mo, hoje.d, 0, 0, cfg) + dia * 86_400
    const wd = local(base, cfg).wd
    for (const hhmm of cfg.grade[wd] || []) {
      const [h, mi] = hhmm.split(':').map(Number)
      const slot = slotDeEpoch(base + h * 3600 + mi * 60, cfg)
      if (slot.inicio >= desde && !ocupado(slot, ocupados, cfg)) out.push(slot)
    }
  }
  return out
}

/** As duas opções a oferecer: a mais próxima e a próxima em OUTRO dia (se houver). */
export function duasOpcoes(livres: Slot[], cfg: AgendaConfig, pular: number[] = []): Slot[] {
  const lista = livres.filter(s => !pular.includes(s.inicio))
  if (!lista.length) return []
  const primeira = lista[0]
  const diaDe = (s: Slot) => s.iso.slice(0, 10)
  const outroDia = lista.find(s => diaDe(s) !== diaDe(primeira))
  // Prefere manhã × tarde quando as duas são no mesmo dia
  const outroTurno = lista.find(s => diaDe(s) === diaDe(primeira) && (local(s.inicio, cfg).h < 12) !== (local(primeira.inicio, cfg).h < 12))
  const segunda = outroDia || outroTurno || lista[1]
  return segunda ? [primeira, segunda] : [primeira]
}
