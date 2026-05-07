import { useAuthStore } from '@/lib/stores/auth-store'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '/api'

interface ApiClientOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: unknown
  headers?: Record<string, string>
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Client-side API client for making authenticated requests
export async function apiClient<T = unknown>(
  endpoint: string, 
  options: ApiClientOptions = {}
): Promise<T> {
  const { getToken } = useAuthStore.getState()
  
  // Get fresh token from Privy
  const token = await getToken()
  
  if (!token) {
    throw new ApiError('Not authenticated', 401)
  }
  
  const { method = 'GET', body, headers = {} } = options
  
  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  
  const data = await response.json().catch(() => null) as T | null
  
  if (!response.ok) {
    const errorData = data as { error?: string; message?: string; code?: string; details?: unknown } | null
    throw new ApiError(
      errorData?.error || errorData?.message || 'Request failed',
      response.status,
      errorData?.code,
      errorData?.details
    )
  }
  
  return data as T
}

// Hook for using the API client with React Query
export function useApiClient() {
  const { isAuthenticated } = useAuthStore()
  
  return {
    apiClient,
    isAuthenticated,
  }
}
