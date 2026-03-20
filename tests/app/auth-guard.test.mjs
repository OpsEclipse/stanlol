import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function rewriteCompiledImports(filePath, replacements) {
  const source = readFileSync(filePath, "utf8");
  let nextSource = source;

  for (const [search, replacement] of replacements) {
    nextSource = nextSource.replace(search, replacement);
  }

  writeFileSync(filePath, nextSource);
}

function compileMiddlewareFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-auth-guard-middleware-"));

  execFileSync(
    "npx",
    [
      "tsc",
      "--outDir",
      outputDirectory,
      "--module",
      "esnext",
      "--moduleResolution",
      "bundler",
      "--target",
      "es2022",
      "--esModuleInterop",
      "--skipLibCheck",
      "middleware.ts",
      "lib/auth-session.ts",
      "lib/db.ts",
    ],
    {
      cwd: projectRoot,
      stdio: "pipe",
    },
  );

  symlinkSync(resolve(projectRoot, "node_modules"), resolve(outputDirectory, "node_modules"), "dir");

  rewriteCompiledImports(resolve(outputDirectory, "middleware.js"), [
    ['from "next/server";', 'from "next/server.js";'],
    ['from "./lib/auth-session";', 'from "./lib/auth-session.js";'],
  ]);
  rewriteCompiledImports(resolve(outputDirectory, "lib/auth-session.js"), [
    ['from "next/server";', 'from "next/server.js";'],
    ['from "./db";', 'from "./db.js";'],
  ]);

  return outputDirectory;
}

function compileChatThreadsRouteFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-auth-guard-chat-threads-"));

  execFileSync(
    "npx",
    [
      "tsc",
      "--outDir",
      outputDirectory,
      "--module",
      "esnext",
      "--moduleResolution",
      "bundler",
      "--target",
      "es2022",
      "--esModuleInterop",
      "--skipLibCheck",
      "app/api/chat/threads/route.ts",
      "lib/db.ts",
      "lib/thread-create.ts",
    ],
    {
      cwd: projectRoot,
      stdio: "pipe",
    },
  );

  rewriteCompiledImports(resolve(outputDirectory, "app/api/chat/threads/route.js"), [
    ['from "../../../../lib/authenticated-api";', 'from "../../../../lib/authenticated-api.js";'],
    ['from "../../../../lib/json-response";', 'from "../../../../lib/json-response.js";'],
    ['from "../../../../lib/thread-create";', 'from "../../../../lib/thread-create.js";'],
    ['from "../../../../lib/thread-list";', 'from "../../../../lib/thread-list.js";'],
    ['from "../../../../lib/validation";', 'from "../../../../lib/validation.js";'],
  ]);
  rewriteCompiledImports(resolve(outputDirectory, "lib/authenticated-api.js"), [
    ['from "./api-route-error";', 'from "./api-route-error.js";'],
    ['from "./db";', 'from "./db.js";'],
    ['from "./json-response";', 'from "./json-response.js";'],
  ]);
  rewriteCompiledImports(resolve(outputDirectory, "lib/api-route-error.js"), [
    ['from "./json-response";', 'from "./json-response.js";'],
  ]);
  rewriteCompiledImports(resolve(outputDirectory, "lib/thread-list.js"), [
    ['from "./db.ts";', 'from "./db.js";'],
  ]);
  rewriteCompiledImports(resolve(outputDirectory, "lib/thread-create.js"), [
    ['from "./db.ts";', 'from "./db.js";'],
  ]);

  return outputDirectory;
}

function compileVoicesRouteFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-auth-guard-voices-"));

  execFileSync(
    "npx",
    [
      "tsc",
      "--outDir",
      outputDirectory,
      "--module",
      "esnext",
      "--moduleResolution",
      "bundler",
      "--target",
      "es2022",
      "--esModuleInterop",
      "--skipLibCheck",
      "app/api/voices/route.ts",
      "lib/db.ts",
    ],
    {
      cwd: projectRoot,
      stdio: "pipe",
    },
  );

  rewriteCompiledImports(resolve(outputDirectory, "app/api/voices/route.js"), [
    ['from "../../../lib/authenticated-api";', 'from "../../../lib/authenticated-api.js";'],
    ['from "../../../lib/json-response";', 'from "../../../lib/json-response.js";'],
    ['from "../../../lib/validation";', 'from "../../../lib/validation.js";'],
    ['from "../../../lib/voice-list";', 'from "../../../lib/voice-list.js";'],
    ['from "../../../lib/voice-update";', 'from "../../../lib/voice-update.js";'],
  ]);
  rewriteCompiledImports(resolve(outputDirectory, "lib/authenticated-api.js"), [
    ['from "./api-route-error";', 'from "./api-route-error.js";'],
    ['from "./db";', 'from "./db.js";'],
    ['from "./json-response";', 'from "./json-response.js";'],
  ]);
  rewriteCompiledImports(resolve(outputDirectory, "lib/api-route-error.js"), [
    ['from "./json-response";', 'from "./json-response.js";'],
  ]);
  rewriteCompiledImports(resolve(outputDirectory, "lib/voice-list.js"), [
    ['from "./db.ts";', 'from "./db.js";'],
  ]);
  rewriteCompiledImports(resolve(outputDirectory, "lib/voice-update.js"), [
    ['from "./db.ts";', 'from "./db.js";'],
  ]);

  return outputDirectory;
}

function createJsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function createFetchMock(responseFactory) {
  const calls = [];

  const mockFetch = async (input, init) => {
    const call = {
      init,
      url: String(input),
    };

    calls.push(call);
    return responseFactory(call);
  };

  return {
    calls,
    fetch: mockFetch,
  };
}

function getSetCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }

  const setCookie = response.headers.get("set-cookie");
  return setCookie ? [setCookie] : [];
}

function withAuthEnv(run) {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

  return Promise.resolve(run()).finally(() => {
    if (previousUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    }

    if (previousAnonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousAnonKey;
    }
  });
}

async function withMockedFetch(fetchImplementation, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImplementation;

  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("protected workspace flow redirects anonymous users to the sign-in screen", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileMiddlewareFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const modulePath = resolve(outputDirectory, "middleware.js");
  assert.equal(existsSync(modulePath), true);

  const middlewareModule = await import(pathToFileURL(modulePath).href);
  let wasCalled = false;

  await withAuthEnv(async () => {
    await withMockedFetch(async () => {
      wasCalled = true;
      return createJsonResponse({ message: "unexpected" }, { status: 500 });
    }, async () => {
      const response = await middlewareModule.middleware(
        new Request("https://stanlol.test/workspace"),
      );

      assert.equal(wasCalled, false);
      assert.equal(response.headers.get("location"), "https://stanlol.test/");
      assert.deepEqual(getSetCookies(response), []);
    });
  });
});

test("protected API routes reject unauthenticated requests with a 401 response", async (t) => {
  const projectRoot = process.cwd();
  const chatThreadsOutputDirectory = compileChatThreadsRouteFixture(projectRoot);
  const voicesOutputDirectory = compileVoicesRouteFixture(projectRoot);

  t.after(() => {
    rmSync(chatThreadsOutputDirectory, { force: true, recursive: true });
    rmSync(voicesOutputDirectory, { force: true, recursive: true });
  });

  const chatThreadsRoutePath = resolve(chatThreadsOutputDirectory, "app/api/chat/threads/route.js");
  const voicesRoutePath = resolve(voicesOutputDirectory, "app/api/voices/route.js");

  assert.equal(existsSync(chatThreadsRoutePath), true);
  assert.equal(existsSync(voicesRoutePath), true);

  const chatThreadsModule = await import(pathToFileURL(chatThreadsRoutePath).href);
  const voicesModule = await import(pathToFileURL(voicesRoutePath).href);

  const cases = [
    {
      invoke: () => chatThreadsModule.GET(new Request("https://stanlol.test/api/chat/threads")),
      name: "GET /api/chat/threads without a bearer token",
    },
    {
      invoke: () =>
        chatThreadsModule.POST(
          new Request("https://stanlol.test/api/chat/threads", {
            method: "POST",
          }),
        ),
      name: "POST /api/chat/threads without a bearer token",
    },
    {
      invoke: () => voicesModule.GET(new Request("https://stanlol.test/api/voices")),
      name: "GET /api/voices without a bearer token",
    },
    {
      invoke: () =>
        voicesModule.PATCH(
          new Request("https://stanlol.test/api/voices", {
            body: JSON.stringify({
              instructions: "Keep the writing direct and practical.",
              name: "Operator",
              voiceId: "voice-123",
            }),
            headers: {
              "content-type": "application/json",
            },
            method: "PATCH",
          }),
        ),
      name: "PATCH /api/voices without a bearer token",
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const response = await testCase.invoke();

      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        error: "Authentication required.",
        success: false,
      });
    });
  }
});

test("protected API routes return a 401 response when bearer token verification fails", async (t) => {
  const projectRoot = process.cwd();
  const chatThreadsOutputDirectory = compileChatThreadsRouteFixture(projectRoot);
  const voicesOutputDirectory = compileVoicesRouteFixture(projectRoot);

  t.after(() => {
    rmSync(chatThreadsOutputDirectory, { force: true, recursive: true });
    rmSync(voicesOutputDirectory, { force: true, recursive: true });
  });

  const chatThreadsRoutePath = resolve(chatThreadsOutputDirectory, "app/api/chat/threads/route.js");
  const voicesRoutePath = resolve(voicesOutputDirectory, "app/api/voices/route.js");

  assert.equal(existsSync(chatThreadsRoutePath), true);
  assert.equal(existsSync(voicesRoutePath), true);

  const chatThreadsModule = await import(pathToFileURL(chatThreadsRoutePath).href);
  const voicesModule = await import(pathToFileURL(voicesRoutePath).href);
  const mock = createFetchMock(() =>
    createJsonResponse({ error: "invalid_token" }, { status: 401 }),
  );

  await withAuthEnv(async () => {
    await withMockedFetch(mock.fetch, async () => {
      const cases = [
        {
          invoke: () =>
            chatThreadsModule.GET(
              new Request("https://stanlol.test/api/chat/threads", {
                headers: {
                  authorization: "Bearer expired-token",
                },
              }),
            ),
          name: "GET /api/chat/threads",
        },
        {
          invoke: () =>
            chatThreadsModule.POST(
              new Request("https://stanlol.test/api/chat/threads", {
                headers: {
                  authorization: "Bearer expired-token",
                },
                method: "POST",
              }),
            ),
          name: "POST /api/chat/threads",
        },
        {
          invoke: () =>
            voicesModule.GET(
              new Request("https://stanlol.test/api/voices", {
                headers: {
                  authorization: "Bearer expired-token",
                },
              }),
            ),
          name: "GET /api/voices",
        },
        {
          invoke: () =>
            voicesModule.PATCH(
              new Request("https://stanlol.test/api/voices", {
                body: JSON.stringify({
                  instructions: "Keep the writing direct and practical.",
                  name: "Operator",
                  voiceId: "voice-123",
                }),
                headers: {
                  authorization: "Bearer expired-token",
                  "content-type": "application/json",
                },
                method: "PATCH",
              }),
            ),
          name: "PATCH /api/voices",
        },
      ];

      for (const testCase of cases) {
        await t.test(testCase.name, async () => {
          const response = await testCase.invoke();

          assert.equal(response.status, 401);
          assert.deepEqual(await response.json(), {
            error: "Authentication required.",
            success: false,
          });
        });
      }

      assert.equal(mock.calls.length, cases.length);
      for (const call of mock.calls) {
        assert.equal(new URL(call.url).pathname, "/auth/v1/user");
      }
    });
  });
});
