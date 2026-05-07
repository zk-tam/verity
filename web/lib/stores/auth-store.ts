import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthWallet {
  address: string;
  chain_type: string;
  privy_wallet_id: string | null;
  wallet_client: string | null;
  wallet_client_type: string | null;
  connector_type: string | null;
}

export interface User {
  id: string;
  privy_id: string;
  privy_did?: string;
  name?: string | null;
  email?: string | null;
  x_handle?: string | null;
  image?: string | null;
  role?: string | null;
  solana_address?: string | null;
  embedded_address?: string | null;
  embedded_wallet_id?: string | null;
  wallet?: AuthWallet | null;
  referral_code?: string | null;
  referrer_privy_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isNewUser: boolean;

  setAuth: (user: User, isNewUser?: boolean) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  getToken: () => Promise<string | null>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      isNewUser: false,

      setAuth: (user, isNewUser = false) =>
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
          isNewUser,
        }),

      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          isNewUser: false,
        }),

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error, isLoading: false }),

      getToken: async () => null,
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        isNewUser: state.isNewUser,
      }),
    }
  )
);
