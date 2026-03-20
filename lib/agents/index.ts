import { generateText, type OpenAiMessage } from "../ai.ts";
import type { DbRow, SupabaseDbClient } from "../db.ts";

export const AGENT_PROMPT_VERSION = "draft-orchestration-v1";
export const CONVERSATION_CONTEXT_PROMPT_VERSION = "conversation-context-prompt-v1";
export const DRAFT_READINESS_VERSION = "draft-readiness-v1";
export const MAX_AGENT_STEPS = 2;
export const MAX_GENERATION_STEPS = 1;
export const REVISION_DECISION_OUTPUT_VERSION = "revision-decision-v1";
export const MIN_MULTI_TURN_READY_USER_WORDS = 18;
export const CHAT_MESSAGE_TABLE = "chat_messages";

export type RevisionDecisionAction = "keep" | "revise";
export type DraftOperation = "create" | "retain" | "revise";
export type DraftResultStatus = "generated" | "unchanged";
export type DraftWorkflowMessageRole = "assistant" | "user";
export type DraftReadinessStatus = "needs-more-signal" | "ready";
export type DraftReadinessMissingSignal =
  | "draft-intent"
  | "topic-detail"
  | "supporting-detail";
export type AgentTerminationReason =
  | "draft-created"
  | "draft-revised"
  | "revision-not-requested";

export interface AgentVoiceContext {
  instructions?: string | null;
  name: string;
  sampleText?: string[] | null;
}

export interface AgentImageContext {
  altText?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
}

export interface DraftOrchestrationRequest {
  attachedImage?: AgentImageContext | null;
  currentDraft?: string | null;
  messages?: OpenAiMessage[];
  metadata?: Record<string, string>;
  model?: string;
  signal?: AbortSignal;
  threadId?: string;
  voice?: AgentVoiceContext | null;
}

export interface RevisionDecision {
  action: RevisionDecisionAction;
  model: string;
  rawOutput: string;
  reason: string;
  responseId: string;
  version: typeof REVISION_DECISION_OUTPUT_VERSION;
}

export interface DraftReadinessEvaluation {
  missingSignals: DraftReadinessMissingSignal[];
  reason:
    | "active-draft-present"
    | "explicit-request-with-brief"
    | "multi-turn-brief-collected"
    | "missing-draft-intent"
    | "missing-topic-detail"
    | "missing-supporting-detail";
  status: DraftReadinessStatus;
  version: typeof DRAFT_READINESS_VERSION;
}

export interface DraftGenerationResult {
  draftText: string;
  model: string;
  operation: Exclude<DraftOperation, "retain">;
  responseId: string;
  termination: AgentTermination;
}

export interface AgentTermination {
  maxSteps: number;
  reason: AgentTerminationReason;
  stepsTaken: number;
}

export interface DraftOrchestrationResult {
  decision: RevisionDecision | null;
  draftText: string;
  model: string | null;
  operation: DraftOperation;
  promptVersion: typeof AGENT_PROMPT_VERSION;
  responseId: string | null;
  status: DraftResultStatus;
  termination: AgentTermination;
}

export class AgentError extends Error {
  readonly code: "invalid-input" | "invalid-response" | "request-failed";

  constructor(message: string, code: AgentError["code"]) {
    super(message);
    this.name = "AgentError";
    this.code = code;
  }
}

interface AgentDependencies {
  db?: Pick<SupabaseDbClient, "select">;
  generateText?: typeof generateText;
}

interface DraftWorkflowMessage {
  content: string;
  role: DraftWorkflowMessageRole;
}

interface ThreadMessageRow extends DbRow {
  content: string;
  created_at: string;
  id: string;
  position: number;
  role: "assistant" | "user";
  thread_id: string;
}

interface DraftSignalSummary {
  hasDraftIntent: boolean;
  hasSupportingDetail: boolean;
  hasTopicDetail: boolean;
  userMessageCount: number;
  userWordCount: number;
}

const DRAFT_GENERATION_INSTRUCTIONS = [
  "You are the orchestration layer for a LinkedIn drafting assistant.",
  "Product rules:",
  "- Supported actions only: clarify the draft request, generate the first active draft, or revise the current active draft.",
  "- Maintain exactly one active draft per thread.",
  "- If a current draft exists, revise that draft instead of branching.",
  "- Only act on the latest user-authored drafting turn.",
  "- Do not continue from assistant-authored turns or self-directed loops.",
  "- Use the selected voice when provided.",
  "- Treat attached image details as supporting context only.",
  "- Never publish, schedule, browse, scrape, import third-party content, or call unsupported third-party tools.",
  "- If the user asks for anything outside the supported actions, stay inside the drafting workflow instead of simulating external actions.",
  "- Return only the final draft text with no analysis or markdown.",
  "Termination condition: return exactly one completed draft and stop immediately.",
].join("\n");

const REVISION_DECISION_INSTRUCTIONS = [
  "You decide whether the latest user turn requests a revision to the current active draft.",
  "Return JSON only in this shape:",
  '{"action":"keep"|"revise","reason":"short explanation"}',
  "Choose keep when the latest user turn is conversational, exploratory, or does not ask for a draft change.",
  "Only evaluate the latest user-authored drafting turn. Do not continue assistant-authored loops.",
  "Unsupported requests such as publishing, scheduling, browsing, scraping, or third-party tool use are outside the product workflow and must not trigger external actions.",
  "Termination condition: make one classification and stop.",
].join("\n");

const threadMessageColumns = ["id", "thread_id", "role", "content", "position", "created_at"] as const;

function readRequiredText(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new AgentError(`${fieldName} cannot be empty.`, "invalid-input");
  }

  return normalizedValue;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue === "" ? null : normalizedValue;
}

function readWorkflowMessageRole(
  role: OpenAiMessage["role"],
  fieldName: string,
): DraftWorkflowMessageRole {
  if (role === "assistant" || role === "user") {
    return role;
  }

  throw new AgentError(
    `${fieldName} must use the controlled drafting workflow roles 'user' or 'assistant'.`,
    "invalid-input",
  );
}

function normalizeMessages(messages: OpenAiMessage[]): DraftWorkflowMessage[] {
  if (messages.length === 0) {
    throw new AgentError("Draft orchestration requires at least one message.", "invalid-input");
  }

  return messages.map((message, index) => ({
    content: readRequiredText(message.content, `Message ${index + 1} content`),
    role: readWorkflowMessageRole(message.role, `Message ${index + 1} role`),
  }));
}

function toOpenAiMessages(messages: DraftWorkflowMessage[]): OpenAiMessage[] {
  return messages.map((message) => ({
    content: message.content,
    role: message.role,
  }));
}

function getLatestUserMessage(messages: DraftWorkflowMessage[]): string {
  const latestMessage = messages.at(-1);

  if (latestMessage?.role === "user") {
    return latestMessage.content;
  }

  throw new AgentError(
    "Draft orchestration requires the latest workflow turn to be a user message.",
    "invalid-input",
  );
}

function getUserMessages(messages: DraftWorkflowMessage[]): DraftWorkflowMessage[] {
  return messages.filter((message) => message.role === "user");
}

function countWords(text: string): number {
  const matches = text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g);
  return matches?.length ?? 0;
}

function hasDraftIntent(text: string): boolean {
  return [
    /\b(?:write|draft|create|generate|make)\b[\s\S]{0,40}\b(?:linkedin|post|draft)\b/i,
    /\b(?:help me|can you)\b[\s\S]{0,20}\b(?:write|draft)\b/i,
    /\bturn\b[\s\S]{0,20}\b(?:this|that|it)\b[\s\S]{0,20}\b(?:into|as)\b[\s\S]{0,20}\b(?:a )?(?:linkedin )?(?:post|draft)\b/i,
    /\b(?:linkedin post|first draft|draft this|post about|posting about)\b/i,
  ].some((pattern) => pattern.test(text));
}

function hasTopicDetail(text: string): boolean {
  return [
    /\babout\b/i,
    /\bfocus on\b/i,
    /\bhighlight\b/i,
    /\bmention\b/i,
    /\binclude\b/i,
    /\bcover\b/i,
    /\bon\b/i,
    /:/,
  ].some((pattern) => pattern.test(text));
}

function hasSupportingDetail(text: string): boolean {
  return [
    /\btone\b/i,
    /\bvoice\b/i,
    /\bangle\b/i,
    /\baudience\b/i,
    /\bcta\b/i,
    /\bhook\b/i,
    /\bstructure\b/i,
    /\bkeep it\b/i,
    /\bmake it\b/i,
    /\bshort\b/i,
    /\bconcise\b/i,
    /\bconfident\b/i,
    /\bpractical\b/i,
    /\bstory\b/i,
    /\blesson\b/i,
    /\bmetric\b/i,
    /\bresult\b/i,
    /\bbecause\b/i,
    /\bafter\b/i,
    /\bwith\b/i,
  ].some((pattern) => pattern.test(text));
}

function summarizeDraftSignals(messages: DraftWorkflowMessage[]): DraftSignalSummary {
  const userMessages = getUserMessages(messages);
  const userText = userMessages.map((message) => message.content);

  return {
    hasDraftIntent: userText.some((message) => hasDraftIntent(message)),
    hasSupportingDetail: userText.some((message) => hasSupportingDetail(message)),
    hasTopicDetail: userText.some((message) => hasTopicDetail(message)),
    userMessageCount: userMessages.length,
    userWordCount: countWords(userText.join(" ")),
  };
}

function createDraftReadinessEvaluation(
  status: DraftReadinessStatus,
  reason: DraftReadinessEvaluation["reason"],
  missingSignals: DraftReadinessMissingSignal[] = [],
): DraftReadinessEvaluation {
  return {
    missingSignals,
    reason,
    status,
    version: DRAFT_READINESS_VERSION,
  };
}

function formatMissingSignals(missingSignals: DraftReadinessMissingSignal[]): string {
  return missingSignals.join(", ");
}

function serializeConversation(messages: DraftWorkflowMessage[]): string {
  return messages
    .map((message, index) => `${index + 1}. ${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
}

export function buildConversationContextPrompt(messages: OpenAiMessage[]): string {
  const normalizedMessages = normalizeMessages(messages);

  return [
    `Conversation context version: ${CONVERSATION_CONTEXT_PROMPT_VERSION}`,
    "Latest user request:",
    getLatestUserMessage(normalizedMessages),
    "Active thread history:",
    serializeConversation(normalizedMessages),
  ].join("\n\n");
}

function serializeVoiceContext(voice: AgentVoiceContext | null | undefined): string {
  if (!voice) {
    return "No active voice selected.";
  }

  const parts = [`Name: ${readRequiredText(voice.name, "Voice name")}`];
  const instructions = normalizeOptionalText(voice.instructions);

  if (instructions) {
    parts.push(`Instructions: ${instructions}`);
  }

  if (Array.isArray(voice.sampleText) && voice.sampleText.length > 0) {
    const samples = voice.sampleText
      .map((sample, index) => `${index + 1}. ${readRequiredText(sample, `Voice sample ${index + 1}`)}`)
      .join("\n");

    parts.push(`Samples:\n${samples}`);
  }

  return parts.join("\n");
}

function serializeImageContext(image: AgentImageContext | null | undefined): string {
  if (!image) {
    return "No attached image.";
  }

  const parts = ["Attached image present."];
  const fileName = normalizeOptionalText(image.fileName);
  const mimeType = normalizeOptionalText(image.mimeType);
  const altText = normalizeOptionalText(image.altText);

  if (fileName) {
    parts.push(`File name: ${fileName}`);
  }

  if (mimeType) {
    parts.push(`MIME type: ${mimeType}`);
  }

  if (altText) {
    parts.push(`Description: ${altText}`);
  }

  return parts.join("\n");
}

async function loadThreadMessages(
  db: Pick<SupabaseDbClient, "select">,
  threadId: string,
): Promise<DraftWorkflowMessage[]> {
  try {
    const rows = await db.select<ThreadMessageRow>(CHAT_MESSAGE_TABLE, {
      columns: threadMessageColumns,
      filters: [
        {
          column: "thread_id",
          operator: "eq",
          value: readRequiredText(threadId, "Chat thread threadId"),
        },
      ],
      orderBy: [
        {
          column: "position",
          ascending: true,
        },
        {
          column: "created_at",
          ascending: true,
        },
      ],
    });

    return normalizeMessages(
      rows.map((row) => ({
        content: row.content,
        role: row.role,
      })),
    );
  } catch (error) {
    if (error instanceof AgentError) {
      throw error;
    }

    throw new AgentError(
      error instanceof Error ? `Failed to load thread messages: ${error.message}` : "Failed to load thread messages.",
      "request-failed",
    );
  }
}

async function resolveMessages(
  request: DraftOrchestrationRequest,
  dependencies: AgentDependencies,
): Promise<DraftWorkflowMessage[]> {
  if (request.messages) {
    return normalizeMessages(request.messages);
  }

  const threadId = normalizeOptionalText(request.threadId);

  if (!threadId) {
    throw new AgentError(
      "Draft orchestration requires messages or a threadId.",
      "invalid-input",
    );
  }

  if (!dependencies.db) {
    throw new AgentError(
      "Thread-backed draft orchestration requires a database dependency.",
      "invalid-input",
    );
  }

  return loadThreadMessages(dependencies.db, threadId);
}

function buildMetadata(
  metadata: Record<string, string> | undefined,
  phase: "generation" | "revision-decision",
  operation: DraftOperation,
): Record<string, string> {
  return {
    ...(metadata ?? {}),
    agent_flow: "draft_orchestration",
    agent_operation: operation,
    agent_phase: phase,
    agent_prompt_version: AGENT_PROMPT_VERSION,
  };
}

function getGenerateTextImplementation(dependencies: AgentDependencies): typeof generateText {
  return dependencies.generateText ?? generateText;
}

function createTermination(
  reason: AgentTerminationReason,
  stepsTaken: number,
  maxSteps: number,
): AgentTermination {
  return {
    maxSteps,
    reason,
    stepsTaken,
  };
}

function getGenerationTerminationReason(
  operation: Exclude<DraftOperation, "retain">,
): Extract<AgentTerminationReason, "draft-created" | "draft-revised"> {
  return operation === "create" ? "draft-created" : "draft-revised";
}

function buildRevisionDecisionPrompt(
  currentDraft: string,
  messages: DraftWorkflowMessage[],
): string {
  if (!currentDraft) {
    throw new AgentError(
      "Revision decisions require a current draft.",
      "invalid-input",
    );
  }

  return [
    `Prompt version: ${AGENT_PROMPT_VERSION}`,
    `Output contract version: ${REVISION_DECISION_OUTPUT_VERSION}`,
    "Current draft:",
    currentDraft,
    buildConversationContextPrompt(toOpenAiMessages(messages)),
  ].join("\n\n");
}

function stripCodeFence(text: string): string {
  const trimmedText = text.trim();

  if (!trimmedText.startsWith("```")) {
    return trimmedText;
  }

  return trimmedText.replace(/^```[a-zA-Z0-9_-]*\s*/, "").replace(/\s*```$/, "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRevisionDecision(rawOutput: string, responseId: string, model: string): RevisionDecision {
  const normalizedOutput = stripCodeFence(readRequiredText(rawOutput, "Revision decision output"));
  let parsedOutput: unknown;

  try {
    parsedOutput = JSON.parse(normalizedOutput) as unknown;
  } catch {
    throw new AgentError(
      "Revision decision output must be valid JSON.",
      "invalid-response",
    );
  }

  if (!isRecord(parsedOutput)) {
    throw new AgentError(
      "Revision decision output must be a JSON object.",
      "invalid-response",
    );
  }

  const action = parsedOutput.action;
  const reason = parsedOutput.reason;

  if (action !== "keep" && action !== "revise") {
    throw new AgentError(
      "Revision decision output must include action 'keep' or 'revise'.",
      "invalid-response",
    );
  }

  if (typeof reason !== "string" || reason.trim() === "") {
    throw new AgentError(
      "Revision decision output must include a non-empty reason.",
      "invalid-response",
    );
  }

  return {
    action,
    model,
    rawOutput,
    reason: reason.trim(),
    responseId,
    version: REVISION_DECISION_OUTPUT_VERSION,
  };
}

function buildDraftGenerationPrompt(
  request: DraftOrchestrationRequest,
  operation: Exclude<DraftOperation, "retain">,
  messages: DraftWorkflowMessage[],
): string {
  const currentDraft = normalizeOptionalText(request.currentDraft);
  const sections = [
    `Prompt version: ${AGENT_PROMPT_VERSION}`,
    `Operation: ${operation === "create" ? "Create the first active LinkedIn draft." : "Revise the existing active LinkedIn draft without branching."}`,
    buildConversationContextPrompt(toOpenAiMessages(messages)),
    "Voice context:",
    serializeVoiceContext(request.voice),
    "Attached image context:",
    serializeImageContext(request.attachedImage),
  ];

  if (currentDraft) {
    sections.push("Current draft:");
    sections.push(currentDraft);
  }

  sections.push("Output requirements:");
  sections.push(
    [
      "- Return only the final LinkedIn draft text.",
      "- Keep the draft grounded in the conversation.",
      "- Do not include notes, explanations, headings, or quotation marks.",
      `- Termination condition: ${
        operation === "create"
          ? "after producing the first active draft, stop."
          : "after revising the current active draft once, stop."
      }`,
    ].join("\n"),
  );

  return sections.join("\n\n");
}

export function evaluateDraftReadiness(
  request: {
    currentDraft?: string | null;
    messages: OpenAiMessage[];
  },
): DraftReadinessEvaluation {
  const currentDraft = normalizeOptionalText(request.currentDraft);

  if (currentDraft) {
    return createDraftReadinessEvaluation("ready", "active-draft-present");
  }

  const messages = normalizeMessages(request.messages);
  getLatestUserMessage(messages);
  const summary = summarizeDraftSignals(messages);

  if (!summary.hasDraftIntent) {
    return createDraftReadinessEvaluation("needs-more-signal", "missing-draft-intent", [
      "draft-intent",
      "topic-detail",
    ]);
  }

  if (!summary.hasTopicDetail) {
    return createDraftReadinessEvaluation("needs-more-signal", "missing-topic-detail", [
      "topic-detail",
    ]);
  }

  if (summary.userMessageCount === 1) {
    return createDraftReadinessEvaluation("ready", "explicit-request-with-brief");
  }

  if (
    summary.hasSupportingDetail ||
    summary.userWordCount >= MIN_MULTI_TURN_READY_USER_WORDS
  ) {
    return createDraftReadinessEvaluation("ready", "multi-turn-brief-collected");
  }

  return createDraftReadinessEvaluation("needs-more-signal", "missing-supporting-detail", [
    "supporting-detail",
  ]);
}

export async function decideDraftRevision(
  request: DraftOrchestrationRequest,
  dependencies: AgentDependencies = {},
): Promise<RevisionDecision> {
  const generateTextImplementation = getGenerateTextImplementation(dependencies);

  try {
    const messages = await resolveMessages(request, dependencies);
    const currentDraft = normalizeOptionalText(request.currentDraft);

    const result = await generateTextImplementation({
      input: buildRevisionDecisionPrompt(currentDraft ?? "", messages),
      instructions: REVISION_DECISION_INSTRUCTIONS,
      maxOutputTokens: 120,
      metadata: buildMetadata(request.metadata, "revision-decision", "revise"),
      model: request.model,
      signal: request.signal,
    });

    return parseRevisionDecision(result.outputText, result.id, result.model);
  } catch (error) {
    if (error instanceof AgentError) {
      throw error;
    }

    throw new AgentError(
      error instanceof Error ? error.message : "Revision decision failed.",
      "request-failed",
    );
  }
}

export async function generateDraft(
  request: DraftOrchestrationRequest,
  operation: Exclude<DraftOperation, "retain">,
  dependencies: AgentDependencies = {},
): Promise<DraftGenerationResult> {
  const generateTextImplementation = getGenerateTextImplementation(dependencies);

  try {
    const messages = await resolveMessages(request, dependencies);

    if (operation === "create") {
      const readiness = evaluateDraftReadiness({
        currentDraft: request.currentDraft,
        messages: toOpenAiMessages(messages),
      });

      if (readiness.status !== "ready") {
        throw new AgentError(
          `Draft generation needs more signal before creating the first draft. Missing: ${formatMissingSignals(readiness.missingSignals)}.`,
          "invalid-input",
        );
      }
    }

    const result = await generateTextImplementation({
      input: buildDraftGenerationPrompt(request, operation, messages),
      instructions: DRAFT_GENERATION_INSTRUCTIONS,
      maxOutputTokens: 800,
      metadata: buildMetadata(request.metadata, "generation", operation),
      model: request.model,
      signal: request.signal,
    });

    return {
      draftText: readRequiredText(result.outputText, "Draft output"),
      model: result.model,
      operation,
      responseId: result.id,
      termination: createTermination(
        getGenerationTerminationReason(operation),
        1,
        MAX_GENERATION_STEPS,
      ),
    };
  } catch (error) {
    if (error instanceof AgentError) {
      throw error;
    }

    throw new AgentError(
      error instanceof Error ? error.message : "Draft generation failed.",
      "request-failed",
    );
  }
}

export async function orchestrateDraft(
  request: DraftOrchestrationRequest,
  dependencies: AgentDependencies = {},
): Promise<DraftOrchestrationResult> {
  const messages = await resolveMessages(request, dependencies);
  const requestWithMessages: DraftOrchestrationRequest = {
    ...request,
    messages: toOpenAiMessages(messages),
  };
  const currentDraft = normalizeOptionalText(request.currentDraft);
  let decision: RevisionDecision | null = null;
  let stepsTaken = 0;

  if (currentDraft) {
    decision = await decideDraftRevision(
      {
        ...requestWithMessages,
        currentDraft,
      },
      dependencies,
    );
    stepsTaken += 1;

    if (decision.action === "keep") {
      return {
        decision,
        draftText: currentDraft,
        model: null,
        operation: "retain",
        promptVersion: AGENT_PROMPT_VERSION,
        responseId: null,
        status: "unchanged",
        termination: createTermination("revision-not-requested", stepsTaken, MAX_AGENT_STEPS),
      };
    }
  }

  const operation: Exclude<DraftOperation, "retain"> = currentDraft ? "revise" : "create";
  const generationResult = await generateDraft(
    {
      ...requestWithMessages,
      currentDraft,
    },
    operation,
    dependencies,
  );
  stepsTaken += 1;

  return {
    decision,
    draftText: generationResult.draftText,
    model: generationResult.model,
    operation,
    promptVersion: AGENT_PROMPT_VERSION,
    responseId: generationResult.responseId,
    status: "generated",
    termination: createTermination(
      generationResult.termination.reason,
      stepsTaken,
      MAX_AGENT_STEPS,
    ),
  };
}
