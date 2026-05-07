'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { usePrivy } from '@privy-io/react-auth'

export interface BatchBuybackParams {
  token_ids: number[]
}

export interface BatchBuybackResponse {
  token_ids: number[]
  total_amount_paid: number
  txHash: string
}

export function useBatchBuyback() {
  const { getAccessToken } = usePrivy()
  const queryClient = useQueryClient()

  const batchBuyback = async ({ token_ids }: BatchBuybackParams): Promise<BatchBuybackResponse> => {
    // Get Privy access token
    const privyToken = await getAccessToken();
    if (!privyToken) {
      throw new Error('Authentication required')
    }

    const response = await fetch('/api/buyback/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${privyToken}`,
      },
      body: JSON.stringify({ token_ids }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to sell cards')
    }

    return response.json()
  }

  return useMutation({
    mutationFn: batchBuyback,
    onError: (error: Error) => {
      console.error('Batch buyback error:', error)
      toast.error(error.message || 'Failed to sell cards')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usdc-balance'] })
    }
  })
}
