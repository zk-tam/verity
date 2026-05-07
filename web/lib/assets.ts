const storageBaseUrl = process.env.NEXT_PUBLIC_STORAGE_BASE_URL?.replace(
  /\/$/,
  "",
);

export function assetUrl(path: string) {
  const normalizedPath = path.replace(/^\/+/, "");
  return storageBaseUrl ? `${storageBaseUrl}/${normalizedPath}` : `/${normalizedPath}`;
}

export function staticAssetUrl(path: string) {
  return assetUrl(`static/${path.replace(/^\/+/, "")}`);
}

export function audioAssetUrl(path: string) {
  return assetUrl(`audio/${path.replace(/^\/+/, "")}`);
}
