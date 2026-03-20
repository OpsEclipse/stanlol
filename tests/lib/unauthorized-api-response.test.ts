import assert from "node:assert/strict";
import test from "node:test";

const {
  DEFAULT_UNAUTHENTICATED_API_MESSAGE,
  DEFAULT_UNAUTHORIZED_API_MESSAGE,
  createProtectedApiAuthErrorResponse,
  unauthenticatedApiResponse,
  unauthorizedApiResponse,
} = await import(new URL("../../lib/unauthorized-api-response.ts", import.meta.url).href);

test("unauthenticatedApiResponse returns the standard 401 JSON envelope", async () => {
  const response = unauthenticatedApiResponse();

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    error: DEFAULT_UNAUTHENTICATED_API_MESSAGE,
  });
});

test("unauthorizedApiResponse returns the standard 403 JSON envelope", async () => {
  const response = unauthorizedApiResponse();

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    success: false,
    error: DEFAULT_UNAUTHORIZED_API_MESSAGE,
  });
});

test("protected auth error responses accept custom messages and preserve response init", async () => {
  const response = createProtectedApiAuthErrorResponse(
    "unauthorized",
    "Workspace access denied.",
    {
      headers: {
        "x-stanlol-test": "true",
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("x-stanlol-test"), "true");
  assert.deepEqual(await response.json(), {
    success: false,
    error: "Workspace access denied.",
  });
});

test("protected auth error responses respect an explicit status override", async () => {
  const response = createProtectedApiAuthErrorResponse("unauthenticated", undefined, {
    status: 499,
  });

  assert.equal(response.status, 499);
  assert.deepEqual(await response.json(), {
    success: false,
    error: DEFAULT_UNAUTHENTICATED_API_MESSAGE,
  });
});
