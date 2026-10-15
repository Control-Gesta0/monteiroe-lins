import { Suspense } from 'react'
import Logo from '@/components/Logo'
import FormLogin from './form'

export const metadata = { title: 'Entrar · Central de IA' }

export default function Login() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-[380px] panel p-7">
        <Logo altura={40} />
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-body-muted mt-3">Central de Inteligência</div>
        <h1 className="font-impact font-bold text-[22px] text-ink mt-7">Lia · Monteiro & Lins Advocacia</h1>
        <p className="text-[12.5px] text-body-mid mt-1.5 mb-6">Acesso da equipe do escritório e da Control Gestão.</p>
        <Suspense><FormLogin /></Suspense>
      </div>
    </main>
  )
}
