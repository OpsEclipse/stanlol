import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function compileThreadMessageCreateFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-thread-message-create-"));

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
      "lib/thread-message-create.ts",
    ],
    {
      cwd: projectRoot,
      stdio: "pipe",
    },
  );

  return outputDirectory;
}

test("createAssistantMessage writes the assistant response after the latest thread turn", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileThreadMessageCreateFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const modulePath = resolve(outputDirectory, "thread-message-create.js");

  assert.equal(existsSync(modulePath), true);

  const { ASSISTANT_MESSAGE_ROLE, CHAT_MESSAGE_TABLE, createAssistantMessage } = await import(
    pathToFileURL(modulePath).href
  );
  const calls = [];

  const insertedRow = {
    content: "Here is the tightened draft.",
    created_at: "2026-03-19T22:30:00.000Z",
    id: "message-123",
    position: 5,
    role: ASSISTANT_MESSAGE_ROLE,
    thread_id: "thread-123",
  };

  const db = {
    insert: async (table, values, options) => {
      calls.push({
        options,
        table,
        type: "insert",
        values,
      });

      return [insertedRow];
    },
    selectOne: async (table, options) => {
      calls.push({
        options,
        table,
        type: "selectOne",
      });

      return {
        position: 4,
      };
    },
  };

  const row = await createAssistantMessage(db, {
    content: "  Here is the tightened draft.  ",
    threadId: " thread-123 ",
  });

  assert.deepEqual(row, insertedRow);
  assert.deepEqual(calls, [
    {
      options: {
        columns: ["position"],
        filters: [
          {
            column: "thread_id",
            operator: "eq",
            value: "thread-123",
          },
        ],
        orderBy: {
          ascending: false,
          column: "position",
        },
      },
      table: CHAT_MESSAGE_TABLE,
      type: "selectOne",
    },
    {
      options: {
        columns: ["id", "thread_id", "role", "content", "position", "created_at"],
      },
      table: CHAT_MESSAGE_TABLE,
      type: "insert",
      values: {
        content: "Here is the tightened draft.",
        position: 5,
        role: ASSISTANT_MESSAGE_ROLE,
        thread_id: "thread-123",
      },
    },
  ]);
});

test("createAssistantMessage starts at position one, validates input, and wraps persistence failures", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileThreadMessageCreateFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const modulePath = resolve(outputDirectory, "thread-message-create.js");

  assert.equal(existsSync(modulePath), true);

  const { ASSISTANT_MESSAGE_ROLE, createAssistantMessage } = await import(pathToFileURL(modulePath).href);

  const firstMessageRow = {
    content: "First assistant turn.",
    created_at: "2026-03-19T22:31:00.000Z",
    id: "message-456",
    position: 1,
    role: ASSISTANT_MESSAGE_ROLE,
    thread_id: "thread-456",
  };

  let insertCall = null;

  const firstMessage = await createAssistantMessage(
    {
      insert: async (_table, values) => {
        insertCall = values;
        return [firstMessageRow];
      },
      selectOne: async () => null,
    },
    {
      content: "First assistant turn.",
      threadId: "thread-456",
    },
  );

  assert.deepEqual(firstMessage, firstMessageRow);
  assert.deepEqual(insertCall, {
    content: "First assistant turn.",
    position: 1,
    role: ASSISTANT_MESSAGE_ROLE,
    thread_id: "thread-456",
  });

  await assert.rejects(
    () =>
      createAssistantMessage(
        {
          insert: async () => [],
          selectOne: async () => null,
        },
        {
          content: "assistant reply",
          threadId: "   ",
        },
      ),
    /Failed to persist assistant message: Assistant message threadId cannot be empty/,
  );

  await assert.rejects(
    () =>
      createAssistantMessage(
        {
          insert: async () => [],
          selectOne: async () => null,
        },
        {
          content: "   ",
          threadId: "thread-789",
        },
      ),
    /Failed to persist assistant message: Assistant message content cannot be empty/,
  );

  await assert.rejects(
    () =>
      createAssistantMessage(
        {
          insert: async () => [],
          selectOne: async () => ({
            position: 0,
          }),
        },
        {
          content: "assistant reply",
          threadId: "thread-789",
        },
      ),
    /Failed to persist assistant message: Latest chat message position must be a positive integer/,
  );

  await assert.rejects(
    () =>
      createAssistantMessage(
        {
          insert: async () => [],
          selectOne: async () => null,
        },
        {
          content: "assistant reply",
          threadId: "thread-789",
        },
      ),
    /Failed to persist assistant message: Assistant message insert returned no row/,
  );

  await assert.rejects(
    () =>
      createAssistantMessage(
        {
          insert: async () => [],
          selectOne: async () => {
            throw new Error("permission denied");
          },
        },
        {
          content: "assistant reply",
          threadId: "thread-789",
        },
      ),
    /Failed to persist assistant message: permission denied/,
  );

  await assert.rejects(
    () =>
      createAssistantMessage(
        {
          insert: async () => {
            throw new Error("insert failed");
          },
          selectOne: async () => null,
        },
        {
          content: "assistant reply",
          threadId: "thread-789",
        },
      ),
    /Failed to persist assistant message: insert failed/,
  );
});

test("createUserMessage writes the submitted user turn after the latest thread turn", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileThreadMessageCreateFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const modulePath = resolve(outputDirectory, "thread-message-create.js");

  assert.equal(existsSync(modulePath), true);

  const { CHAT_MESSAGE_TABLE, USER_MESSAGE_ROLE, createUserMessage } = await import(
    pathToFileURL(modulePath).href
  );
  const calls = [];

  const insertedRow = {
    content: "Please make the CTA more direct.",
    created_at: "2026-03-20T14:30:00.000Z",
    id: "message-789",
    position: 3,
    role: USER_MESSAGE_ROLE,
    thread_id: "thread-999",
  };

  const db = {
    insert: async (table, values, options) => {
      calls.push({
        options,
        table,
        type: "insert",
        values,
      });

      return [insertedRow];
    },
    selectOne: async (table, options) => {
      calls.push({
        options,
        table,
        type: "selectOne",
      });

      return {
        position: 2,
      };
    },
  };

  const row = await createUserMessage(db, {
    content: "  Please make the CTA more direct.  ",
    threadId: " thread-999 ",
  });

  assert.deepEqual(row, insertedRow);
  assert.deepEqual(calls, [
    {
      options: {
        columns: ["position"],
        filters: [
          {
            column: "thread_id",
            operator: "eq",
            value: "thread-999",
          },
        ],
        orderBy: {
          ascending: false,
          column: "position",
        },
      },
      table: CHAT_MESSAGE_TABLE,
      type: "selectOne",
    },
    {
      options: {
        columns: ["id", "thread_id", "role", "content", "position", "created_at"],
      },
      table: CHAT_MESSAGE_TABLE,
      type: "insert",
      values: {
        content: "Please make the CTA more direct.",
        position: 3,
        role: USER_MESSAGE_ROLE,
        thread_id: "thread-999",
      },
    },
  ]);
});

test("createUserMessage starts at position one, validates input, and wraps persistence failures", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileThreadMessageCreateFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const modulePath = resolve(outputDirectory, "thread-message-create.js");

  assert.equal(existsSync(modulePath), true);

  const { USER_MESSAGE_ROLE, createUserMessage } = await import(pathToFileURL(modulePath).href);

  const firstMessageRow = {
    content: "First user turn.",
    created_at: "2026-03-20T14:31:00.000Z",
    id: "message-790",
    position: 1,
    role: USER_MESSAGE_ROLE,
    thread_id: "thread-1000",
  };

  let insertCall = null;

  const firstMessage = await createUserMessage(
    {
      insert: async (_table, values) => {
        insertCall = values;
        return [firstMessageRow];
      },
      selectOne: async () => null,
    },
    {
      content: "First user turn.",
      threadId: "thread-1000",
    },
  );

  assert.deepEqual(firstMessage, firstMessageRow);
  assert.deepEqual(insertCall, {
    content: "First user turn.",
    position: 1,
    role: USER_MESSAGE_ROLE,
    thread_id: "thread-1000",
  });

  await assert.rejects(
    () =>
      createUserMessage(
        {
          insert: async () => [],
          selectOne: async () => null,
        },
        {
          content: "user reply",
          threadId: "   ",
        },
      ),
    /Failed to persist user message: User message threadId cannot be empty/,
  );

  await assert.rejects(
    () =>
      createUserMessage(
        {
          insert: async () => [],
          selectOne: async () => null,
        },
        {
          content: "   ",
          threadId: "thread-1001",
        },
      ),
    /Failed to persist user message: User message content cannot be empty/,
  );

  await assert.rejects(
    () =>
      createUserMessage(
        {
          insert: async () => [],
          selectOne: async () => ({
            position: 0,
          }),
        },
        {
          content: "user reply",
          threadId: "thread-1001",
        },
      ),
    /Failed to persist user message: Latest chat message position must be a positive integer/,
  );

  await assert.rejects(
    () =>
      createUserMessage(
        {
          insert: async () => [],
          selectOne: async () => null,
        },
        {
          content: "user reply",
          threadId: "thread-1001",
        },
      ),
    /Failed to persist user message: User message insert returned no row/,
  );

  await assert.rejects(
    () =>
      createUserMessage(
        {
          insert: async () => [],
          selectOne: async () => {
            throw new Error("permission denied");
          },
        },
        {
          content: "user reply",
          threadId: "thread-1001",
        },
      ),
    /Failed to persist user message: permission denied/,
  );

  await assert.rejects(
    () =>
      createUserMessage(
        {
          insert: async () => {
            throw new Error("insert failed");
          },
          selectOne: async () => null,
        },
        {
          content: "user reply",
          threadId: "thread-1001",
        },
      ),
    /Failed to persist user message: insert failed/,
  );
});
