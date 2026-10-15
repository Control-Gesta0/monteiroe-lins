export function brl(valor: number, casas = 2) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas })
}

export function dataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function tempoRelativo(iso: string) {
  const delta = new Date(iso).getTime() - Date.now()
  const min = Math.round(Math.abs(delta) / 60000)
  const txt = min < 60 ? `${min} min` : min < 1440 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)}d`
  return delta < 0 ? `há ${txt}` : `em ${txt}`
}

export function pct(parte: number, todo: number) {
  return todo ? `${Math.round((parte / todo) * 100)}%` : '—'
}

/** Rótulos dos motivos de passagem e de fim (os mesmos do agente, lib/central-data.ts). */
export const MOTIVO_ROTULO: Record<string, string> = {
  porta_sem_agente: 'Cliente do escritório',
  revisao_humana: 'Contracheque para conferir',
  pediu_humano: 'Pediu uma pessoa',
  fora_do_escopo: 'Outro assunto',
  discordou_analise: 'Discordou da análise',
  agenda_indisponivel: 'Agenda não respondeu',
  advogado_ativo: 'Já tem advogado',
  urgencia: 'Urgência',
  menor_de_idade: 'Menor de idade',
  desistiu: 'Desistiu',
  agendou: 'Reunião marcada',
  renda_abaixo: 'Renda abaixo do mínimo',
  alivio_baixo: 'Redução pequena',
  outro: 'Outro',
}

/** Decisão da análise do contracheque. */
export const DECISAO_ROTULO: Record<string, string> = {
  qualificado: 'Qualificado',
  renda_abaixo: 'Renda abaixo do mínimo',
  alivio_baixo: 'Redução pequena',
  revisao_humana: 'Para a equipe conferir',
}
