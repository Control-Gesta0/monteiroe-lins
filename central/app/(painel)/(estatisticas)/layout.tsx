import StatsNav from '@/components/StatsNav'

export default function EstatisticasLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StatsNav />
      {children}
    </>
  )
}
