import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function compileThreadOwnershipFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-thread-ownership-"));

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
      "lib/thread-ownership.ts",
    ],
    {
      cwd: projectRoot,
      stdio: "pipe",
    },
  );

  return outputDirectory;
}

test("getOwnedThread loads a thread only when it belongs to the authenticated user", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileThreadOwnershipFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const modulePath = resolve(outputDirectory, "thread-ownership.js");

  assert.equal(existsSync(modulePath), true);

  const { CHAT_THREAD_TABLE, getOwnedThread } = await import(pathToFileURL(modulePath).href);
  let selectOneCall = null;

  const threadRow = {
    created_at: "2026-03-19T22:00:00.000Z",
    id: "thread-123",
    title: "Launch update",
    updated_at: "2026-03-19T22:05:00.000Z",
    user_id: "user-123",
  };

  const db = {
    selectOne: async (table, options) => {
      selectOneCall = { options, table };
      return threadRow;
    },
  };

  const row = await getOwnedThread(db, {
    threadId: " thread-123 ",
    userId: " user-123 ",
  });

  assert.deepEqual(row, threadRow);
  assert.deepEqual(selectOneCall, {
    options: {
      columns: ["id", "user_id", "title", "created_at", "updated_at"],
      filters: [
        { column: "id", operator: "eq", value: "thread-123" },
        { column: "user_id", operator: "eq", value: "user-123" },
      ],
    },
    table: CHAT_THREAD_TABLE,
  });
});

test("getOwnedThread returns null when the thread is missing and wraps ownership check failures", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileThreadOwnershipFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const modulePath = resolve(outputDirectory, "thread-ownership.js");

  assert.equal(existsSync(modulePath), true);

  const { getOwnedThread } = await import(pathToFileURL(modulePath).href);

  const missingRow = await getOwnedThread(
    {
      selectOne: async () => null,
    },
    {
      threadId: "thread-456",
      userId: "user-123",
    },
  );

  assert.equal(missingRow, null);

  await assert.rejects(
    () =>
      getOwnedThread(
        {
          selectOne: async () => {
            throw new Error("permission denied");
          },
        },
        {
          threadId: "   ",
          userId: "user-123",
        },
      ),
    /Failed to enforce chat thread ownership: Chat thread threadId cannot be empty/,
  );

  await assert.rejects(
    () =>
      getOwnedThread(
        {
          selectOne: async () => {
            throw new Error("permission denied");
          },
        },
        {
          threadId: "thread-123",
          userId: "   ",
        },
      ),
    /Failed to enforce chat thread ownership: Chat thread userId cannot be empty/,
  );

  await assert.rejects(
    () =>
      getOwnedThread(
        {
          selectOne: async () => {
            throw new Error("permission denied");
          },
        },
        {
          threadId: "thread-123",
          userId: "user-123",
        },
      ),
    /Failed to enforce chat thread ownership: permission denied/,
  );
});
