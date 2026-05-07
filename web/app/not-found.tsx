'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NotFound() {
  const router = useRouter()

  useEffect(() => {
    router.push('/explore')
  }, [router])

  return (
    <div className="flex items-center justify-center h-[80vh]">
      <div className="text-white text-center">
        <h1 className="text-4xl font-bold" style={{ textShadow: '0 0 10px rgba(255, 255, 255, 0.3)' }}>Page Not Found</h1>
        <p className="text-lg" style={{ textShadow: '0 0 10px rgba(255, 255, 255, 0.3)' }}>The page you are looking for does not exist.</p>
      </div>
    </div>
  )
}