'use client'

import { ReactNode } from 'react'
import Link from 'next/link'

interface SidebarMenuButtonProps {
  href: string
  children: ReactNode
  icon?: ReactNode
  isActive?: boolean
  onClick?: () => void
}

export function SidebarMenuButton({
  href,
  children,
  icon,
  isActive = false,
  onClick
}: SidebarMenuButtonProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group relative block overflow-hidden rounded-md px-3 py-2 text-sm font-medium transition-all ${
        isActive
          ? 'bg-accent/10 text-accent-foreground'
          : 'text-foreground hover:text-accent-foreground'
      }`}
    >
      <div className={`absolute inset-0 bg-accent transition-transform ${
        isActive ? 'translate-x-0' : '-translate-x-full group-hover:translate-x-0'
      }`} />
      <div className="relative flex items-center gap-3">
        {icon && (
          <span className="flex-shrink-0 w-5 h-5">
            {icon}
          </span>
        )}
        <span>{children}</span>
      </div>
    </Link>
  )
}