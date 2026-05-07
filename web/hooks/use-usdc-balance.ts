import { create } from "zustand";

interface USDCBalanceStore {
  balance: number;
  addBalance: (amount: number) => void;
  setBalance: (amount: number) => void;
}

const useUSDCBalanceStore = create<USDCBalanceStore>((set) => ({
  balance: 0,
  addBalance: (amount) => set((state) => ({ balance: state.balance + amount })),
  setBalance: (balance) => set({ balance }),
}));

export function useUSDCBalance() {
  const { balance, addBalance, setBalance } = useUSDCBalanceStore();

  return {
    balance: balance.toFixed(2),
    balanceNum: balance,
    isLoading: false,
    error: null,
    addBalance,
    setBalance,
    refetch: () => Promise.resolve(),
  };
}
