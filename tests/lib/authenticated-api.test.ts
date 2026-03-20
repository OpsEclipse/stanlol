import assert from "node:assert/strict";
import test from "node:test";

const authenticatedApiModule = (await import(
  new URL("../../lib/authenticated-api.ts", import.meta.url).href
)) as typeof import("../../lib/authenticated-api");

const {
  DEFAULT_AUTH_ERROR_MESSAGE,
  DEFAULT_UNAUTHORIZED_MESSAGE,
  authenticateApiRequest,
  withAuthenticatedApi,
} = authenticatedApiModule;

type MockFetchCall = {
  init?: RequestInit;
  url: string;
};

function createJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function createFetchMock(responseFactory: (call: MockFetchCall) => Response | Promise<Response>) {
  const calls: MockFetchCall[] = [];

  const mockFetch = async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const call = {
      init,
      url: String(input),
    };

    calls.push(call);
    return responseFactory(call);
  };

  return {
    calls,
    fetch: mockFetch as typeof fetch,
  };
}

function setSupabaseEnv(): () => void {
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

test("authenticateApiRequest returns a 401 response when the bearer token is missing", async () => {
  const request = new Request("https://stanlol.local/api/threads");
  const result = await authenticateApiRequest(request, {
    fetch: async () => {
      assert.fail("fetch should not be called when the authorization header is missing");
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    assert.fail("Expected authentication failure.");
  }

  assert.equal(result.response.status, 401);
  assert.deepEqual(await result.response.json(), {
    error: DEFAULT_UNAUTHORIZED_MESSAGE,
    success: false,
  });
});

test("authenticateApiRequest verifies the token and returns the current user db client", async () => {
  const restoreEnv = setSupabaseEnv();
  const originalFetch = globalThis.fetch;
  const mock = createFetchMock((call) => {
    const url = new URL(call.url);

    if (url.pathname === "/auth/v1/user") {
      return createJsonResponse(
        {
          id: "user-123",
          email: "user@example.com",
        },
        { status: 200 },
      );
    }

    if (url.pathname === "/rest/v1/threads") {
      return createJsonResponse([{ id: "thread-1" }], { status: 200 });
    }

    return createJsonResponse({ message: "unexpected" }, { status: 500 });
  });

  globalThis.fetch = mock.fetch;

  try {
    const request = new Request("https://stanlol.local/api/threads", {
      headers: {
        authorization: "Bearer user-access-token",
      },
    });
    const result = await authenticateApiRequest(request, {
      fetch: mock.fetch,
    });

    assert.equal(result.success, true);

    if (!result.success) {
      assert.fail("Expected authentication success.");
    }

    assert.equal(result.auth.accessToken, "user-access-token");
    assert.deepEqual(result.auth.user, {
      email: "user@example.com",
      id: "user-123",
    });

    const rows = await result.auth.db.select<{ id: string }>("threads");

    assert.deepEqual(rows, [{ id: "thread-1" }]);
    assert.equal(mock.calls.length, 2);

    const authHeaders = new Headers(mock.calls[0].init?.headers);
    const dbHeaders = new Headers(mock.calls[1].init?.headers);

    assert.equal(new URL(mock.calls[0].url).pathname, "/auth/v1/user");
    assert.equal(authHeaders.get("apikey"), "anon-key");
    assert.equal(authHeaders.get("authorization"), "Bearer user-access-token");
    assert.equal(new URL(mock.calls[1].url).pathname, "/rest/v1/threads");
    assert.equal(dbHeaders.get("apikey"), "anon-key");
    assert.equal(dbHeaders.get("authorization"), "Bearer user-access-token");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test("withAuthenticatedApi returns a 401 response and does not call the handler for invalid auth", async () => {
  let wasCalled = false;
  const handler = withAuthenticatedApi(async () => {
    wasCalled = true;
    return new Response("unexpected");
  });
  const request = new Request("https://stanlol.local/api/threads", {
    headers: {
      authorization: "Token not-a-bearer-token",
    },
  });
  const response = await handler(request);

  assert.equal(wasCalled, false);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: DEFAULT_UNAUTHORIZED_MESSAGE,
    success: false,
  });
});

test("withAuthenticatedApi passes the authenticated context into the route handler", async () => {
  const restoreEnv = setSupabaseEnv();
  const mock = createFetchMock((call) => {
    const url = new URL(call.url);

    if (url.pathname === "/auth/v1/user") {
      return createJsonResponse(
        {
          id: "user-789",
          email: "writer@example.com",
        },
        { status: 200 },
      );
    }

    return createJsonResponse({ message: "unexpected" }, { status: 500 });
  });
  const handler = withAuthenticatedApi(
    async (context, request) =>
      Response.json({
        email: context.user.email,
        id: context.user.id,
        path: new URL(request.url).pathname,
      }),
    { fetch: mock.fetch },
  );

  try {
    const response = await handler(
      new Request("https://stanlol.local/api/drafts", {
        headers: {
          authorization: "Bearer another-token",
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      email: "writer@example.com",
      id: "user-789",
      path: "/api/drafts",
    });
  } finally {
    restoreEnv();
  }
});

test("authenticateApiRequest returns a 502 response when Supabase auth verification fails", async () => {
  const restoreEnv = setSupabaseEnv();
  const request = new Request("https://stanlol.local/api/voices", {
    headers: {
      authorization: "Bearer broken-token",
    },
  });

  try {
    const result = await authenticateApiRequest(request, {
      fetch: async () => createJsonResponse({ message: "down" }, { status: 500 }),
    });

    assert.equal(result.success, false);

    if (result.success) {
      assert.fail("Expected authentication failure.");
    }

    assert.equal(result.response.status, 502);
    assert.deepEqual(await result.response.json(), {
      error: DEFAULT_AUTH_ERROR_MESSAGE,
      success: false,
    });
  } finally {
    restoreEnv();
  }
});
