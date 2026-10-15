import { NextResponse } from 'next/server'
import { lerAgente } from '@/lib/agent'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { status, body } = await lerAgente('execucoes')
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
