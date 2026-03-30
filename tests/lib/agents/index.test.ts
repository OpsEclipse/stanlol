import * as assert from "node:assert/strict";
import { test } from "node:test";

import type { CreateOpenAiResponseOptions, GenerateTextResult } from "../../../lib/ai";
import {
  AGENT_PROMPT_VERSION,
  AgentError,
  MAX_AGENT_STEPS,
  MAX_GENERATION_STEPS,
  REVISION_DECISION_OUTPUT_VERSION,
  decideDraftRevision,
  generateDraft,
  orchestrateDraft,
} from "../../../lib/agents/index";

interface MockCall {
  input: CreateOpenAiResponseOptions["input"];
  instructions?: string;
  maxOutputTokens?: number;
  metadata?: Record<string, string>;
  model?: string;
  signal?: AbortSignal;
}

function createGenerateTextMock(outputs: Array<{ id: string; model: string; outputText: string }>) {
  const calls: MockCall[] = [];
  let index = 0;

  return {
    calls,
    generateText: async (options: CreateOpenAiResponseOptions): Promise<GenerateTextResult> => {
      calls.push(options as MockCall);

      const output = outputs[index];

      if (!output) {
        throw new Error(`Unexpected generateText call ${index + 1}.`);
      }

      index += 1;

      return {
        ...output,
        response: {
          id: output.id,
          model: output.model,
          output_text: output.outputText,
        },
      };
    },
  };
}

function readStringInput(input: CreateOpenAiResponseOptions["input"]): string {
  if (typeof input !== "string") {
    throw new Error("Expected string input.");
  }

  return input;
}

test("orchestrateDraft generates a first draft in one bounded step", async () => {
  const mock = createGenerateTextMock([
    {
      id: "resp_create",
      model: "gpt-5",
      outputText: "Shipping this week: we turned scattered notes into a tighter launch story.",
    },
  ]);

  const result = await orchestrateDraft(
    {
      attachedImage: {
        altText: "A teammate presenting the launch slide",
        fileName: "launch.png",
        mimeType: "image/png",
      },
      messages: [
        {
          content: "Write a LinkedIn post about shipping our internal orchestration layer.",
          role: "user",
        },
      ],
      metadata: {
        feature: "F005",
      },
      voice: {
        instructions: "Sound crisp and practical.",
        name: "Product Lead",
        sampleText: ["We ship useful systems, not demos."],
      },
    },
    {
      generateText: mock.generateText,
    },
  );

  assert.deepEqual(result, {
    decision: null,
    draftText: "Shipping this week: we turned scattered notes into a tighter launch story.",
    model: "gpt-5",
    operation: "create",
    promptVersion: AGENT_PROMPT_VERSION,
    responseId: "resp_create",
    status: "generated",
    termination: {
      maxSteps: MAX_AGENT_STEPS,
      reason: "draft-created",
      stepsTaken: 1,
    },
  });

  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0]?.metadata?.agent_phase, "generation");
  assert.equal(mock.calls[0]?.metadata?.agent_operation, "create");
  assert.equal(mock.calls[0]?.metadata?.agent_prompt_version, AGENT_PROMPT_VERSION);
  assert.equal(mock.calls[0]?.metadata?.feature, "F005");
  assert.match(mock.calls[0]?.instructions ?? "", /one active draft per thread/i);
  assert.match(readStringInput(mock.calls[0]?.input ?? ""), /Voice context:/);
  assert.match(readStringInput(mock.calls[0]?.input ?? ""), /Name: Product Lead/);
  assert.match(readStringInput(mock.calls[0]?.input ?? ""), /Attached image present\./);
  assert.match(
    readStringInput(mock.calls[0]?.input ?? ""),
    /Termination condition: after producing the first active draft, stop\./,
  );
  assert.match(
    readStringInput(mock.calls[0]?.input ?? ""),
    /A teammate presenting the launch slide/,
  );
});

test("generateDraft returns explicit termination metadata for a single-step create flow", async () => {
  const mock = createGenerateTextMock([
    {
      id: "resp_create_direct",
      model: "gpt-5",
      outputText: "We replaced vague AI loops with a single draft handoff the team can audit.",
    },
  ]);

  const result = await generateDraft(
    {
      messages: [
        {
          content: "Write a LinkedIn post about making agent termination explicit.",
          role: "user",
        },
      ],
    },
    "create",
    {
      generateText: mock.generateText,
    },
  );

  assert.deepEqual(result, {
    draftText: "We replaced vague AI loops with a single draft handoff the team can audit.",
    model: "gpt-5",
    operation: "create",
    responseId: "resp_create_direct",
    termination: {
      maxSteps: MAX_GENERATION_STEPS,
      reason: "draft-created",
      stepsTaken: 1,
    },
  });
});

test("orchestrateDraft revises the existing draft after a revision decision", async () => {
  const mock = createGenerateTextMock([
    {
      id: "resp_decision",
      model: "gpt-5-mini",
      outputText:
        '```json\n{"action":"revise","reason":"The latest user turn asks for a sharper opening."}\n```',
    },
    {
      id: "resp_revision",
      model: "gpt-5",
      outputText: "We shipped a lean orchestration layer that made every draft decision easier to trust.",
    },
  ]);

  const result = await orchestrateDraft(
    {
      currentDraft: "We built a new orchestration layer for our product.",
      messages: [
        {
          content: "We built a new orchestration layer for our product.",
          role: "assistant",
        },
        {
          content: "Make the opening more confident and specific about trust.",
          role: "user",
        },
      ],
      voice: {
        name: "Founder",
      },
    },
    {
      generateText: mock.generateText,
    },
  );

  assert.equal(result.status, "generated");
  assert.equal(result.operation, "revise");
  assert.equal(result.draftText, "We shipped a lean orchestration layer that made every draft decision easier to trust.");
  assert.equal(result.responseId, "resp_revision");
  assert.equal(result.termination.reason, "draft-revised");
  assert.equal(result.termination.stepsTaken, 2);
  assert.deepEqual(result.decision, {
    action: "revise",
    model: "gpt-5-mini",
    rawOutput:
      '```json\n{"action":"revise","reason":"The latest user turn asks for a sharper opening."}\n```',
    reason: "The latest user turn asks for a sharper opening.",
    responseId: "resp_decision",
    version: REVISION_DECISION_OUTPUT_VERSION,
  });

  assert.equal(mock.calls.length, 2);
  assert.equal(mock.calls[0]?.metadata?.agent_phase, "revision-decision");
  assert.equal(mock.calls[1]?.metadata?.agent_phase, "generation");
  assert.equal(mock.calls[1]?.metadata?.agent_operation, "revise");
  assert.match(readStringInput(mock.calls[1]?.input ?? ""), /Current draft:/);
  assert.match(readStringInput(mock.calls[1]?.input ?? ""), /Make the opening more confident/);
  assert.match(
    readStringInput(mock.calls[1]?.input ?? ""),
    /Termination condition: after revising the current active draft once, stop\./,
  );
});

test("orchestrateDraft preserves the current draft when no revision is requested", async () => {
  const mock = createGenerateTextMock([
    {
      id: "resp_keep",
      model: "gpt-5-mini",
      outputText: '{"action":"keep","reason":"The latest user turn acknowledges the draft but does not request changes."}',
    },
  ]);

  const result = await orchestrateDraft(
    {
      currentDraft: "The draft should stay as-is.",
      messages: [
        {
          content: "The draft should stay as-is.",
          role: "assistant",
        },
        {
          content: "Thanks, that helps.",
          role: "user",
        },
      ],
    },
    {
      generateText: mock.generateText,
    },
  );

  assert.deepEqual(result, {
    decision: {
      action: "keep",
      model: "gpt-5-mini",
      rawOutput:
        '{"action":"keep","reason":"The latest user turn acknowledges the draft but does not request changes."}',
      reason: "The latest user turn acknowledges the draft but does not request changes.",
      responseId: "resp_keep",
      version: REVISION_DECISION_OUTPUT_VERSION,
    },
    draftText: "The draft should stay as-is.",
    model: null,
    operation: "retain",
    promptVersion: AGENT_PROMPT_VERSION,
    responseId: null,
    status: "unchanged",
    termination: {
      maxSteps: MAX_AGENT_STEPS,
      reason: "revision-not-requested",
      stepsTaken: 1,
    },
  });

  assert.equal(mock.calls.length, 1);
});

test("decideDraftRevision rejects invalid structured outputs", async () => {
  const mock = createGenerateTextMock([
    {
      id: "resp_invalid",
      model: "gpt-5-mini",
      outputText: '{"action":"rewrite","reason":""}',
    },
  ]);

  await assert.rejects(
    () =>
      decideDraftRevision(
        {
          currentDraft: "Draft text",
          messages: [
            {
              content: "Draft text",
              role: "assistant",
            },
            {
              content: "Make it stronger.",
              role: "user",
            },
          ],
        },
        {
          generateText: mock.generateText,
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof AgentError);
      assert.equal(error.code, "invalid-response");
      assert.match(error.message, /action 'keep' or 'revise'/);
      return true;
    },
  );
});
