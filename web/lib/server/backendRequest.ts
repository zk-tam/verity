export class BackendError extends Error {
  constructor(message: string, public code?: string, public details?: unknown) {
    super(message);
    this.name = "BackendError";
  }
}

export interface TokenData {
  token: string;
  key: "Authorization" | "Pairing-Authorization";
}

export default async function backendRequest<T = unknown>(
  tokenData: TokenData | null,
  url: string,
  method: string,
  params?: Record<string, unknown>,
  body?: unknown
): Promise<T> {
  const baseUrl = process.env.BACKEND_URL;

  const requestObj = buildRequestObj(tokenData, method, body);
  const finalUrl =
    method === "GET" && params
      ? `${baseUrl}${url}?${new URLSearchParams(
          params as Record<string, string>
        )}`
      : `${baseUrl}${url}`;
  const response = await fetch(finalUrl, requestObj);

  const result = (await response.json()) as {
    error?: string;
    code?: string;
    details?: unknown;
  } & T;

  if (result.error || result.code) {
    throw new BackendError(
      result.error || "Unknown error occurred",
      result.code,
      result.details
    );
  }

  return result as T;
}

const buildRequestObj = (
  tokenData: TokenData | null,
  method: string,
  body: unknown
) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };

  if (tokenData?.token) {
    headers[tokenData.key] = `Bearer ${tokenData.token}`;
  }

  const requestObj: RequestInit = {
    method: method,
    cache: "no-store",
    headers,
  };

  if (method !== "GET" && body) {
    requestObj.body = JSON.stringify(body);
  }

  return requestObj;
};
