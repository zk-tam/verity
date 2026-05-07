// 'use client'

// import { useState, useEffect } from 'react'
// import { Key, Loader } from 'lucide-react'
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogHeader,
//   DialogTitle,
//   DialogTrigger,
// } from '@/components/ui/dialog'
// import { Button } from '@/components/ui/button'
// import { useSessionSigner } from '@/hooks/use-session-signer'
// import { usePrivy } from '@privy-io/react-auth'

// interface SessionSignerDialogProps {
//   children?: React.ReactNode
// }

// export function SessionSignerDialog({ children }: SessionSignerDialogProps) {
//   const { authenticated, user } = usePrivy()
//   const { addSigner, hasSessionSigner, isLoading: isLoadingSession, error } = useSessionSigner()
//   const [isOpen, setIsOpen] = useState(false)

//   // Auto-open dialog when user is authenticated but doesn't have session signer
//   useEffect(() => {
//     if (authenticated && !hasSessionSigner && !isLoadingSession && user?.wallet?.delegated !== true) {
//       setIsOpen(true)
//     }
//   }, [authenticated, hasSessionSigner, isLoadingSession, user?.wallet?.delegated])

//   const handleAddSigner = async () => {
//     // TODO: Replace with your actual key quorum ID from Privy dashboard
//     const keyQuorumId = process.env.NEXT_PUBLIC_KEY_QUORUM_ID || 'your-key-quorum-id'
//     const signer = await addSigner(keyQuorumId)
//     if (signer) {
//       setIsOpen(false)
//     }
//   }

//   // Only allow closing if user has session signer
//   const handleOpenChange = (open: boolean) => {
//     // Always allow opening
//     if (open) {
//       setIsOpen(true)
//     } else {
//       // Only allow closing if user has session signer
//       if (hasSessionSigner) {
//         setIsOpen(false)
//       }
//     }
//   }

//   // If children provided, render with trigger
//   if (children) {
//     return (
//       <Dialog open={isOpen} onOpenChange={handleOpenChange}>
//         <DialogTrigger asChild>
//           {children}
//         </DialogTrigger>
//         <DialogContent onPointerDownOutside={(e) => !hasSessionSigner && e.preventDefault()}>
//           <DialogHeader>
//             <DialogTitle className="flex items-center gap-2">
//               <Key className="w-5 h-5" />
//               Make Your Experience Seamless
//             </DialogTitle>
//             <DialogDescription>
//               Enable one-click transactions for a smoother gaming experience
//             </DialogDescription>
//           </DialogHeader>

//           <div className="space-y-4">
//             {hasSessionSigner ? (
//               <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
//                 <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
//                   <Key className="w-4 h-4" />
//                   <span className="font-medium">All set! Your experience is now seamless</span>
//                 </div>
//                 <p className="text-sm text-green-600 dark:text-green-400 mt-1">
//                   You can now roll, buy, and sell without constant pop-ups asking for approval.
//                 </p>
//               </div>
//             ) : (
//               <>
//                 <div className="space-y-3">
//                   <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
//                     <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
//                       Why do we need this?
//                     </h4>
//                     <p className="text-sm text-blue-800 dark:text-blue-200">
//                       Right now, every time you want to roll for cards or make a purchase,
//                       you need to approve each transaction. This creates a smoother experience
//                       by reducing those interruptions while keeping your wallet secure.
//                     </p>
//                   </div>

//                   <div className="space-y-2">
//                     <h4 className="font-medium">What you&apos;ll enjoy:</h4>
//                     <ul className="text-sm text-muted-foreground space-y-1">
//                       <li>• Roll for cards without approval pop-ups</li>
//                       <li>• Buy and sell cards instantly</li>
//                       <li>• Faster, uninterrupted gameplay</li>
//                       <li>• Your wallet stays completely secure</li>
//                     </ul>
//                   </div>
//                 </div>

//                 {error && (
//                   <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
//                     <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
//                   </div>
//                 )}

//                 <div className="flex">
//                   <Button
//                     className="w-full"
//                     onClick={handleAddSigner}
//                     disabled={isLoadingSession}
//                   >
//                     {isLoadingSession ? (
//                       <>
//                         <Loader className="w-4 h-4 animate-spin mr-2" />
//                         Setting up...
//                       </>
//                     ) : (
//                       'Enable Seamless Experience'
//                     )}
//                   </Button>
//                 </div>
//               </>
//             )}
//           </div>
//         </DialogContent>
//       </Dialog>
//     )
//   }

//   // Auto-open dialog without trigger
//   return (
//     <Dialog open={isOpen} onOpenChange={handleOpenChange}>
//       <DialogContent onPointerDownOutside={(e) => !hasSessionSigner && e.preventDefault()}>
//         <DialogHeader>
//           <DialogTitle className="flex items-center gap-2">
//             <Key className="w-5 h-5" />
//             Make Your Experience Seamless
//           </DialogTitle>
//           <DialogDescription>
//             Enable one-click transactions for a smoother experience
//           </DialogDescription>
//         </DialogHeader>

//         <div className="space-y-4">
//           {hasSessionSigner ? (
//             <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
//               <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
//                 <Key className="w-4 h-4" />
//                 <span className="font-medium">All set! Your experience is now seamless</span>
//               </div>
//               <p className="text-sm text-green-600 dark:text-green-400 mt-1">
//                 You can now roll, buy, and sell without constant pop-ups asking for approval.
//               </p>
//             </div>
//           ) : (
//             <>
//               <div className="space-y-3">
//                 <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
//                   <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
//                     Why do we need this?
//                   </h4>
//                   <p className="text-sm text-blue-800 dark:text-blue-200">
//                     Right now, every time you want to roll for cards or make a purchase,
//                     you need to approve each transaction. This creates a smoother experience
//                     by reducing those interruptions while keeping your wallet secured by Privy.
//                   </p>
//                 </div>

//                 <div className="space-y-2">
//                   <h4 className="font-medium">What you&apos;ll enjoy:</h4>
//                   <ul className="text-sm text-muted-foreground space-y-1">
//                     <li>• Roll for cards without approval pop-ups</li>
//                     <li>• Buy and sell cards instantly</li>
//                     <li>• Faster, uninterrupted</li>
//                     <li>• Your wallet stays completely secured by Privy</li>
//                   </ul>
//                 </div>
//               </div>

//               {error && (
//                 <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
//                   <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
//                 </div>
//               )}

//               <div className="flex">
//                 <Button
//                   className="w-full"
//                   onClick={handleAddSigner}
//                   disabled={isLoadingSession}
//                 >
//                   {isLoadingSession ? (
//                     <>
//                       <Loader className="w-4 h-4 animate-spin mr-2" />
//                       Setting up...
//                     </>
//                   ) : (
//                     'Enable Seamless Experience'
//                   )}
//                 </Button>
//               </div>
//             </>
//           )}
//         </div>
//       </DialogContent>
//     </Dialog>
//   )
// }