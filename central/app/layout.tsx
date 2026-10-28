import type { Metadata } from 'next'
import { JetBrains_Mono, Manrope, Space_Grotesk } from 'next/font/google'
import './globals.css'

const display = Manrope({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-syne' })
const grotesk = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-grotesk' })
const jet = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-jet' })

export const metadata: Metadata = {
  title: 'Central de IA · Monteiro & Lins',
  description: 'A Lia, assistente virtual do escritório Monteiro & Lins Advocacia, ao vivo: contracheques analisados, reuniões marcadas, passagens para a equipe e custos',
  robots: { index: false, follow: false },
}

// Antes do primeiro paint: aplica o tema salvo (ou o do sistema) — sem "flash" de tema errado
const TEMA_INICIAL = `(function(){try{var t=localStorage.getItem('tema');
if(!t)t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning className={`${display.variable} ${grotesk.variable} ${jet.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: TEMA_INICIAL }} /></head>
      <body className="font-space antialiased">{children}</body>
    </html>
  )
}
