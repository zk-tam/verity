import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface LiquidGlassProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'lg'
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
}

export function LiquidGlass({
  children,
  className,
  padding = 'md',
  rounded = 'lg',
  ...props
}: LiquidGlassProps) {
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
        'bg-white/20 backdrop-blur-sm',
        'border border-white/20',
        'shadow-lg',
        'before:absolute before:inset-0',
        'before:bg-gradient-to-br before:from-white/10 before:to-transparent',
        'before:pointer-events-none',
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