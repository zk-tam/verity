// import { useEffect, useState } from 'react'
// import { usePrivy } from '@privy-io/react-auth'
// import { ethers } from 'ethers'
// import { useAuthStore } from '@/lib/stores/auth-store'

// export function useAVAXBalance() {
//   const { ready, authenticated } = usePrivy()
//   const { user: authUser } = useAuthStore()
//   const [balance, setBalance] = useState<string>('0.00')
//   const [isLoading, setIsLoading] = useState(true)
//   const [error, setError] = useState<string | null>(null)

//   const fetchBalance = async () => {
//     if (!ready || !authenticated || !authUser?.wallet_address) {
//       setIsLoading(false)
//       return
//     }

//     try {
//       setIsLoading(true)
//       setError(null)

//       const provider = new ethers.JsonRpcProvider(
//         process.env.NEXT_PUBLIC_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc'
//       )

//       // Get AVAX balance (native token)
//       const balanceWei = await provider.getBalance(authUser.wallet_address)

//       // Format balance from wei to human-readable format (AVAX has 18 decimals)
//       const balanceFormatted = ethers.formatEther(balanceWei)

//       // Format to 4 decimal places for AVAX
//       const balanceNumber = parseFloat(balanceFormatted)
//       setBalance(balanceNumber.toFixed(4))
//     } catch (err) {
//       console.error('Error fetching AVAX balance:', err)
//       setError(err instanceof Error ? err.message : 'Failed to fetch balance')
//       setBalance('0.0000')
//     } finally {
//       setIsLoading(false)
//     }
//   }

//   useEffect(() => {
//     fetchBalance()
//   }, [ready, authenticated, authUser?.wallet_address])

//   // Set up polling for balance updates every 30 seconds
//   useEffect(() => {
//     if (!ready || !authenticated || !authUser?.wallet_address) {
//       return
//     }

//     const interval = setInterval(() => {
//       fetchBalance()
//     }, 30000) // 30 seconds

//     return () => clearInterval(interval)
//   }, [ready, authenticated, authUser?.wallet_address])

//   return { balance, isLoading, error, refetch: fetchBalance }
// }