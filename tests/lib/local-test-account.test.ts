import assert from "node:assert/strict";
import test from "node:test";

import type { DbQueryOptions, DbRow, SupabaseDbClient } from "../../lib/db";

const localTestAccountModule = (await import(
  new URL("../../lib/local-test-account.ts", import.meta.url).href
)) as typeof import("../../lib/local-test-account");

const {
  findSeededLocalTestAccount,
  getConfiguredLocalTestAccountEmail,
  LOCAL_TEST_ACCOUNT_ENV_VARS,
} = localTestAccountModule;

function createEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    ...overrides,
  };
}

function createUnexpectedDbMethod(methodName: string) {
  return async (): Promise<never> => {
    throw new Error(`Unexpected ${methodName} call.`);
  };
}

function createDbMock(result: DbRow | null) {
  const calls: Array<{ options?: DbQueryOptions; table: string }> = [];

  const db = {
    insert: createUnexpectedDbMethod("insert"),
    remove: createUnexpectedDbMethod("remove"),
    rpc: createUnexpectedDbMethod("rpc"),
    select: createUnexpectedDbMethod("select"),
    selectOne: async <T extends DbRow = DbRow>(
      table: string,
      options?: DbQueryOptions,
    ): Promise<T | null> => {
      calls.push({ options, table });
      return result as T | null;
    },
    update: createUnexpectedDbMethod("update"),
    upsert: createUnexpectedDbMethod("upsert"),
  } satisfies SupabaseDbClient;

  return { calls, db };
}

test("defines the local test-account email environment variable in one place", () => {
  assert.deepEqual(LOCAL_TEST_ACCOUNT_ENV_VARS, {
    email: "STANLOL_LOCAL_TEST_ACCOUNT_EMAIL",
  });
});

test("normalizes the configured local test-account email", () => {
  const env = createEnv({
    [LOCAL_TEST_ACCOUNT_ENV_VARS.email]: " Seeded.User@Example.com ",
  });

  assert.equal(getConfiguredLocalTestAccountEmail(env), "seeded.user@example.com");
});

test("returns null without querying when local development is disabled", async () => {
  const { calls, db } = createDbMock({
    email: "seeded.user@example.com",
    id: "user-123",
  });

  const account = await findSeededLocalTestAccount({
    db,
    env: createEnv({
      NODE_ENV: "production",
      [LOCAL_TEST_ACCOUNT_ENV_VARS.email]: "seeded.user@example.com",
    }),
  });

  assert.equal(account, null);
  assert.deepEqual(calls, []);
});

test("returns null without querying when the configured local test-account email is missing", async () => {
  const { calls, db } = createDbMock({
    email: "seeded.user@example.com",
    id: "user-123",
  });

  const account = await findSeededLocalTestAccount({
    db,
    env: createEnv(),
  });

  assert.equal(account, null);
  assert.deepEqual(calls, []);
});

test("looks up the seeded local test account from user_profiles", async () => {
  const { calls, db } = createDbMock({
    display_name: "Seeded Writer",
    email: "seeded.user@example.com",
    id: "user-123",
  });

  const account = await findSeededLocalTestAccount({
    db,
    env: createEnv({
      [LOCAL_TEST_ACCOUNT_ENV_VARS.email]: " Seeded.User@Example.com ",
    }),
  });

  assert.deepEqual(account, {
    displayName: "Seeded Writer",
    email: "seeded.user@example.com",
    id: "user-123",
  });
  assert.deepEqual(calls, [
    {
      options: {
        columns: ["id", "email", "display_name"],
        filters: [{ column: "email", operator: "ilike", value: "seeded.user@example.com" }],
      },
      table: "user_profiles",
    },
  ]);
});

test("returns null when the seeded local test account profile does not exist", async () => {
  const { db } = createDbMock(null);

  const account = await findSeededLocalTestAccount({
    db,
    env: createEnv({
      [LOCAL_TEST_ACCOUNT_ENV_VARS.email]: "seeded.user@example.com",
    }),
  });

  assert.equal(account, null);
});
