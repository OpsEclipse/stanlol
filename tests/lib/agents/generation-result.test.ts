import * as assert from "node:assert/strict";
import { test } from "node:test";

import type {
  DbMutationOptions,
  DbMutationPayload,
  DbRow,
  SupabaseDbClient,
} from "../../../lib/db.ts";
import {
  GENERATION_RESULT_VERSION,
  createFailedGenerationResult,
  createGeneratedGenerationResult,
  createUnchangedGenerationResult,
  getAssistantOutputText,
  hasAssistantOutput,
  isFailedGenerationResult,
  logSuccessfulGenerationResult,
} from "../../../lib/agents/generation-result.ts";

test("createGeneratedGenerationResult returns a stable generated contract", () => {
  const result = createGeneratedGenerationResult({
    model: "  gpt-5  ",
    operation: "create",
    outputText: "  A tighter launch update for LinkedIn.  ",
    promptVersion: "  draft-orchestration-v1  ",
    responseId: "  resp_123  ",
  });

  assert.deepEqual(result, {
    assistant: {
      role: "assistant",
      text: "A tighter launch update for LinkedIn.",
    },
    generation: {
      model: "gpt-5",
      operation: "create",
      promptVersion: "draft-orchestration-v1",
      responseId: "resp_123",
    },
    status: "generated",
    version: GENERATION_RESULT_VERSION,
  });
  assert.equal(hasAssistantOutput(result), true);
  assert.equal(isFailedGenerationResult(result), false);
  assert.equal(getAssistantOutputText(result), "A tighter launch update for LinkedIn.");
});

test("createUnchangedGenerationResult preserves assistant text in a retain contract", () => {
  const result = createUnchangedGenerationResult({
    outputText: " Keep the current draft as-is. ",
    promptVersion: "draft-orchestration-v1",
  });

  assert.deepEqual(result, {
    assistant: {
      role: "assistant",
      text: "Keep the current draft as-is.",
    },
    generation: {
      model: null,
      operation: "retain",
      promptVersion: "draft-orchestration-v1",
      responseId: null,
    },
    status: "unchanged",
    version: GENERATION_RESULT_VERSION,
  });
  assert.equal(hasAssistantOutput(result), true);
  assert.equal(getAssistantOutputText(result), "Keep the current draft as-is.");
});

test("createFailedGenerationResult returns a stable failure contract", () => {
  const result = createFailedGenerationResult({
    code: " request-failed ",
    message: " OpenAI timed out ",
    model: " gpt-5-mini ",
    operation: "revise",
    promptVersion: " draft-orchestration-v1 ",
    responseId: " resp_456 ",
  });

  assert.deepEqual(result, {
    assistant: null,
    error: {
      code: "request-failed",
      message: "OpenAI timed out",
    },
    generation: {
      model: "gpt-5-mini",
      operation: "revise",
      promptVersion: "draft-orchestration-v1",
      responseId: "resp_456",
    },
    status: "failed",
    version: GENERATION_RESULT_VERSION,
  });
  assert.equal(hasAssistantOutput(result), false);
  assert.equal(isFailedGenerationResult(result), true);
  assert.equal(getAssistantOutputText(result), null);
});

test("generation result helpers reject empty required text", () => {
  assert.throws(
    () =>
      createGeneratedGenerationResult({
        model: "gpt-5",
        operation: "create",
        outputText: "   ",
        responseId: "resp_789",
      }),
    /Generation output cannot be empty/,
  );

  assert.throws(
    () =>
      createFailedGenerationResult({
        message: "   ",
        operation: "create",
      }),
    /Generation error message cannot be empty/,
  );
});

test("logSuccessfulGenerationResult writes a success audit event from the structured result contract", async () => {
  const result = createGeneratedGenerationResult({
    model: "gpt-5",
    operation: "create",
    outputText: "A tighter launch update for LinkedIn.",
    promptVersion: "draft-orchestration-v1",
    responseId: "resp_123",
  });
  let insertCall: {
    options?: DbMutationOptions;
    table: string;
    values: DbMutationPayload;
  } | null = null;
  const insert: SupabaseDbClient["insert"] = async <T extends DbRow = DbRow>(
    table: string,
    values: DbMutationPayload | readonly DbMutationPayload[],
    options?: DbMutationOptions,
  ): Promise<T[]> => {
    if (Array.isArray(values)) {
      throw new Error("Expected a single generation audit insert payload.");
    }

    const normalizedValues = values as DbMutationPayload;

    insertCall = {
      options,
      table,
      values: normalizedValues,
    };

    return [
      {
        created_at: "2026-03-19T20:00:00.000Z",
        id: "audit-1",
        ...normalizedValues,
      },
    ] as unknown as T[];
  };

  const row = await logSuccessfulGenerationResult(
    {
      insert,
    } as never,
    result,
    {
      draftId: " draft-123 ",
      threadId: " thread-123 ",
      userId: " user-123 ",
      voiceId: " voice-123 ",
    },
  );

  assert.equal(row.outcome, "success");
  assert.deepEqual(insertCall, {
    options: {
      columns: [
        "id",
        "user_id",
        "thread_id",
        "draft_id",
        "voice_id",
        "outcome",
        "revision_reason",
        "model_identifier",
        "generation_latency_ms",
        "error_message",
        "metadata",
        "created_at",
      ],
    },
    table: "generation_audit_events",
    values: {
      draft_id: "draft-123",
      error_message: null,
      generation_latency_ms: null,
      metadata: {
        assistantRole: "assistant",
        assistantTextLength: result.assistant.text.length,
        promptVersion: "draft-orchestration-v1",
        responseId: "resp_123",
        resultStatus: "generated",
        resultVersion: GENERATION_RESULT_VERSION,
      },
      model_identifier: null,
      outcome: "success",
      revision_reason: null,
      thread_id: "thread-123",
      user_id: "user-123",
      voice_id: "voice-123",
    },
  });
});

test("logSuccessfulGenerationResult rejects failed generation results", async () => {
  const failedResult = createFailedGenerationResult({
    message: "OpenAI timed out",
    operation: "revise",
  });

  await assert.rejects(
    () =>
      logSuccessfulGenerationResult(
        {
          insert: async () => [],
        } as never,
        failedResult,
        {
          userId: "user-123",
        },
      ),
    /Successful generation audit events require a non-failed generation result/,
  );
});
