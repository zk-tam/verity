// 'use client'

// import { useState, useEffect } from 'react'
// import { Key, X } from 'lucide-react'
// import { useSessionSigner } from '@/hooks/use-session-signer'
// import { usePrivy } from '@privy-io/react-auth'
// import { SessionSignerDialog } from './session-signer-dialog'

// export function SessionSignerPrompt() {
//   const { authenticated, user } = usePrivy()
//   const { hasSessionSigner, isLoading } = useSessionSigner()
//   const [isDismissed, setIsDismissed] = useState(false)
//   const [isVisible, setIsVisible] = useState(false)

//   // Load dismissed state from localStorage
//   useEffect(() => {
//     const dismissed = localStorage.getItem('session-signer-prompt-dismissed')
//     if (dismissed === 'true') {
//       setIsDismissed(true)
//     }
//   }, [])

//   // Show animation when component should be visible
//   useEffect(() => {
//     const shouldShow = authenticated && 
//                      !hasSessionSigner && 
//                      !isDismissed && 
//                      !isLoading && 
//                      user?.wallet?.delegated !== true
    
//     if (shouldShow) {
//       // Small delay for smooth entrance
//       const timer = setTimeout(() => setIsVisible(true), 100)
//       return () => clearTimeout(timer)
//     } else {
//       setIsVisible(false)
//     }
//   }, [authenticated, hasSessionSigner, isDismissed, isLoading, user?.wallet?.delegated])

//   const handleDismiss = () => {
//     // Don't allow dismissing, open the dialog instead
//     const enableButton = document.querySelector('[aria-label="Enable Session Signer"]') as HTMLButtonElement;
//     if (enableButton) {
//       enableButton.click();
//     }
//   }

//   // Reset dismissed state when user gets session signer
//   useEffect(() => {
//     if (hasSessionSigner) {
//       localStorage.removeItem('session-signer-prompt-dismissed')
//     }
//   }, [hasSessionSigner])

//   // Don't render if not needed
//   if (!authenticated || hasSessionSigner || isDismissed || isLoading || user?.wallet?.delegated === true) {
//     return null
//   }

//   return (
//     <div className={`fixed bottom-0 left-0 right-0 z-50 p-4 transition-all duration-500 transform ${
//       isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
//     }`}>
//       <div className="mx-auto max-w-[1600px]">
//         <div className="h-14 rounded-[50px] bg-gradient-to-l from-[hsl(var(--glass-gradient-start))]/40 to-[hsl(var(--glass-gradient-end))]/40 backdrop-blur-md backdrop-saturate-150 border border-white/20 shadow-[0_4px_8px_rgba(0,0,0,0.08),inset_0_1px_2px_rgba(255,255,255,0.1)]">
//           <div className="h-full px-6 flex items-center justify-between gap-4">
//             <div className="flex items-center gap-3">
//               <div className="p-1.5 bg-white/10 rounded-lg">
//                 <Key className="w-4 h-4 text-white" />
//               </div>
//               <div className="text-white">
//                 <p className="font-medium text-sm">Enable Session Signer</p>
//                 <p className="text-xs text-white/80">
//                   Perform transactions without repeated approvals
//                 </p>
//               </div>
//             </div>
            
//             <div className="flex items-center gap-2">
//               <SessionSignerDialog>
//                 <button 
//                   className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white font-medium text-sm rounded-full transition-colors backdrop-blur-sm border border-white/20"
//                   aria-label="Enable Session Signer"
//                 >
//                   Enable Now
//                 </button>
//               </SessionSignerDialog>
              
//               <button
//                 onClick={handleDismiss}
//                 className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
//                 aria-label="Dismiss"
//               >
//                 <X className="w-4 h-4 text-white/80 hover:text-white" />
//               </button>
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>
//   )
// }