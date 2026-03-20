export const SUPABASE_URL_ENV_NAME = "NEXT_PUBLIC_SUPABASE_URL";
export const STORAGE_OBJECT_PUBLIC_PATH = "/storage/v1/object/public";
export const STORAGE_IMAGE_RENDER_PATH = "/storage/v1/render/image/public";

export interface StorageAssetReference {
  bucket: string;
  path: string;
}

export interface StorageAssetUrlOptions {
  baseUrl?: string;
  download?: boolean | string;
}

export interface StorageAssetPreviewOptions extends StorageAssetUrlOptions {
  height?: number;
  quality?: number;
  width?: number;
}

function readSupabaseUrl(baseUrl?: string): URL {
  const candidate = baseUrl?.trim() || process.env[SUPABASE_URL_ENV_NAME]?.trim();

  if (!candidate) {
    throw new Error(`Missing required environment variable: ${SUPABASE_URL_ENV_NAME}`);
  }

  try {
    return new URL(candidate);
  } catch {
    throw new Error("Supabase URL must be a valid absolute URL.");
  }
}

function normalizePathSegment(value: string, fieldName: string): string {
  const normalizedValue = value.trim().replace(/^\/+|\/+$/g, "");

  if (!normalizedValue) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return normalizedValue
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function setDownloadParam(url: URL, download?: boolean | string): void {
  if (download === undefined || download === false) {
    return;
  }

  if (download === true) {
    url.searchParams.set("download", "");
    return;
  }

  const normalizedFilename = download.trim();

  if (!normalizedFilename) {
    throw new Error("Download filename must be a non-empty string.");
  }

  url.searchParams.set("download", normalizedFilename);
}

function setPositiveIntegerParam(url: URL, key: string, value?: number): void {
  if (value === undefined) {
    return;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer.`);
  }

  url.searchParams.set(key, String(value));
}

function buildStorageAssetUrl(
  asset: StorageAssetReference,
  storagePath: string,
  options: StorageAssetUrlOptions,
): URL {
  const baseUrl = readSupabaseUrl(options.baseUrl);
  const bucket = normalizePathSegment(asset.bucket, "Storage bucket");
  const path = normalizePathSegment(asset.path, "Storage asset path");
  const url = new URL(`${storagePath}/${bucket}/${path}`, baseUrl);

  setDownloadParam(url, options.download);

  return url;
}

export function createStorageAssetUrl(
  asset: StorageAssetReference,
  options: StorageAssetUrlOptions = {},
): string {
  return buildStorageAssetUrl(asset, STORAGE_OBJECT_PUBLIC_PATH, options).toString();
}

export function createStorageAssetPreviewUrl(
  asset: StorageAssetReference,
  options: StorageAssetPreviewOptions = {},
): string {
  const url = buildStorageAssetUrl(asset, STORAGE_IMAGE_RENDER_PATH, options);

  setPositiveIntegerParam(url, "width", options.width);
  setPositiveIntegerParam(url, "height", options.height);
  setPositiveIntegerParam(url, "quality", options.quality);

  return url.toString();
}
