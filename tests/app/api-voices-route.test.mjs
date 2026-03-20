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
    ['from "../../../lib/voice-create";', 'from "../../../lib/voice-create.js";'],
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
  rewriteCompiledImports(resolve(outputDirectory, "lib/voice-create.js"), [
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

test("POST /api/voices returns a 401 response when the bearer token is missing", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModulePath = resolve(outputDirectory, "app/api/voices/route.js");

  assert.equal(existsSync(routeModulePath), true);

  const { POST } = await import(pathToFileURL(routeModulePath).href);
  const response = await POST(
    new Request("https://stanlol.test/api/voices", {
      body: JSON.stringify({
        instructions: "Keep the writing direct and practical.",
        name: "Operator",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    }),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Authentication required.",
    success: false,
  });
});

test("POST /api/voices rejects invalid request payloads", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModulePath = resolve(outputDirectory, "app/api/voices/route.js");
  const restoreEnv = setSupabaseEnv();
  const { POST } = await import(pathToFileURL(routeModulePath).href);
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
    const invalidJsonResponse = await POST(
      new Request("https://stanlol.test/api/voices", {
        body: "{",
        headers: {
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    assert.equal(invalidJsonResponse.status, 400);
    assert.deepEqual(await invalidJsonResponse.json(), {
      error: "Invalid request payload.",
      success: false,
    });

    const unexpectedFieldResponse = await POST(
      new Request("https://stanlol.test/api/voices", {
        body: JSON.stringify({
          extra: true,
          instructions: "Keep the writing direct and practical.",
          name: "Operator",
        }),
        headers: {
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    assert.equal(unexpectedFieldResponse.status, 400);
    assert.deepEqual(await unexpectedFieldResponse.json(), {
      error: "Invalid request payload.",
      success: false,
    });
    assert.equal(mock.calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test("POST /api/voices creates a new voice for the authenticated user", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModulePath = resolve(outputDirectory, "app/api/voices/route.js");
  const restoreEnv = setSupabaseEnv();
  const { POST } = await import(pathToFileURL(routeModulePath).href);
  const createdVoice = {
    created_at: "2026-03-19T22:00:00.000Z",
    description: "Calm product updates with crisp transitions.",
    id: "voice-123",
    instructions: "Lead with the strongest proof point, keep paragraphs short, and close with one next step.",
    name: "Operator",
    updated_at: "2026-03-19T22:00:00.000Z",
    user_id: "user-123",
  };
  const mock = createFetchMock(async (call) => {
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
      assert.equal(call.init?.method, "POST");
      assert.equal(url.searchParams.get("select"), "id,user_id,name,description,instructions,created_at,updated_at");

      const body = JSON.parse(call.init.body);
      assert.deepEqual(body, {
        description: "Calm product updates with crisp transitions.",
        instructions: "Lead with the strongest proof point, keep paragraphs short, and close with one next step.",
        name: "Operator",
        user_id: "user-123",
      });

      return createJsonResponse([createdVoice], { status: 201 });
    }

    assert.fail(`Unexpected fetch request: ${call.url}`);
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fetch;

  try {
    const response = await POST(
      new Request("https://stanlol.test/api/voices", {
        body: JSON.stringify({
          description: "  Calm product updates with crisp transitions.  ",
          instructions:
            "  Lead with the strongest proof point, keep paragraphs short, and close with one next step.  ",
          name: "  Operator  ",
        }),
        headers: {
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      data: {
        voice: createdVoice,
      },
      success: true,
    });
    assert.equal(mock.calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test("POST /api/voices returns a 500 response when voice creation fails", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModulePath = resolve(outputDirectory, "app/api/voices/route.js");
  const restoreEnv = setSupabaseEnv();
  const { POST } = await import(pathToFileURL(routeModulePath).href);
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
    const response = await POST(
      new Request("https://stanlol.test/api/voices", {
        body: JSON.stringify({
          description: "Calm product updates with precise transitions.",
          instructions: "Keep the writing direct and practical.",
          name: "Operator",
        }),
        headers: {
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: "Failed to create voice profile: permission denied",
      success: false,
    });
    assert.equal(mock.calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test("PATCH /api/voices returns a 401 response when the bearer token is missing", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModulePath = resolve(outputDirectory, "app/api/voices/route.js");

  assert.equal(existsSync(routeModulePath), true);

  const { PATCH } = await import(pathToFileURL(routeModulePath).href);
  const response = await PATCH(
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
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Authentication required.",
    success: false,
  });
});

test("PATCH /api/voices rejects invalid request payloads", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModulePath = resolve(outputDirectory, "app/api/voices/route.js");
  const restoreEnv = setSupabaseEnv();
  const { PATCH } = await import(pathToFileURL(routeModulePath).href);
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
    const invalidJsonResponse = await PATCH(
      new Request("https://stanlol.test/api/voices", {
        body: "{",
        headers: {
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "PATCH",
      }),
    );

    assert.equal(invalidJsonResponse.status, 400);
    assert.deepEqual(await invalidJsonResponse.json(), {
      error: "Invalid request payload.",
      success: false,
    });

    const unexpectedFieldResponse = await PATCH(
      new Request("https://stanlol.test/api/voices", {
        body: JSON.stringify({
          extra: true,
          instructions: "Keep the writing direct and practical.",
          name: "Operator",
          voiceId: "voice-123",
        }),
        headers: {
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "PATCH",
      }),
    );

    assert.equal(unexpectedFieldResponse.status, 400);
    assert.deepEqual(await unexpectedFieldResponse.json(), {
      error: "Invalid request payload.",
      success: false,
    });
    assert.equal(mock.calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test("PATCH /api/voices updates the authenticated user's saved voice", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModulePath = resolve(outputDirectory, "app/api/voices/route.js");
  const restoreEnv = setSupabaseEnv();
  const { PATCH } = await import(pathToFileURL(routeModulePath).href);
  const updatedVoice = {
    created_at: "2026-03-19T20:00:00.000Z",
    description: "Calm product updates with precise transitions.",
    id: "voice-123",
    instructions: "Lead with the strongest proof point, keep paragraphs short, and close with one next step.",
    name: "Operator",
    updated_at: "2026-03-19T22:10:00.000Z",
    user_id: "user-123",
  };
  const mock = createFetchMock(async (call) => {
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
      assert.equal(call.init?.method, "PATCH");
      assert.equal(url.searchParams.get("select"), "id,user_id,name,description,instructions,created_at,updated_at");
      assert.equal(url.searchParams.get("id"), "eq.voice-123");
      assert.equal(url.searchParams.get("user_id"), "eq.user-123");

      const body = JSON.parse(call.init.body);
      assert.deepEqual(body, {
        description: "Calm product updates with precise transitions.",
        instructions: "Lead with the strongest proof point, keep paragraphs short, and close with one next step.",
        name: "Operator",
      });

      return createJsonResponse([updatedVoice], { status: 200 });
    }

    assert.fail(`Unexpected fetch request: ${call.url}`);
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fetch;

  try {
    const response = await PATCH(
      new Request("https://stanlol.test/api/voices", {
        body: JSON.stringify({
          description: "  Calm product updates with precise transitions.  ",
          instructions:
            "  Lead with the strongest proof point, keep paragraphs short, and close with one next step.  ",
          name: "  Operator  ",
          voiceId: "  voice-123  ",
        }),
        headers: {
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "PATCH",
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      data: {
        voice: updatedVoice,
      },
      success: true,
    });
    assert.equal(mock.calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test("PATCH /api/voices returns a 500 response when voice updating fails", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModulePath = resolve(outputDirectory, "app/api/voices/route.js");
  const restoreEnv = setSupabaseEnv();
  const { PATCH } = await import(pathToFileURL(routeModulePath).href);
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
    const response = await PATCH(
      new Request("https://stanlol.test/api/voices", {
        body: JSON.stringify({
          description: "Calm product updates with precise transitions.",
          instructions: "Keep the writing direct and practical.",
          name: "Operator",
          voiceId: "voice-123",
        }),
        headers: {
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "PATCH",
      }),
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: "Failed to update voice profile: permission denied",
      success: false,
    });
    assert.equal(mock.calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});
