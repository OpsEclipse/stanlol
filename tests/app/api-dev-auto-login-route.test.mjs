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
    nextSource = nextSource.replaceAll(search, replacement);
  }

  writeFileSync(filePath, nextSource);
}

function compileRouteFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-dev-auto-login-route-"));

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
      "--jsx",
      "react-jsx",
      "--esModuleInterop",
      "--skipLibCheck",
      "app/api/dev/auto-login/route.ts",
      "lib/auth-session.ts",
      "lib/db.ts",
      "lib/json-response.ts",
      "lib/local-feature-flags.ts",
      "lib/local-test-account.ts",
      "lib/validation.ts",
    ],
    {
      cwd: projectRoot,
      stdio: "pipe",
    },
  );

  symlinkSync(resolve(projectRoot, "node_modules"), resolve(outputDirectory, "node_modules"), "dir");

  rewriteCompiledImports(resolve(outputDirectory, "app/api/dev/auto-login/route.js"), [
    ['from "next/server";', 'from "next/server.js";'],
    ['from "../../../../lib/auth-session";', 'from "../../../../lib/auth-session.js";'],
    ['from "../../../../lib/json-response";', 'from "../../../../lib/json-response.js";'],
    ['from "../../../../lib/local-test-account";', 'from "../../../../lib/local-test-account.js";'],
    ['from "../../../../lib/local-feature-flags";', 'from "../../../../lib/local-feature-flags.js";'],
    ['from "../../../../lib/validation";', 'from "../../../../lib/validation.js";'],
  ]);
  rewriteCompiledImports(resolve(outputDirectory, "lib/auth-session.js"), [
    ['from "next/server";', 'from "next/server.js";'],
    ['from "./db";', 'from "./db.js";'],
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

async function withMockedFetch(fetchImplementation, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImplementation;

  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function withAutoLoginEnv(overrides, run) {
  const previousEnv = {
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    STANLOL_LOCAL_AUTO_LOGIN: process.env.STANLOL_LOCAL_AUTO_LOGIN,
    STANLOL_LOCAL_TEST_ACCOUNT_EMAIL: process.env.STANLOL_LOCAL_TEST_ACCOUNT_EMAIL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };

  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NODE_ENV = "development";
  process.env.STANLOL_LOCAL_AUTO_LOGIN = "1";
  process.env.STANLOL_LOCAL_TEST_ACCOUNT_EMAIL = "seeded.user@example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  delete process.env.VERCEL_ENV;

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test("POST signs the seeded local account in and returns the standard JSON envelope", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModulePath = resolve(outputDirectory, "app/api/dev/auto-login/route.js");

  assert.equal(existsSync(routeModulePath), true);

  const routeModule = await import(pathToFileURL(routeModulePath).href);
  const { POST } = routeModule;

  await withAutoLoginEnv({}, async () => {
    const mock = createFetchMock((call) => {
      const url = new URL(call.url);

      if (url.pathname === "/rest/v1/user_profiles" && call.init?.method === "GET") {
        return createJsonResponse(
          [
            {
              display_name: "Seeded Writer",
              email: "seeded.user@example.com",
              id: "user-seeded",
            },
          ],
          { status: 200 },
        );
      }

      if (url.pathname === "/auth/v1/admin/generate_link") {
        return createJsonResponse(
          {
            action_link: "https://stanlol.test/auth",
            email: "seeded.user@example.com",
            email_otp: "123456",
            hashed_token: "hashed-token-123",
            id: "user-seeded",
            verification_type: "magiclink",
          },
          { status: 200 },
        );
      }

      if (url.pathname === "/auth/v1/verify") {
        return createJsonResponse(
          {
            access_token: "seeded-access-token",
            expires_in: 3600,
            refresh_token: "seeded-refresh-token",
            token_type: "bearer",
          },
          { status: 200 },
        );
      }

      if (url.pathname === "/auth/v1/user") {
        return createJsonResponse(
          {
            email: "seeded.user@example.com",
            id: "user-seeded",
            user_metadata: {
              full_name: "Seeded Writer",
            },
          },
          { status: 200 },
        );
      }

      if (url.pathname === "/rest/v1/user_profiles" && call.init?.method === "POST") {
        return createJsonResponse(
          [
            {
              created_at: "2026-03-19T20:00:00.000Z",
              display_name: "Seeded Writer",
              email: "seeded.user@example.com",
              id: "user-seeded",
              updated_at: "2026-03-19T20:15:00.000Z",
            },
          ],
          { status: 200 },
        );
      }

      assert.fail(`Unexpected fetch request: ${call.url}`);
    });

    await withMockedFetch(mock.fetch, async () => {
      const response = await POST(
        new Request("https://stanlol.test/api/dev/auto-login", {
          body: JSON.stringify({}),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }),
      );

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        success: true,
        data: {
          user: {
            displayName: "Seeded Writer",
            email: "seeded.user@example.com",
            id: "user-seeded",
          },
        },
      });

      assert.equal(mock.calls.length, 5);

      const seedLookupHeaders = new Headers(mock.calls[0].init?.headers);
      const generateLinkHeaders = new Headers(mock.calls[1].init?.headers);
      const profileSyncHeaders = new Headers(mock.calls[4].init?.headers);

      assert.equal(new URL(mock.calls[0].url).pathname, "/rest/v1/user_profiles");
      assert.equal(seedLookupHeaders.get("authorization"), "Bearer service-role-key");

      assert.equal(new URL(mock.calls[1].url).pathname, "/auth/v1/admin/generate_link");
      assert.equal(generateLinkHeaders.get("apikey"), "service-role-key");
      assert.equal(generateLinkHeaders.get("authorization"), "Bearer service-role-key");
      assert.deepEqual(JSON.parse(String(mock.calls[1].init?.body)), {
        email: "seeded.user@example.com",
        type: "magiclink",
      });

      assert.equal(new URL(mock.calls[2].url).pathname, "/auth/v1/verify");
      assert.deepEqual(JSON.parse(String(mock.calls[2].init?.body)), {
        token_hash: "hashed-token-123",
        type: "magiclink",
      });

      assert.equal(new URL(mock.calls[3].url).pathname, "/auth/v1/user");
      assert.equal(new URL(mock.calls[4].url).pathname, "/rest/v1/user_profiles");
      assert.equal(profileSyncHeaders.get("authorization"), "Bearer seeded-access-token");

      const setCookies = getSetCookies(response);

      assert.ok(
        setCookies.some((cookie) => cookie.startsWith("stanlol-access-token=seeded-access-token")),
      );
      assert.ok(
        setCookies.some((cookie) => cookie.startsWith("stanlol-refresh-token=seeded-refresh-token")),
      );
      assert.ok(
        setCookies.some((cookie) => cookie.startsWith("stanlol-access-token-expires-at=")),
      );
    });
  });
});

test("POST rejects the route outside local development", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModule = await import(
    pathToFileURL(resolve(outputDirectory, "app/api/dev/auto-login/route.js")).href
  );
  const { POST } = routeModule;

  await withAutoLoginEnv({ NODE_ENV: "production" }, async () => {
    await withMockedFetch(async () => {
      assert.fail("fetch should not be called outside local development");
    }, async () => {
      const response = await POST(
        new Request("https://stanlol.test/api/dev/auto-login", {
          body: JSON.stringify({}),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }),
      );

      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        success: false,
        error: "Dev auto-login is only available in local development.",
      });
    });
  });
});

test("POST rejects unexpected request payload fields", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModule = await import(
    pathToFileURL(resolve(outputDirectory, "app/api/dev/auto-login/route.js")).href
  );
  const { POST } = routeModule;

  await withAutoLoginEnv({}, async () => {
    await withMockedFetch(async () => {
      assert.fail("fetch should not be called for invalid payloads");
    }, async () => {
      const response = await POST(
        new Request("https://stanlol.test/api/dev/auto-login", {
          body: JSON.stringify({ force: true }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }),
      );

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        success: false,
        error: "Invalid request payload.",
      });
    });
  });
});
