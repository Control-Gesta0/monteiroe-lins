import Sidebar from '@/components/Sidebar'
import CentralCommand from '@/components/CentralCommand'

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const demo = process.env.CENTRAL_DEMO === '1'
  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <main className="flex-1 min-w-0 px-4 py-6 md:px-7 md:py-8 xl:px-10 max-w-[1440px]">
        {demo && (
          <div className="mb-6 rounded-[8px] border border-warning/30 bg-warning/[0.08] px-4 py-3 text-[12px] text-warning">
            Modo demonstração: os números abaixo são fictícios. Em produção, deixe CENTRAL_DEMO vazio.
          </div>
        )}
        {children}
      </main>
      <CentralCommand />
    </div>
  )
}
