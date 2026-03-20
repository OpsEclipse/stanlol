import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function compileRouteFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-auth-magic-link-route-"));

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
      "app/auth/magic-link/route.ts",
      "lib/db.ts",
      "lib/validation.ts",
    ],
    {
      cwd: projectRoot,
      stdio: "pipe",
    },
  );

  symlinkSync(resolve(projectRoot, "node_modules"), resolve(outputDirectory, "node_modules"), "dir");

  const routeModulePath = resolve(outputDirectory, "app/auth/magic-link/route.js");
  const compiledRoute = readFileSync(routeModulePath, "utf8")
    .replace('from "next/server";', 'from "next/server.js";')
    .replace('from "../../../lib/auth-session";', 'from "../../../lib/auth-session.js";')
    .replace('from "../../../lib/validation";', 'from "../../../lib/validation.js";');

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

test("POST requests a Supabase email magic link and redirects back with a sent status", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModulePath = resolve(outputDirectory, "app/auth/magic-link/route.js");

  assert.equal(existsSync(routeModulePath), true);

  const routeModule = await import(pathToFileURL(routeModulePath).href);

  await withAuthEnv(async () => {
    const mock = createFetchMock((call) => {
      const url = new URL(call.url);

      assert.equal(url.pathname, "/auth/v1/otp");

      return createJsonResponse({}, { status: 200 });
    });

    await withMockedFetch(mock.fetch, async () => {
      const response = await routeModule.POST(
        new Request("https://stanlol.test/auth/magic-link", {
          body: new URLSearchParams({
            email: "Writer@Example.com",
          }),
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          method: "POST",
        }),
      );

      assert.equal(response.status, 303);
      assert.equal(
        response.headers.get("location"),
        "https://stanlol.test/?magicLinkStatus=sent&email=writer%40example.com",
      );
      assert.equal(mock.calls.length, 1);

      const requestHeaders = new Headers(mock.calls[0].init?.headers);

      assert.equal(requestHeaders.get("apikey"), "anon-key");
      assert.deepEqual(JSON.parse(String(mock.calls[0].init?.body)), {
        email: "writer@example.com",
        options: {
          emailRedirectTo: "https://stanlol.test/auth/callback?next=%2Fworkspace",
        },
      });
    });
  });
});

test("POST rejects invalid email values before calling Supabase", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModule = await import(pathToFileURL(resolve(outputDirectory, "app/auth/magic-link/route.js")).href);

  await withAuthEnv(async () => {
    const mock = createFetchMock(() => {
      assert.fail("Supabase should not be called for an invalid email.");
    });

    await withMockedFetch(mock.fetch, async () => {
      const response = await routeModule.POST(
        new Request("https://stanlol.test/auth/magic-link", {
          body: new URLSearchParams({
            email: "not-an-email",
          }),
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          method: "POST",
        }),
      );

      assert.equal(response.status, 303);
      assert.equal(
        response.headers.get("location"),
        "https://stanlol.test/?magicLinkStatus=invalid_email&email=not-an-email",
      );
      assert.equal(mock.calls.length, 0);
    });
  });
});

test("POST redirects back with a failed status when Supabase cannot create the magic link", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModule = await import(pathToFileURL(resolve(outputDirectory, "app/auth/magic-link/route.js")).href);

  await withAuthEnv(async () => {
    const mock = createFetchMock(() => createJsonResponse({ error: "failed" }, { status: 500 }));

    await withMockedFetch(mock.fetch, async () => {
      const response = await routeModule.POST(
        new Request("https://stanlol.test/auth/magic-link", {
          body: new URLSearchParams({
            email: "writer@example.com",
          }),
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          method: "POST",
        }),
      );

      assert.equal(response.status, 303);
      assert.equal(
        response.headers.get("location"),
        "https://stanlol.test/?magicLinkStatus=failed&email=writer%40example.com",
      );
      assert.equal(mock.calls.length, 1);
    });
  });
});
