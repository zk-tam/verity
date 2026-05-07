import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface GradientLiquidGlassProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'lg'
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
}

export function GradientLiquidGlass({
  children,
  className,
  padding = 'md',
  rounded = 'lg',
  ...props
}: GradientLiquidGlassProps) {
  const paddingClasses = {
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-8'
  }

  const roundedClasses = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    full: 'rounded-full'
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        // Multi-gradient background
        'bg-gradient-to-br',
        'before:absolute before:inset-0',
        'before:bg-[linear-gradient(270deg,rgba(221,255,174,0.8)_0%,rgba(147,191,80,0.8)_20%,rgba(75,204,255,0.8)_100%,transparent_100%),linear-gradient(180deg,rgba(255,214,111,0.7)_0%,rgba(255,255,255,0.7)_20%,transparent_60%)]',
        'before:pointer-events-none',
        // Glass morphism effects
        'backdrop-blur-md backdrop-saturate-150',
        'border border-white/20',
        'shadow-lg',
        paddingClasses[padding],
        roundedClasses[rounded],
        className
      )}
      {...props}
    >
      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}