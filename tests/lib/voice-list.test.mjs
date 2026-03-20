import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function compileVoiceListFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-voice-list-"));

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
      "lib/voice-list.ts",
    ],
    {
      cwd: projectRoot,
      stdio: "pipe",
    },
  );

  return outputDirectory;
}

test("listVoiceProfiles loads the current user's saved voices in recent-first order", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileVoiceListFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const modulePath = resolve(outputDirectory, "voice-list.js");

  assert.equal(existsSync(modulePath), true);

  const { VOICE_PROFILE_TABLE, listVoiceProfiles } = await import(pathToFileURL(modulePath).href);
  let selectCall = null;

  const voiceRows = [
    {
      created_at: "2026-03-19T22:00:00.000Z",
      description: "Long-form storytelling tone",
      id: "voice-456",
      instructions: "Write with clear narrative transitions.",
      name: "Storyteller",
      updated_at: "2026-03-19T22:10:00.000Z",
      user_id: "user-123",
    },
    {
      created_at: "2026-03-19T20:00:00.000Z",
      description: null,
      id: "voice-123",
      instructions: "Keep the writing direct and practical.",
      name: "Operator",
      updated_at: "2026-03-19T20:05:00.000Z",
      user_id: "user-123",
    },
  ];

  const db = {
    select: async (table, options) => {
      selectCall = { options, table };
      return voiceRows;
    },
  };

  const rows = await listVoiceProfiles(db, {
    userId: " user-123 ",
  });

  assert.deepEqual(rows, voiceRows);
  assert.deepEqual(selectCall, {
    options: {
      columns: ["id", "user_id", "name", "description", "instructions", "created_at", "updated_at"],
      filters: [{ column: "user_id", operator: "eq", value: "user-123" }],
      orderBy: {
        ascending: false,
        column: "updated_at",
      },
    },
    table: VOICE_PROFILE_TABLE,
  });
});

test("listVoiceProfiles validates input and wraps select failures", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileVoiceListFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const modulePath = resolve(outputDirectory, "voice-list.js");

  assert.equal(existsSync(modulePath), true);

  const { listVoiceProfiles } = await import(pathToFileURL(modulePath).href);

  await assert.rejects(
    () =>
      listVoiceProfiles(
        {
          select: async () => {
            throw new Error("permission denied");
          },
        },
        {
          userId: "   ",
        },
      ),
    /Failed to list voice profiles: Voice profile userId cannot be empty/,
  );

  await assert.rejects(
    () =>
      listVoiceProfiles(
        {
          select: async () => {
            throw new Error("permission denied");
          },
        },
        {
          userId: "user-123",
        },
      ),
    /Failed to list voice profiles: permission denied/,
  );
});

test("getVoiceProfile loads one saved voice and returns null when it is missing", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileVoiceListFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const modulePath = resolve(outputDirectory, "voice-list.js");

  assert.equal(existsSync(modulePath), true);

  const { VOICE_PROFILE_TABLE, getVoiceProfile } = await import(pathToFileURL(modulePath).href);
  let selectOneCall = null;

  const voiceRow = {
    created_at: "2026-03-19T22:00:00.000Z",
    description: "A calm operator voice",
    id: "voice-123",
    instructions: "Use short paragraphs and precise verbs.",
    name: "Calm Operator",
    updated_at: "2026-03-19T22:05:00.000Z",
    user_id: "user-123",
  };

  const db = {
    selectOne: async (table, options) => {
      selectOneCall = { options, table };
      return voiceRow;
    },
  };

  const row = await getVoiceProfile(db, {
    userId: " user-123 ",
    voiceId: " voice-123 ",
  });

  assert.deepEqual(row, voiceRow);
  assert.deepEqual(selectOneCall, {
    options: {
      columns: ["id", "user_id", "name", "description", "instructions", "created_at", "updated_at"],
      filters: [
        { column: "id", operator: "eq", value: "voice-123" },
        { column: "user_id", operator: "eq", value: "user-123" },
      ],
    },
    table: VOICE_PROFILE_TABLE,
  });

  const missingRow = await getVoiceProfile(
    {
      selectOne: async () => null,
    },
    {
      userId: "user-123",
      voiceId: "voice-456",
    },
  );

  assert.equal(missingRow, null);

  await assert.rejects(
    () =>
      getVoiceProfile(
        {
          selectOne: async () => {
            throw new Error("permission denied");
          },
        },
        {
          userId: "   ",
          voiceId: "voice-123",
        },
      ),
    /Failed to fetch voice profile: Voice profile userId cannot be empty/,
  );

  await assert.rejects(
    () =>
      getVoiceProfile(
        {
          selectOne: async () => {
            throw new Error("permission denied");
          },
        },
        {
          userId: "user-123",
          voiceId: "   ",
        },
      ),
    /Failed to fetch voice profile: Voice profile voiceId cannot be empty/,
  );

  await assert.rejects(
    () =>
      getVoiceProfile(
        {
          selectOne: async () => {
            throw new Error("permission denied");
          },
        },
        {
          userId: "user-123",
          voiceId: "voice-123",
        },
      ),
    /Failed to fetch voice profile: permission denied/,
  );
});

test("assertVoiceProfileOwnership rejects voices the current user does not own", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileVoiceListFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const modulePath = resolve(outputDirectory, "voice-list.js");

  assert.equal(existsSync(modulePath), true);

  const { VOICE_PROFILE_TABLE, assertVoiceProfileOwnership } = await import(pathToFileURL(modulePath).href);
  let selectOneCall = null;

  await assert.doesNotReject(() =>
    assertVoiceProfileOwnership(
      {
        selectOne: async (table, options) => {
          selectOneCall = { options, table };
          return { id: "voice-123" };
        },
      },
      {
        userId: " user-123 ",
        voiceId: " voice-123 ",
      },
    ),
  );

  assert.deepEqual(selectOneCall, {
    options: {
      columns: ["id"],
      filters: [
        { column: "id", operator: "eq", value: "voice-123" },
        { column: "user_id", operator: "eq", value: "user-123" },
      ],
    },
    table: VOICE_PROFILE_TABLE,
  });

  await assert.rejects(
    () =>
      assertVoiceProfileOwnership(
        {
          selectOne: async () => null,
        },
        {
          userId: "user-123",
          voiceId: "voice-456",
        },
      ),
    /Failed to verify voice ownership: Voice profile was not found for the current user/,
  );

  await assert.rejects(
    () =>
      assertVoiceProfileOwnership(
        {
          selectOne: async () => {
            throw new Error("permission denied");
          },
        },
        {
          userId: "user-123",
          voiceId: "voice-123",
        },
      ),
    /Failed to verify voice ownership: permission denied/,
  );
});
