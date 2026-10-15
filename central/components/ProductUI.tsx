import type { LucideIcon } from 'lucide-react'

export function PageIntro({
  eyebrow, title, accent, description, action,
}: {
  eyebrow: string
  title: string
  accent?: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <header className="flex items-end justify-between gap-6 flex-wrap pb-6 border-b border-line-soft">
      <div className="max-w-[720px]">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan mb-3">{eyebrow}</div>
        <h1 className="font-impact font-bold text-[29px] md:text-[38px] leading-[1.08] tracking-[-0.025em] text-ink">
          {title} {accent && <span className="text-gradient-cyan">{accent}</span>}
        </h1>
        <p className="text-body-mid text-[14px] md:text-[15px] leading-relaxed mt-3">{description}</p>
      </div>
      {action}
    </header>
  )
}

export function Metric({
  icon: Icon, label, value, hint, color = '#06b6d4', featured = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
  color?: string
  featured?: boolean
}) {
  return (
    <div className={`metric-card min-w-0 overflow-hidden ${featured ? 'metric-card-featured' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="metric-icon" style={{ color, background: `${color}12`, borderColor: `${color}30` }}>
          <Icon size={15} strokeWidth={2} />
        </span>
        {featured && <span className="font-mono text-[8.5px] tracking-[0.14em] text-success">DESTAQUE</span>}
      </div>
      <div className="font-impact font-bold text-[23px] md:text-[28px] leading-none tracking-[-0.025em] text-ink mt-5 tabular-nums break-words">{value}</div>
      <div className="text-[12.5px] font-medium text-body-light mt-2">{label}</div>
      {hint && <div className="font-mono text-[9.5px] leading-relaxed text-body-faint mt-1.5">{hint}</div>}
    </div>
  )
}

export function SectionTitle({ eyebrow, title, description, action }: {
  eyebrow: string; title: string; description?: string; action?: React.ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
      <div>
        <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-body-muted mb-2">{eyebrow}</div>
        <h2 className="font-impact font-bold text-[20px] md:text-[24px] tracking-[-0.02em] text-ink">{title}</h2>
        {description && <p className="text-body-mid text-[13px] mt-1.5">{description}</p>}
      </div>
      {action}
    </div>
  )
}
