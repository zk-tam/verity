import { NextRequest } from "next/server";

import { TokenData } from "./backendRequest";

export const getAuthToken = (request: NextRequest): TokenData | null => {
  const tokenData: Partial<TokenData> = {};
  if (request.headers.get("authorization")) {
    tokenData.token = request.headers.get("authorization")?.startsWith("Bearer ")
      ? request.headers.get("authorization")?.substring(7)
      : request.headers.get("authorization") || "";
    tokenData.key = "Authorization";
  } else if (request.headers.get("Pairing-Authorization")) {
    tokenData.token = request.headers.get("Pairing-Authorization")?.startsWith("Bearer ")
      ? request.headers.get("Pairing-Authorization")?.substring(7)
      : request.headers.get("Pairing-Authorization") || "";
    tokenData.key = "Pairing-Authorization";
  }
  
  if (tokenData.token && tokenData.key) {
    return tokenData as TokenData;
  }
  
  return null;
}