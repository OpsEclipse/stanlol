import assert from "node:assert/strict";
import test from "node:test";

const {
  DEFAULT_ERROR_MESSAGE,
  createJsonResponse,
  jsonError,
  jsonSuccess,
  toErrorMessage,
} = await import(new URL("../../lib/json-response.ts", import.meta.url).href);

test("createJsonResponse preserves the provided envelope and status", async () => {
  const response = createJsonResponse(
    {
      success: true,
      data: { id: "draft-123" },
    },
    {
      status: 202,
      headers: {
        "x-stanlol-test": "true",
      },
    },
  );

  assert.equal(response.status, 202);
  assert.equal(response.headers.get("x-stanlol-test"), "true");
  assert.deepEqual(await response.json(), {
    success: true,
    data: { id: "draft-123" },
  });
});

test("jsonSuccess returns a 200 response with the success envelope", async () => {
  const response = jsonSuccess({ threadId: "thread-456" });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    data: { threadId: "thread-456" },
  });
});

test("jsonSuccess omits the data field when no payload is provided", async () => {
  const response = jsonSuccess();

  assert.deepEqual(await response.json(), {
    success: true,
  });
});

test("jsonError defaults to a 500 response and normalizes Error instances", async () => {
  const response = jsonError(new Error("Voice import failed."));

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    success: false,
    error: "Voice import failed.",
  });
});

test("jsonError accepts a custom status and string error message", async () => {
  const response = jsonError("Validation failed.", { status: 400 });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: "Validation failed.",
  });
});

test("toErrorMessage falls back for empty or unknown values", () => {
  assert.equal(toErrorMessage("   "), DEFAULT_ERROR_MESSAGE);
  assert.equal(toErrorMessage(new Error("")), DEFAULT_ERROR_MESSAGE);
  assert.equal(toErrorMessage({ detail: "missing" }), DEFAULT_ERROR_MESSAGE);
});
