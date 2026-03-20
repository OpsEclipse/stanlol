import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function compileRouteFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-voices-route-"));

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

  return outputDirectory;
}

function rewriteCompiledImports(filePath, replacements) {
  const source = readFileSync(filePath, "utf8");
  let nextSource = source;

  for (const [search, replacement] of replacements) {
    nextSource = nextSource.replace(search, replacement);
  }

  writeFileSync(filePath, nextSource);
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

function setSupabaseEnv() {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

  return () => {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }

    if (originalAnonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    }
  };
}

test("GET /api/voices returns a 401 response when the bearer token is missing", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModulePath = resolve(outputDirectory, "app/api/voices/route.js");

  assert.equal(existsSync(routeModulePath), true);

  const { GET } = await import(pathToFileURL(routeModulePath).href);
  const response = await GET(new Request("https://stanlol.test/api/voices"));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Authentication required.",
    success: false,
  });
});

test("GET /api/voices rejects unexpected query parameters", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModulePath = resolve(outputDirectory, "app/api/voices/route.js");
  const restoreEnv = setSupabaseEnv();
  const { GET } = await import(pathToFileURL(routeModulePath).href);
  const mock = createFetchMock((call) => {
    const url = new URL(call.url);

    if (url.pathname === "/auth/v1/user") {
      return createJsonResponse(
        {
          email: "writer@example.com",
          id: "user-123",
        },
        { status: 200 },
      );
    }

    assert.fail(`Unexpected fetch request: ${call.url}`);
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fetch;

  try {
    const response = await GET(
      new Request("https://stanlol.test/api/voices?limit=2", {
        headers: {
          authorization: "Bearer access-token",
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "Invalid query parameters.",
      success: false,
    });
    assert.equal(mock.calls.length, 1);
    assert.equal(new URL(mock.calls[0].url).pathname, "/auth/v1/user");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test("GET /api/voices returns the authenticated user's saved voices", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModulePath = resolve(outputDirectory, "app/api/voices/route.js");
  const restoreEnv = setSupabaseEnv();
  const { GET } = await import(pathToFileURL(routeModulePath).href);
  const voiceRows = [
    {
      created_at: "2026-03-19T22:00:00.000Z",
      description: "Long-form storytelling tone",
      id: "voice-456",
      instructions: "Write with clear narrative transitions.",
      name: "Storyteller",
      updated_at: "2026-03-19T22:10:00.000Z",
      user_id: "user-123",
    },
    {
      created_at: "2026-03-19T20:00:00.000Z",
      description: null,
      id: "voice-123",
      instructions: "Keep the writing direct and practical.",
      name: "Operator",
      updated_at: "2026-03-19T20:05:00.000Z",
      user_id: "user-123",
    },
  ];
  const mock = createFetchMock((call) => {
    const url = new URL(call.url);

    if (url.pathname === "/auth/v1/user") {
      return createJsonResponse(
        {
          email: "writer@example.com",
          id: "user-123",
        },
        { status: 200 },
      );
    }

    if (url.pathname === "/rest/v1/voice_profiles") {
      assert.equal(url.searchParams.get("select"), "id,user_id,name,description,instructions,created_at,updated_at");
      assert.equal(url.searchParams.get("user_id"), "eq.user-123");
      assert.equal(url.searchParams.get("order"), "updated_at.desc");

      return createJsonResponse(voiceRows, { status: 200 });
    }

    assert.fail(`Unexpected fetch request: ${call.url}`);
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fetch;

  try {
    const response = await GET(
      new Request("https://stanlol.test/api/voices", {
        headers: {
          authorization: "Bearer access-token",
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      data: {
        voices: voiceRows,
      },
      success: true,
    });
    assert.equal(mock.calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test("GET /api/voices returns a 500 response when voice loading fails", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModulePath = resolve(outputDirectory, "app/api/voices/route.js");
  const restoreEnv = setSupabaseEnv();
  const { GET } = await import(pathToFileURL(routeModulePath).href);
  const mock = createFetchMock((call) => {
    const url = new URL(call.url);

    if (url.pathname === "/auth/v1/user") {
      return createJsonResponse(
        {
          email: "writer@example.com",
          id: "user-123",
        },
        { status: 200 },
      );
    }

    if (url.pathname === "/rest/v1/voice_profiles") {
      return createJsonResponse({ message: "permission denied" }, { status: 500 });
    }

    assert.fail(`Unexpected fetch request: ${call.url}`);
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fetch;

  try {
    const response = await GET(
      new Request("https://stanlol.test/api/voices", {
        headers: {
          authorization: "Bearer access-token",
        },
      }),
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: "Failed to list voice profiles: permission denied",
      success: false,
    });
    assert.equal(mock.calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});
