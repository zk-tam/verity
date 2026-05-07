'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { usePrivy } from '@privy-io/react-auth'
import { AUDIO_IDS, AUDIO_PRESETS, useAudio } from '@/hooks/use-audio'

export interface BuybackParams {
  token_id: number
}

export interface BuybackResponse {
  buyback: {
    id: number
    collection_address: string
    token_id: number
    amount_given_buyback: number
    price_current_fmv: number
    privy_id: string
    created_at: string
    updated_at: string
  }
  buyback_tx_hash: string
  amount_paid: number
}

export function useBuyback() {
  const { getAccessToken } = usePrivy()
  const queryClient = useQueryClient()
  const { play } = useAudio({ cleanupOnUnmount: false })

  const buybackCard = async ({ token_id }: BuybackParams): Promise<BuybackResponse> => {
    // Get Privy access token
    const privyToken = await getAccessToken();
    if (!privyToken) {
      throw new Error('Authentication required')
    }

    const response = await fetch('/api/buyback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${privyToken}`,
      },
      body: JSON.stringify({ token_id }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to sell card')
    }

    return response.json()
  }

  return useMutation({
    mutationFn: buybackCard,
    onSuccess: (data: BuybackResponse) => {
      const preset = AUDIO_PRESETS.buybackSuccess
      play(AUDIO_IDS.BUYBACK_SUCCESS, preset.src, {
        volume: preset.volume,
      })
      toast.success(`Card sold successfully for $${data.amount_paid.toFixed(2)}`)
      // Invalidate holdings query to refresh inventory
      queryClient.invalidateQueries({ queryKey: ['holdings'] })
    },
    onError: (error: Error) => {
      console.error('Buyback error:', error)
      toast.error(error.message || 'Failed to sell card')
    },
  })
}
