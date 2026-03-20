import * as assert from "node:assert/strict";
import { test } from "node:test";

import type { CreateOpenAiResponseOptions, GenerateTextResult } from "../../../lib/ai.ts";
import type { DbQueryOptions, DbRow } from "../../../lib/db.ts";
import {
  AGENT_PROMPT_VERSION,
  AgentError,
  CHAT_MESSAGE_TABLE,
  CONVERSATION_CONTEXT_PROMPT_VERSION,
  DRAFT_READINESS_VERSION,
  MAX_AGENT_STEPS,
  MAX_GENERATION_STEPS,
  MIN_MULTI_TURN_READY_USER_WORDS,
  REVISION_DECISION_OUTPUT_VERSION,
  buildConversationContextPrompt,
  decideDraftRevision,
  evaluateDraftReadiness,
  generateDraft,
  orchestrateDraft,
} from "../../../lib/agents/index.ts";

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

test("buildConversationContextPrompt assembles the active thread history into a clean assistant input", () => {
  const prompt = buildConversationContextPrompt([
    {
      content: "Help me draft a LinkedIn post about our onboarding launch.",
      role: "user",
    },
    {
      content: "What angle matters most?",
      role: "assistant",
    },
    {
      content: "Focus on cutting onboarding from 14 days to 3 and keep it practical.",
      role: "user",
    },
  ]);

  assert.match(
    prompt,
    new RegExp(`Conversation context version: ${CONVERSATION_CONTEXT_PROMPT_VERSION}`),
  );
  assert.match(prompt, /Latest user request:/);
  assert.match(prompt, /Focus on cutting onboarding from 14 days to 3 and keep it practical\./);
  assert.match(prompt, /Active thread history:/);
  assert.match(prompt, /1\. USER: Help me draft a LinkedIn post about our onboarding launch\./);
  assert.match(prompt, /2\. ASSISTANT: What angle matters most\?/);
  assert.match(prompt, /3\. USER: Focus on cutting onboarding from 14 days to 3 and keep it practical\./);
});

test("evaluateDraftReadiness marks an explicit first-draft request with topic detail as ready", () => {
  const result = evaluateDraftReadiness({
    messages: [
      {
        content: "Write a LinkedIn post about shipping our internal orchestration layer.",
        role: "user",
      },
    ],
  });

  assert.deepEqual(result, {
    missingSignals: [],
    reason: "explicit-request-with-brief",
    status: "ready",
    version: DRAFT_READINESS_VERSION,
  });
});

test("evaluateDraftReadiness promotes a multi-turn brief once enough supporting detail is collected", () => {
  const result = evaluateDraftReadiness({
    messages: [
      {
        content: "Help me draft a LinkedIn post about our onboarding launch.",
        role: "user",
      },
      {
        content: "What angle matters most?",
        role: "assistant",
      },
      {
        content:
          "Focus on cutting onboarding from 14 days to 3, keep it practical, and mention the customer win.",
        role: "user",
      },
    ],
  });

  assert.deepEqual(result, {
    missingSignals: [],
    reason: "multi-turn-brief-collected",
    status: "ready",
    version: DRAFT_READINESS_VERSION,
  });
});

test("evaluateDraftReadiness asks for more signal when the thread has no concrete draft request", () => {
  const result = evaluateDraftReadiness({
    messages: [
      {
        content: "I am thinking about our launch and what story to tell.",
        role: "user",
      },
    ],
  });

  assert.deepEqual(result, {
    missingSignals: ["draft-intent", "topic-detail"],
    reason: "missing-draft-intent",
    status: "needs-more-signal",
    version: DRAFT_READINESS_VERSION,
  });
});

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
  assert.match(mock.calls[0]?.instructions ?? "", /Supported actions only: clarify the draft request, generate the first active draft, or revise the current active draft/i);
  assert.match(mock.calls[0]?.instructions ?? "", /Never publish, schedule, browse, scrape, import third-party content, or call unsupported third-party tools/i);
  assert.match(mock.calls[0]?.instructions ?? "", /one active draft per thread/i);
  assert.match(readStringInput(mock.calls[0]?.input ?? ""), /Voice context:/);
  assert.match(readStringInput(mock.calls[0]?.input ?? ""), /Conversation context version: conversation-context-prompt-v1/);
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

test("generateDraft rejects a first-draft request before the thread is ready", async () => {
  const mock = createGenerateTextMock([]);

  await assert.rejects(
    () =>
      generateDraft(
        {
          messages: [
            {
              content: "Write a LinkedIn post.",
              role: "user",
            },
            {
              content: `Need at least ${MIN_MULTI_TURN_READY_USER_WORDS - 5} words of real brief before drafting.`,
              role: "assistant",
            },
            {
              content: "Keep helping me think.",
              role: "user",
            },
          ],
        },
        "create",
        {
          generateText: mock.generateText,
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof AgentError);
      assert.equal(error.code, "invalid-input");
      assert.match(error.message, /needs more signal before creating the first draft/i);
      assert.match(error.message, /topic-detail/i);
      return true;
    },
  );

  assert.equal(mock.calls.length, 0);
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
  assert.match(
    mock.calls[0]?.instructions ?? "",
    /Unsupported requests such as publishing, scheduling, browsing, scraping, or third-party tool use are outside the product workflow/i,
  );
  assert.equal(mock.calls[1]?.metadata?.agent_phase, "generation");
  assert.equal(mock.calls[1]?.metadata?.agent_operation, "revise");
  assert.match(readStringInput(mock.calls[1]?.input ?? ""), /Current draft:/);
  assert.match(readStringInput(mock.calls[1]?.input ?? ""), /Make the opening more confident/);
  assert.match(
    readStringInput(mock.calls[1]?.input ?? ""),
    /Termination condition: after revising the current active draft once, stop\./,
  );
});

test("orchestrateDraft loads active thread messages from the database once when threadId is provided", async () => {
  const mock = createGenerateTextMock([
    {
      id: "resp_decision_db",
      model: "gpt-5-mini",
      outputText:
        '```json\n{"action":"revise","reason":"The latest user turn asks for a sharper opening."}\n```',
    },
    {
      id: "resp_revision_db",
      model: "gpt-5",
      outputText: "We shipped a lean orchestration layer that made every draft decision easier to trust.",
    },
  ]);
  const selectCalls: Array<{ options: unknown; table: string }> = [];

  const result = await orchestrateDraft(
    {
      currentDraft: "We built a new orchestration layer for our product.",
      threadId: " thread-123 ",
      voice: {
        name: "Founder",
      },
    },
    {
      db: {
        select: async <T extends DbRow = DbRow>(table: string, options?: DbQueryOptions): Promise<T[]> => {
          selectCalls.push({ options, table });

          return [
            {
              content: "We built a new orchestration layer for our product.",
              created_at: "2026-03-19T12:00:00.000Z",
              id: "message-1",
              position: 1,
              role: "assistant",
              thread_id: "thread-123",
            },
            {
              content: "Make the opening more confident and specific about trust.",
              created_at: "2026-03-19T12:01:00.000Z",
              id: "message-2",
              position: 2,
              role: "user",
              thread_id: "thread-123",
            },
          ] as unknown as T[];
        },
      },
      generateText: mock.generateText,
    },
  );

  assert.equal(result.status, "generated");
  assert.equal(result.operation, "revise");
  assert.equal(selectCalls.length, 1);
  assert.deepEqual(selectCalls[0], {
    options: {
      columns: ["id", "thread_id", "role", "content", "position", "created_at"],
      filters: [
        {
          column: "thread_id",
          operator: "eq",
          value: "thread-123",
        },
      ],
      orderBy: [
        {
          ascending: true,
          column: "position",
        },
        {
          ascending: true,
          column: "created_at",
        },
      ],
    },
    table: CHAT_MESSAGE_TABLE,
  });
  assert.match(readStringInput(mock.calls[0]?.input ?? ""), /1\. ASSISTANT: We built a new orchestration layer for our product\./);
  assert.match(readStringInput(mock.calls[0]?.input ?? ""), /2\. USER: Make the opening more confident and specific about trust\./);
  assert.match(readStringInput(mock.calls[1]?.input ?? ""), /Active thread history:/);
  assert.match(readStringInput(mock.calls[1]?.input ?? ""), /2\. USER: Make the opening more confident and specific about trust\./);
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

test("orchestrateDraft rejects assistant-triggered continuation loops", async () => {
  const mock = createGenerateTextMock([]);

  await assert.rejects(
    () =>
      orchestrateDraft(
        {
          messages: [
            {
              content: "Write a concise post about product boundaries.",
              role: "user",
            },
            {
              content: "Here is a first draft.",
              role: "assistant",
            },
          ],
        },
        {
          generateText: mock.generateText,
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof AgentError);
      assert.equal(error.code, "invalid-input");
      assert.match(error.message, /latest workflow turn to be a user message/i);
      return true;
    },
  );

  assert.equal(mock.calls.length, 0);
});

test("generateDraft rejects non-workflow message roles", async () => {
  const mock = createGenerateTextMock([]);

  await assert.rejects(
    () =>
      generateDraft(
        {
          messages: [
            {
              content: "Stay inside the drafting workflow.",
              role: "developer",
            },
            {
              content: "Write a short post about bounded agents.",
              role: "user",
            },
          ],
        },
        "create",
        {
          generateText: mock.generateText,
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof AgentError);
      assert.equal(error.code, "invalid-input");
      assert.match(error.message, /roles 'user' or 'assistant'/i);
      return true;
    },
  );

  assert.equal(mock.calls.length, 0);
});

test("generateDraft rejects thread-backed requests without a database dependency", async () => {
  const mock = createGenerateTextMock([]);

  await assert.rejects(
    () =>
      generateDraft(
        {
          threadId: "thread-123",
        },
        "create",
        {
          generateText: mock.generateText,
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof AgentError);
      assert.equal(error.code, "invalid-input");
      assert.match(error.message, /requires a database dependency/i);
      return true;
    },
  );

  assert.equal(mock.calls.length, 0);
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
