import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const storageAssetUrlModule = (await import(
  new URL("../../lib/storage-asset-url.ts", import.meta.url).href
)) as typeof import("../../lib/storage-asset-url");
const {
  SUPABASE_URL_ENV_NAME,
  createStorageAssetPreviewUrl,
  createStorageAssetUrl,
} = storageAssetUrlModule;

const originalSupabaseUrl = process.env[SUPABASE_URL_ENV_NAME];

afterEach(() => {
  if (originalSupabaseUrl === undefined) {
    delete process.env[SUPABASE_URL_ENV_NAME];
    return;
  }

  process.env[SUPABASE_URL_ENV_NAME] = originalSupabaseUrl;
});

test("createStorageAssetUrl builds a public object URL from the configured Supabase base URL", () => {
  process.env[SUPABASE_URL_ENV_NAME] = "https://project.supabase.co/";

  const url = createStorageAssetUrl({
    bucket: "draft-assets",
    path: "/threads/thread 1/hero image.png/",
  });

  assert.equal(
    url,
    "https://project.supabase.co/storage/v1/object/public/draft-assets/threads/thread%201/hero%20image.png",
  );
});

test("createStorageAssetPreviewUrl builds an encoded render URL with preview parameters", () => {
  const url = createStorageAssetPreviewUrl(
    {
      bucket: "draft-assets",
      path: "threads/thread-1/preview image.png",
    },
    {
      baseUrl: "https://assets.example.com",
      download: "draft-preview.png",
      height: 360,
      quality: 80,
      width: 640,
    },
  );

  assert.equal(
    url,
    "https://assets.example.com/storage/v1/render/image/public/draft-assets/threads/thread-1/preview%20image.png?download=draft-preview.png&width=640&height=360&quality=80",
  );
});

test("createStorageAssetPreviewUrl supports boolean download flags", () => {
  process.env[SUPABASE_URL_ENV_NAME] = "https://project.supabase.co";

  const url = createStorageAssetPreviewUrl(
    {
      bucket: "draft-assets",
      path: "threads/thread-1/preview.png",
    },
    {
      download: true,
    },
  );

  assert.equal(
    url,
    "https://project.supabase.co/storage/v1/render/image/public/draft-assets/threads/thread-1/preview.png?download=",
  );
});

test("storage asset URL helpers reject missing Supabase configuration", () => {
  delete process.env[SUPABASE_URL_ENV_NAME];

  assert.throws(
    () =>
      createStorageAssetUrl({
        bucket: "draft-assets",
        path: "threads/thread-1/preview.png",
      }),
    (error: unknown) => {
      assert(error instanceof Error);
      assert.equal(error.message, `Missing required environment variable: ${SUPABASE_URL_ENV_NAME}`);
      return true;
    },
  );
});

test("storage asset URL helpers reject invalid asset references and preview parameters", () => {
  assert.throws(
    () =>
      createStorageAssetUrl(
        {
          bucket: "   ",
          path: "threads/thread-1/preview.png",
        },
        {
          baseUrl: "https://project.supabase.co",
        },
      ),
    (error: unknown) => {
      assert(error instanceof Error);
      assert.equal(error.message, "Storage bucket must be a non-empty string.");
      return true;
    },
  );

  assert.throws(
    () =>
      createStorageAssetPreviewUrl(
        {
          bucket: "draft-assets",
          path: "threads/thread-1/preview.png",
        },
        {
          baseUrl: "https://project.supabase.co",
          width: 0,
        },
      ),
    (error: unknown) => {
      assert(error instanceof Error);
      assert.equal(error.message, "width must be a positive integer.");
      return true;
    },
  );

  assert.throws(
    () =>
      createStorageAssetPreviewUrl(
        {
          bucket: "draft-assets",
          path: "threads/thread-1/preview.png",
        },
        {
          baseUrl: "https://project.supabase.co",
          download: "   ",
        },
      ),
    (error: unknown) => {
      assert(error instanceof Error);
      assert.equal(error.message, "Download filename must be a non-empty string.");
      return true;
    },
  );
});
