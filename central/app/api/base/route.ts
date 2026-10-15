import { NextResponse, type NextRequest } from 'next/server'
import { chamarAgente } from '@/lib/agent'

export const dynamic = 'force-dynamic'
// a IA leva alguns segundos para entender o pedido; com arquivo ou link (PDF lido pela IA) pode passar de 1 minuto
export const maxDuration = 300

// a equipe não edita texto: pede para a IA (pedir/corrigir) e a IA muda o rascunho
const ACOES = ['pedir', 'corrigir', 'corrigir_real', 'desfazer', 'descartar', 'publicar', 'voltar']

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const exame = q.get('exame')
  const conversa = q.get('conversa')
  const rota = exame ? `/api/base?exame=${encodeURIComponent(exame)}`
    : q.get('conversas') ? '/api/base?conversas=1'
    : conversa ? `/api/base?conversa=${encodeURIComponent(conversa)}`
    : '/api/base'
  const { status, body } = await chamarAgente(rota)
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (!ACOES.includes(String(b.acao))) return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
  const { status, body } = await chamarAgente('/api/base', { method: 'POST', body: b, timeoutMs: b.acao === 'pedir' ? 280_000 : 110_000 })
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
