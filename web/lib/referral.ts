const STORAGE_KEY = "pending_referral_code";
const TTL_MS = 3 * 24 * 60 * 60 * 1000;

type StoredReferral = {
  code: string;
  expiresAt: number;
};

const safeGetStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const parseStored = (raw: string | null): StoredReferral | null => {
  if (!raw) return null;
  if (!raw.startsWith("{")) {
    return { code: raw, expiresAt: Date.now() + TTL_MS };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredReferral>;
    if (
      typeof parsed?.code === "string" &&
      parsed.code.length > 0 &&
      typeof parsed.expiresAt === "number" &&
      parsed.expiresAt > Date.now()
    ) {
      return { code: parsed.code, expiresAt: parsed.expiresAt };
    }
    return null;
  } catch {
    return null;
  }
};

export const storeReferralCode = (code: string | null | undefined): void => {
  if (!code) return;
  const storage = safeGetStorage();
  if (!storage) return;
  try {
    const payload: StoredReferral = {
      code,
      expiresAt: Date.now() + TTL_MS,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // private mode / quota — ignore
  }
};

export const peekReferralCode = (): string | null => {
  const storage = safeGetStorage();
  if (!storage) return null;
  try {
    const parsed = parseStored(storage.getItem(STORAGE_KEY));
    return parsed?.code ?? null;
  } catch {
    return null;
  }
};

export const consumeReferralCode = (): string | null => {
  const storage = safeGetStorage();
  if (!storage) return null;
  try {
    const parsed = parseStored(storage.getItem(STORAGE_KEY));
    storage.removeItem(STORAGE_KEY);
    return parsed?.code ?? null;
  } catch {
    return null;
  }
};

export const clearReferralCode = (): void => {
  const storage = safeGetStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};
