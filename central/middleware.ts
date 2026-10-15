import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_SESSAO, configAuth, tokenValido } from '@/lib/auth'

/** Tudo exige sessão, inclusive /api (os dados do painel passam por lá). */
export async function middleware(req: NextRequest) {
  const config = configAuth()
  const autenticado = config ? await tokenValido(req.cookies.get(COOKIE_SESSAO)?.value, config) : false
  const { pathname, search } = req.nextUrl

  if (pathname === '/login') {
    return autenticado ? NextResponse.redirect(new URL('/', req.url)) : NextResponse.next()
  }
  if (autenticado) return NextResponse.next()
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'não autenticado' }, { status: 401 })
  const url = new URL('/login', req.url)
  if (pathname !== '/') url.searchParams.set('de', `${pathname}${search}`)
  return NextResponse.redirect(url)
}

export const config = {
  // Imagens públicas (logo, ícone) ficam fora: a tela de login precisa delas sem sessão
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|svg|webp|ico)$).*)'],
}
