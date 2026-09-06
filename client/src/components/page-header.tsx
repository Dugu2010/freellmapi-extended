import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-6 mb-6 border-b min-w-0">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight break-words">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
