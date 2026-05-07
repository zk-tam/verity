'use client'

import { useAuthSync } from '@/hooks/use-auth-sync'
import { ReactNode, useEffect } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useAuthStore } from '@/lib/stores/auth-store'

export function AuthSyncProvider({ children }: { children: ReactNode }) {
  const { getAccessToken } = usePrivy()
  
  // Inject the getToken function into the store
  useEffect(() => {
    useAuthStore.setState({
      getToken: getAccessToken
    })
  }, [getAccessToken])
  
  // This will handle the auth sync automatically
  useAuthSync()
  
  return <>{children}</>
}