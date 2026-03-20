import * as assert from "node:assert/strict";
import { afterEach, test } from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
process.env.OPENAI_API_KEY = "test-openai-key";

const originalFetch = globalThis.fetch;

async function loadAiModule() {
  return import("../../lib/ai");
}

function createJsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("createOpenAiResponse sends a Responses API request with default configuration", async () => {
  const { DEFAULT_OPENAI_MODEL, createOpenAiResponse } = await loadAiModule();
  const calls: Array<{ init?: RequestInit; input: RequestInfo | URL }> = [];

  globalThis.fetch = async (input, init) => {
    calls.push({ init, input });

    return createJsonResponse({
      id: "resp_default",
      model: DEFAULT_OPENAI_MODEL,
      output_text: "Draft text",
    });
  };

  const response = await createOpenAiResponse({
    input: "Write a LinkedIn draft about testing.",
  });

  assert.equal(response.id, "resp_default");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "https://api.openai.com/v1/responses");

  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get("authorization"), "Bearer test-openai-key");
  assert.equal(headers.get("content-type"), "application/json");

  const requestBody = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;

  assert.deepEqual(requestBody, {
    input: "Write a LinkedIn draft about testing.",
    model: DEFAULT_OPENAI_MODEL,
  });
});

test("generateText normalizes messages and reads output text from message content", async () => {
  const { DEFAULT_OPENAI_MODEL, generateText } = await loadAiModule();
  let requestBody: Record<string, unknown> | null = null;

  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

    return createJsonResponse({
      id: "resp_messages",
      model: "gpt-5",
      output: [
        {
          content: [
            {
              text: "Short polished draft",
              type: "output_text",
            },
          ],
          role: "assistant",
          type: "message",
        },
      ],
    });
  };

  const result = await generateText({
    input: [
      {
        content: "You are a precise editor.",
        role: "system",
      },
      {
        content: "Tighten this announcement.",
        role: "user",
      },
    ],
    instructions: "Keep it concise.",
    maxOutputTokens: 256,
    metadata: {
      feature: "F004",
    },
    previousResponseId: "resp_previous",
    temperature: 0.4,
  });

  assert.equal(result.outputText, "Short polished draft");
  assert.deepEqual(requestBody, {
    input: [
      {
        content: [
          {
            text: "You are a precise editor.",
            type: "input_text",
          },
        ],
        role: "developer",
      },
      {
        content: [
          {
            text: "Tighten this announcement.",
            type: "input_text",
          },
        ],
        role: "user",
      },
    ],
    instructions: "Keep it concise.",
    max_output_tokens: 256,
    metadata: {
      feature: "F004",
    },
    model: DEFAULT_OPENAI_MODEL,
    previous_response_id: "resp_previous",
    temperature: 0.4,
  });
});

test("createOpenAiResponse surfaces OpenAI error messages and status codes", async () => {
  const { AiError, createOpenAiResponse } = await loadAiModule();
  globalThis.fetch = async () =>
    createJsonResponse(
      {
        error: {
          message: "Invalid API key.",
        },
      },
      {
        status: 401,
        statusText: "Unauthorized",
      },
    );

  await assert.rejects(
    () =>
      createOpenAiResponse({
        input: "Write a test.",
      }),
    (error: unknown) => {
      assert.ok(error instanceof AiError);
      const aiError = error as InstanceType<typeof AiError>;
      assert.equal(aiError.code, "request-failed");
      assert.equal(aiError.message, "Invalid API key.");
      assert.equal(aiError.status, 401);
      return true;
    },
  );
});

test("generateText rejects empty input before making a network request", async () => {
  const { AiError, DEFAULT_OPENAI_MODEL, generateText } = await loadAiModule();
  let called = false;

  globalThis.fetch = async () => {
    called = true;
    return createJsonResponse({
      id: "resp_unused",
      model: DEFAULT_OPENAI_MODEL,
      output_text: "unused",
    });
  };

  await assert.rejects(
    () =>
      generateText({
        input: "   ",
      }),
    (error: unknown) => {
      assert.ok(error instanceof AiError);
      const aiError = error as InstanceType<typeof AiError>;
      assert.equal(aiError.code, "invalid-input");
      assert.equal(aiError.message, "OpenAI input cannot be empty.");
      return true;
    },
  );

  assert.equal(called, false);
});
