import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function compileRouteFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-auth-callback-route-"));

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
      "app/auth/callback/route.ts",
      "lib/db.ts",
    ],
    {
      cwd: projectRoot,
      stdio: "pipe",
    },
  );

  symlinkSync(resolve(projectRoot, "node_modules"), resolve(outputDirectory, "node_modules"), "dir");

  const routeModulePath = resolve(outputDirectory, "app/auth/callback/route.js");
  const compiledRoute = readFileSync(routeModulePath, "utf8")
    .replace('from "next/server";', 'from "next/server.js";')
    .replace('from "../../../lib/auth-session";', 'from "../../../lib/auth-session.js";')
    .replace('from "../../../lib/auth-session";', 'from "../../../lib/auth-session.js";')
    .replace('from "../../../lib/db";', 'from "../../../lib/db.js";');

  writeFileSync(routeModulePath, compiledRoute);

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

async function withMockedFetch(fetchImplementation, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImplementation;

  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("GET starts the Google OAuth PKCE flow from the auth callback route", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModulePath = resolve(outputDirectory, "app/auth/callback/route.js");

  assert.equal(existsSync(routeModulePath), true);

  const routeModule = await import(pathToFileURL(routeModulePath).href);
  const {
    AUTH_CALLBACK_PATH,
    DEFAULT_AUTH_SUCCESS_PATH,
    GET,
    PKCE_CODE_VERIFIER_COOKIE,
  } = routeModule;

  await withAuthEnv(async () => {
    const response = await GET(new Request("https://stanlol.test/auth/callback?provider=google"));
    const location = response.headers.get("location");

    assert.equal(response.status, 307);
    assert.ok(location);

    const authorizeUrl = new URL(location);

    assert.equal(authorizeUrl.pathname, "/auth/v1/authorize");
    assert.equal(authorizeUrl.searchParams.get("provider"), "google");
    assert.equal(authorizeUrl.searchParams.get("code_challenge_method"), "s256");
    assert.ok(authorizeUrl.searchParams.get("code_challenge"));

    const redirectTo = authorizeUrl.searchParams.get("redirect_to");

    assert.ok(redirectTo);

    const callbackUrl = new URL(redirectTo);

    assert.equal(callbackUrl.pathname, AUTH_CALLBACK_PATH);
    assert.equal(callbackUrl.searchParams.get("next"), DEFAULT_AUTH_SUCCESS_PATH);

    const setCookies = getSetCookies(response);

    assert.ok(setCookies.some((cookie) => cookie.startsWith(`${PKCE_CODE_VERIFIER_COOKIE}=`)));
  });
});

test("GET exchanges an OAuth auth code, syncs the profile, and redirects into the workspace", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModule = await import(pathToFileURL(resolve(outputDirectory, "app/auth/callback/route.js")).href);
  const {
    ACCESS_TOKEN_COOKIE,
    ACCESS_TOKEN_EXPIRES_AT_COOKIE,
    GET,
    PKCE_CODE_VERIFIER_COOKIE,
    REFRESH_TOKEN_COOKIE,
  } = routeModule;

  await withAuthEnv(async () => {
    const mock = createFetchMock((call) => {
      const url = new URL(call.url);

      if (url.pathname === "/auth/v1/token") {
        return createJsonResponse(
          {
            access_token: "access-token",
            expires_in: 3600,
            refresh_token: "refresh-token",
            token_type: "bearer",
          },
          { status: 200 },
        );
      }

      if (url.pathname === "/auth/v1/user") {
        return createJsonResponse(
          {
            email: "writer@example.com",
            id: "user-123",
            user_metadata: {
              full_name: "Stan Writer",
            },
          },
          { status: 200 },
        );
      }

      if (url.pathname === "/rest/v1/user_profiles") {
        return createJsonResponse(
          [
            {
              created_at: "2026-03-19T20:00:00.000Z",
              display_name: "Stan Writer",
              email: "writer@example.com",
              id: "user-123",
              updated_at: "2026-03-19T20:15:00.000Z",
            },
          ],
          { status: 200 },
        );
      }

      assert.fail(`Unexpected fetch request: ${call.url}`);
    });

    await withMockedFetch(mock.fetch, async () => {
      const response = await GET(
        new Request("https://stanlol.test/auth/callback?code=oauth-code&next=/workspace", {
          headers: {
            cookie: `${PKCE_CODE_VERIFIER_COOKIE}=pkce-verifier-value`,
          },
        }),
      );

      assert.equal(response.status, 307);
      assert.equal(response.headers.get("location"), "https://stanlol.test/workspace");
      assert.equal(mock.calls.length, 3);

      const exchangeRequest = mock.calls[0];
      const exchangeUrl = new URL(exchangeRequest.url);

      assert.equal(exchangeUrl.pathname, "/auth/v1/token");
      assert.equal(exchangeUrl.searchParams.get("grant_type"), "pkce");
      assert.deepEqual(JSON.parse(String(exchangeRequest.init?.body)), {
        auth_code: "oauth-code",
        code_verifier: "pkce-verifier-value",
      });

      const authUserHeaders = new Headers(mock.calls[1].init?.headers);

      assert.equal(new URL(mock.calls[1].url).pathname, "/auth/v1/user");
      assert.equal(authUserHeaders.get("apikey"), "anon-key");
      assert.equal(authUserHeaders.get("authorization"), "Bearer access-token");

      const profileSyncHeaders = new Headers(mock.calls[2].init?.headers);

      assert.equal(new URL(mock.calls[2].url).pathname, "/rest/v1/user_profiles");
      assert.equal(profileSyncHeaders.get("authorization"), "Bearer access-token");
      assert.deepEqual(JSON.parse(String(mock.calls[2].init?.body)), {
        display_name: "Stan Writer",
        email: "writer@example.com",
        id: "user-123",
      });

      const setCookies = getSetCookies(response);

      assert.ok(setCookies.some((cookie) => cookie.startsWith(`${ACCESS_TOKEN_COOKIE}=access-token`)));
      assert.ok(
        setCookies.some((cookie) => cookie.startsWith(`${REFRESH_TOKEN_COOKIE}=refresh-token`)),
      );
      assert.ok(
        setCookies.some((cookie) => cookie.startsWith(`${ACCESS_TOKEN_EXPIRES_AT_COOKIE}=`)),
      );
      assert.ok(
        setCookies.some(
          (cookie) =>
            cookie.startsWith(`${PKCE_CODE_VERIFIER_COOKIE}=`) &&
            /Expires=Thu, 01 Jan 1970/i.test(cookie),
        ),
      );
    });
  });
});

test("GET verifies a magic link token hash and redirects into the workspace", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModule = await import(pathToFileURL(resolve(outputDirectory, "app/auth/callback/route.js")).href);
  const { GET } = routeModule;

  await withAuthEnv(async () => {
    const mock = createFetchMock((call) => {
      const url = new URL(call.url);

      if (url.pathname === "/auth/v1/verify") {
        return createJsonResponse(
          {
            access_token: "magic-access-token",
            expires_in: 1800,
            refresh_token: "magic-refresh-token",
            token_type: "bearer",
          },
          { status: 200 },
        );
      }

      if (url.pathname === "/auth/v1/user") {
        return createJsonResponse(
          {
            email: "magic@example.com",
            id: "user-magic",
            user_metadata: {
              name: "Magic Link User",
            },
          },
          { status: 200 },
        );
      }

      if (url.pathname === "/rest/v1/user_profiles") {
        return createJsonResponse(
          [
            {
              created_at: "2026-03-19T20:00:00.000Z",
              display_name: "Magic Link User",
              email: "magic@example.com",
              id: "user-magic",
              updated_at: "2026-03-19T20:15:00.000Z",
            },
          ],
          { status: 200 },
        );
      }

      assert.fail(`Unexpected fetch request: ${call.url}`);
    });

    await withMockedFetch(mock.fetch, async () => {
      const response = await GET(
        new Request("https://stanlol.test/auth/callback?token_hash=hash-123&type=magiclink"),
      );

      assert.equal(response.status, 307);
      assert.equal(response.headers.get("location"), "https://stanlol.test/workspace");
      assert.equal(mock.calls.length, 3);
      assert.equal(new URL(mock.calls[0].url).pathname, "/auth/v1/verify");
      assert.deepEqual(JSON.parse(String(mock.calls[0].init?.body)), {
        token_hash: "hash-123",
        type: "magiclink",
      });
    });
  });
});

test("GET redirects back to the sign-in screen when the callback payload is invalid", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModule = await import(pathToFileURL(resolve(outputDirectory, "app/auth/callback/route.js")).href);
  const { AUTH_CALLBACK_ERROR_PARAM, GET } = routeModule;

  await withAuthEnv(async () => {
    const response = await GET(new Request("https://stanlol.test/auth/callback"));

    assert.equal(response.status, 307);
    assert.equal(
      response.headers.get("location"),
      `https://stanlol.test/?${AUTH_CALLBACK_ERROR_PARAM}=invalid_auth_callback`,
    );
  });
});

test("GET sanitizes provider callback failures before redirecting back to sign-in", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModule = await import(pathToFileURL(resolve(outputDirectory, "app/auth/callback/route.js")).href);
  const { AUTH_CALLBACK_ERROR_PARAM, GET } = routeModule;

  await withAuthEnv(async () => {
    const response = await GET(
      new Request(
        "https://stanlol.test/auth/callback?error=access_denied&error_code=oauth_denied&error_description=User%20cancelled%20the%20provider%20screen",
      ),
    );

    assert.equal(response.status, 307);
    assert.equal(
      response.headers.get("location"),
      `https://stanlol.test/?${AUTH_CALLBACK_ERROR_PARAM}=auth_provider_failed`,
    );
    assert.equal(
      response.headers.get("location")?.includes("User%20cancelled%20the%20provider%20screen"),
      false,
    );
  });
});
