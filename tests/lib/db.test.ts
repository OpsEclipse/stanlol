import assert from "node:assert/strict";
import test from "node:test";

const dbModule = (await import(new URL("../../lib/db.ts", import.meta.url).href)) as typeof import("../../lib/db");
const {
  SupabaseDbError,
  createSupabaseDbClient,
  getAdminDb,
  getDb,
  getUserDb,
} = dbModule;

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

test("select builds Supabase REST query parameters and auth headers", async () => {
  const mock = createFetchMock(() => createJsonResponse([{ id: "thread-1", title: "Hello" }], { status: 200 }));
  const db = createSupabaseDbClient({
    apiKey: "anon-key",
    authToken: "user-token",
    fetch: mock.fetch,
    url: "https://project.supabase.co",
  });

  const rows = await db.select<{ id: string; title: string }>("threads", {
    columns: ["id", "title"],
    filters: [
      { column: "user_id", operator: "eq", value: "user-1" },
      { column: "archived_at", operator: "is", value: null },
      { column: "id", operator: "in", value: ["thread-1", "thread-2"] },
    ],
    limit: 25,
    offset: 50,
    orderBy: { column: "created_at", ascending: false, nulls: "last" },
  });

  assert.deepEqual(rows, [{ id: "thread-1", title: "Hello" }]);
  assert.equal(mock.calls.length, 1);

  const call = mock.calls[0];
  const headers = new Headers(call.init?.headers);
  const url = new URL(call.url);

  assert.equal(call.init?.method, "GET");
  assert.equal(url.pathname, "/rest/v1/threads");
  assert.equal(url.searchParams.get("select"), "id,title");
  assert.equal(url.searchParams.get("user_id"), "eq.user-1");
  assert.equal(url.searchParams.get("archived_at"), "is.null");
  assert.equal(url.searchParams.get("id"), "in.(thread-1,thread-2)");
  assert.equal(url.searchParams.get("order"), "created_at.desc.nullslast");
  assert.equal(url.searchParams.get("limit"), "25");
  assert.equal(url.searchParams.get("offset"), "50");
  assert.equal(headers.get("apikey"), "anon-key");
  assert.equal(headers.get("authorization"), "Bearer user-token");
  assert.equal(headers.get("accept-profile"), "public");
  assert.equal(headers.get("content-profile"), null);
});

test("insert uses POST, content headers, and representation return mode", async () => {
  const mock = createFetchMock(() => createJsonResponse([{ id: "thread-1", title: "Hello" }], { status: 201 }));
  const db = createSupabaseDbClient({
    apiKey: "service-role-key",
    fetch: mock.fetch,
    schema: "app",
    url: "https://project.supabase.co",
  });

  const rows = await db.insert<{ id: string; title: string }>("threads", {
    title: "Hello",
    user_id: "user-1",
  });

  assert.deepEqual(rows, [{ id: "thread-1", title: "Hello" }]);
  assert.equal(mock.calls.length, 1);

  const call = mock.calls[0];
  const headers = new Headers(call.init?.headers);

  assert.equal(call.init?.method, "POST");
  assert.equal(call.init?.body, JSON.stringify({ title: "Hello", user_id: "user-1" }));
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("content-profile"), "app");
  assert.equal(headers.get("prefer"), "return=representation");
  assert.equal(headers.get("authorization"), "Bearer service-role-key");
});

test("selectOne returns null when Supabase returns no rows", async () => {
  const mock = createFetchMock(() => createJsonResponse([], { status: 200 }));
  const db = createSupabaseDbClient({
    apiKey: "anon-key",
    fetch: mock.fetch,
    url: "https://project.supabase.co",
  });

  const row = await db.selectOne<{ id: string }>("threads", {
    filters: [{ column: "id", operator: "eq", value: "missing-thread" }],
  });

  assert.equal(row, null);
  assert.equal(new URL(mock.calls[0].url).searchParams.get("limit"), "1");
});

test("getDb, getUserDb, and getAdminDb use the expected environment credentials", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mock = createFetchMock(() => createJsonResponse([], { status: 200 }));

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  globalThis.fetch = mock.fetch;

  try {
    await getDb().select("threads");
    await getUserDb("user-access-token").select("threads");
    await getAdminDb().select("threads");
  } finally {
    globalThis.fetch = originalFetch;

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

    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }
  }

  assert.equal(mock.calls.length, 3);

  const anonymousHeaders = new Headers(mock.calls[0].init?.headers);
  const userHeaders = new Headers(mock.calls[1].init?.headers);
  const adminHeaders = new Headers(mock.calls[2].init?.headers);

  assert.equal(anonymousHeaders.get("apikey"), "anon-key");
  assert.equal(anonymousHeaders.get("authorization"), "Bearer anon-key");
  assert.equal(userHeaders.get("apikey"), "anon-key");
  assert.equal(userHeaders.get("authorization"), "Bearer user-access-token");
  assert.equal(adminHeaders.get("apikey"), "service-role-key");
  assert.equal(adminHeaders.get("authorization"), "Bearer service-role-key");
});

test("SupabaseDbError exposes status and parsed error details", async () => {
  const mock = createFetchMock(() =>
    createJsonResponse(
      {
        code: "23505",
        details: "Key (id)=(thread-1) already exists.",
        hint: "Use upsert instead.",
        message: "duplicate key value violates unique constraint",
      },
      { status: 409, statusText: "Conflict" },
    ),
  );
  const db = createSupabaseDbClient({
    apiKey: "service-role-key",
    fetch: mock.fetch,
    url: "https://project.supabase.co",
  });

  await assert.rejects(
    () =>
      db.insert("threads", {
        id: "thread-1",
      }),
    (error: unknown) => {
      assert(error instanceof SupabaseDbError);
      assert.equal(error.status, 409);
      assert.equal(error.statusText, "Conflict");
      assert.equal(error.message, "duplicate key value violates unique constraint");

      if (typeof error.details === "object" && error.details !== null && "hint" in error.details) {
        assert.equal(error.details.hint, "Use upsert instead.");
      } else {
        assert.fail("Expected structured Supabase error details.");
      }

      return true;
    },
  );
});
