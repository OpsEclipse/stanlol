import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function compileThreadCreateFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-thread-create-"));

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
      "lib/thread-create.ts",
    ],
    {
      cwd: projectRoot,
      stdio: "pipe",
    },
  );

  return outputDirectory;
}

test("createThread writes a new empty chat thread row", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileThreadCreateFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const modulePath = resolve(outputDirectory, "thread-create.js");

  assert.equal(existsSync(modulePath), true);

  const { CHAT_THREAD_TABLE, createThread } = await import(pathToFileURL(modulePath).href);
  let insertCall = null;

  const insertedRow = {
    created_at: "2026-03-19T22:00:00.000Z",
    id: "thread-123",
    title: null,
    updated_at: "2026-03-19T22:00:00.000Z",
    user_id: "user-123",
  };

  const db = {
    insert: async (table, values, options) => {
      insertCall = { options, table, values };
      return [insertedRow];
    },
  };

  const row = await createThread(db, {
    userId: " user-123 ",
  });

  assert.deepEqual(row, insertedRow);
  assert.deepEqual(insertCall, {
    options: {
      columns: ["id", "user_id", "title", "created_at", "updated_at"],
    },
    table: CHAT_THREAD_TABLE,
    values: {
      title: null,
      user_id: "user-123",
    },
  });
});

test("createThread validates required input and wraps insert failures", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileThreadCreateFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const modulePath = resolve(outputDirectory, "thread-create.js");

  assert.equal(existsSync(modulePath), true);

  const { createThread } = await import(pathToFileURL(modulePath).href);

  await assert.rejects(
    () =>
      createThread(
        {
          insert: async () => {
            throw new Error("permission denied");
          },
        },
        {
          userId: "   ",
        },
      ),
    /Failed to create chat thread: Chat thread userId cannot be empty/,
  );

  await assert.rejects(
    () =>
      createThread(
        {
          insert: async () => [],
        },
        {
          userId: "user-456",
        },
      ),
    /Failed to create chat thread: Chat thread insert returned no row/,
  );

  await assert.rejects(
    () =>
      createThread(
        {
          insert: async () => {
            throw new Error("permission denied");
          },
        },
        {
          userId: "user-789",
        },
      ),
    /Failed to create chat thread: permission denied/,
  );
});
