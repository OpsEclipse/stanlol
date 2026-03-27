import * as assert from "node:assert/strict";
import { test } from "node:test";

import {
  GENERATION_RESULT_VERSION,
  createFailedGenerationResult,
  createGeneratedGenerationResult,
  createUnchangedGenerationResult,
  getAssistantOutputText,
  hasAssistantOutput,
  isFailedGenerationResult,
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
