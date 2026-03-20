import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function compileMiddlewareFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-middleware-"));

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

  const middlewareModulePath = resolve(outputDirectory, "middleware.js");
  const compiledMiddleware = readFileSync(middlewareModulePath, "utf8")
    .replace('from "next/server";', 'from "next/server.js";')
    .replace('from "./lib/auth-session";', 'from "./lib/auth-session.js";');

  writeFileSync(middlewareModulePath, compiledMiddleware);

  const authSessionModulePath = resolve(outputDirectory, "lib/auth-session.js");
  const compiledAuthSession = readFileSync(authSessionModulePath, "utf8")
    .replace('from "next/server";', 'from "next/server.js";')
    .replace('from "./db";', 'from "./db.js";');

  writeFileSync(authSessionModulePath, compiledAuthSession);

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

test("middleware redirects anonymous workspace requests to the sign-in screen", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileMiddlewareFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const middlewareModule = await import(pathToFileURL(resolve(outputDirectory, "middleware.js")).href);
  let wasCalled = false;

  await withAuthEnv(async () => {
    await withMockedFetch(async () => {
      wasCalled = true;
      return createJsonResponse({}, { status: 500 });
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

test("middleware refreshes the workspace session when only a refresh token remains", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileMiddlewareFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const middlewareModulePath = resolve(outputDirectory, "middleware.js");

  assert.equal(existsSync(middlewareModulePath), true);

  const middlewareModule = await import(pathToFileURL(middlewareModulePath).href);
  const mock = createFetchMock((call) => {
    const url = new URL(call.url);

    assert.equal(url.pathname, "/auth/v1/token");
    assert.equal(url.searchParams.get("grant_type"), "refresh_token");
    assert.deepEqual(JSON.parse(String(call.init?.body)), {
      refresh_token: "persisted-refresh-token",
    });

    return createJsonResponse(
      {
        access_token: "rotated-access-token",
        expires_in: 3600,
        refresh_token: "rotated-refresh-token",
      },
      { status: 200 },
    );
  });

  await withAuthEnv(async () => {
    await withMockedFetch(mock.fetch, async () => {
      const response = await middlewareModule.middleware(
        new Request("https://stanlol.test/workspace", {
          headers: {
            cookie: "stanlol-refresh-token=persisted-refresh-token",
          },
        }),
      );
      const setCookies = getSetCookies(response);

      assert.equal(mock.calls.length, 1);
      assert.ok(setCookies.some((cookie) => cookie.startsWith("stanlol-access-token=rotated-access-token")));
      assert.ok(setCookies.some((cookie) => cookie.startsWith("stanlol-refresh-token=rotated-refresh-token")));
      assert.ok(setCookies.some((cookie) => cookie.startsWith("stanlol-access-token-expires-at=")));
    });
  });
});

test("middleware skips refresh when the workspace access token is still fresh", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileMiddlewareFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const middlewareModule = await import(pathToFileURL(resolve(outputDirectory, "middleware.js")).href);
  const futureExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  let wasCalled = false;

  await withAuthEnv(async () => {
    await withMockedFetch(async () => {
      wasCalled = true;
      return createJsonResponse({}, { status: 500 });
    }, async () => {
      const response = await middlewareModule.middleware(
        new Request("https://stanlol.test/workspace", {
          headers: {
            cookie: [
              "stanlol-access-token=still-valid-access-token",
              "stanlol-refresh-token=refresh-token",
              `stanlol-access-token-expires-at=${encodeURIComponent(futureExpiry)}`,
            ].join("; "),
          },
        }),
      );

      assert.equal(wasCalled, false);
      assert.deepEqual(getSetCookies(response), []);
    });
  });
});

test("middleware clears auth cookies when refresh fails", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileMiddlewareFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const middlewareModule = await import(pathToFileURL(resolve(outputDirectory, "middleware.js")).href);

  await withAuthEnv(async () => {
    await withMockedFetch(
      async () => createJsonResponse({ message: "refresh failed" }, { status: 401 }),
      async () => {
        const response = await middlewareModule.middleware(
          new Request("https://stanlol.test/workspace", {
            headers: {
              cookie: "stanlol-refresh-token=expired-refresh-token",
            },
          }),
        );
        const setCookies = getSetCookies(response);

        assert.equal(response.headers.get("location"), "https://stanlol.test/");
        assert.ok(setCookies.some((cookie) => cookie.startsWith("stanlol-access-token=")));
        assert.ok(setCookies.some((cookie) => cookie.startsWith("stanlol-refresh-token=")));
        assert.ok(setCookies.some((cookie) => cookie.startsWith("stanlol-access-token-expires-at=")));
      },
    );
  });
});
