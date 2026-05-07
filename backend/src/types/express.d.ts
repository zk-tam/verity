declare global {
  namespace Express {
    interface Request {
      body: any;
      headers: any;
      method: string;
      path: string;
      params: any;
      query: any;
      setTimeout: (msecs: number) => void;

      user?: {
        id: string;
        role: "user" | "admin";
        isAdmin: boolean;
        privy_did: string;
        solana_address?: string;
        wallet?: {
          address: string;
          chain_type: string;
          privy_wallet_id: string | null;
          wallet_client: string | null;
          wallet_client_type: string | null;
          connector_type: string | null;
        };
        email?: string;
      };
    }
  }
}

export type Request = Express.Request;
