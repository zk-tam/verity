import { useState } from 'react'
import { usePrivy, useSessionSigners, WalletWithMetadata } from '@privy-io/react-auth'

export function useSessionSigner() {
  const { user } = usePrivy()
  const { addSessionSigners } = useSessionSigners()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const embeddedWallet = user?.linkedAccounts.find((account) => account.type === 'wallet' && account.connectorType === 'embedded') as WalletWithMetadata;

  const addSigner = async (keyQuorumId: string, policyIds: string[] = []) => {
    if (!embeddedWallet?.address) {
      setError('No wallet connected')
      return null
    }

    try {
      setIsLoading(true)
      setError(null)

      const result = await addSessionSigners({
        address: embeddedWallet.address,
        signers: [{
          signerId: keyQuorumId,
          policyIds: policyIds
        }]
      })

      return result
    } catch (err) {
      console.error('Error adding session signer:', err)
      setError(err instanceof Error ? err.message : 'Failed to add session signer')
      return null
    } finally {
      setIsLoading(false)
    }
  }

  const hasSessionSigner = embeddedWallet && !!embeddedWallet.delegated;

  return {
    addSigner,
    hasSessionSigner,
    isLoading,
    error,
    signers: (user?.wallet as any)?.signers || [],
  }
}