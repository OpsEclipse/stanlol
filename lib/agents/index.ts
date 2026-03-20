import { generateText, type OpenAiMessage } from "../ai";

export const AGENT_PROMPT_VERSION = "draft-orchestration-v1";
export const MAX_AGENT_STEPS = 2;
export const REVISION_DECISION_OUTPUT_VERSION = "revision-decision-v1";

export type RevisionDecisionAction = "keep" | "revise";
export type DraftOperation = "create" | "retain" | "revise";
export type DraftResultStatus = "generated" | "unchanged";
export type AgentTerminationReason = "draft-generated" | "revision-not-requested";

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
  messages: OpenAiMessage[];
  metadata?: Record<string, string>;
  model?: string;
  signal?: AbortSignal;
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

export interface DraftGenerationResult {
  draftText: string;
  model: string;
  operation: Exclude<DraftOperation, "retain">;
  responseId: string;
}

export interface DraftOrchestrationResult {
  decision: RevisionDecision | null;
  draftText: string;
  model: string | null;
  operation: DraftOperation;
  promptVersion: typeof AGENT_PROMPT_VERSION;
  responseId: string | null;
  status: DraftResultStatus;
  termination: {
    maxSteps: typeof MAX_AGENT_STEPS;
    reason: AgentTerminationReason;
    stepsTaken: number;
  };
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
  generateText?: typeof generateText;
}

const DRAFT_GENERATION_INSTRUCTIONS = [
  "You are the orchestration layer for a LinkedIn drafting assistant.",
  "Product rules:",
  "- Maintain exactly one active draft per thread.",
  "- If a current draft exists, revise that draft instead of branching.",
  "- Use the selected voice when provided.",
  "- Treat attached image details as supporting context only.",
  "- Return only the final draft text with no analysis or markdown.",
  "Termination condition: produce exactly one draft and stop.",
].join("\n");

const REVISION_DECISION_INSTRUCTIONS = [
  "You decide whether the latest user turn requests a revision to the current active draft.",
  "Return JSON only in this shape:",
  '{"action":"keep"|"revise","reason":"short explanation"}',
  "Choose keep when the latest user turn is conversational, exploratory, or does not ask for a draft change.",
  "Termination condition: make one classification and stop.",
].join("\n");

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

function normalizeMessages(messages: OpenAiMessage[]): OpenAiMessage[] {
  if (messages.length === 0) {
    throw new AgentError("Draft orchestration requires at least one message.", "invalid-input");
  }

  return messages.map((message, index) => ({
    content: readRequiredText(message.content, `Message ${index + 1} content`),
    role: message.role,
  }));
}

function getLatestUserMessage(messages: OpenAiMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.role === "user") {
      return message.content;
    }
  }

  throw new AgentError(
    "Draft orchestration requires at least one user message.",
    "invalid-input",
  );
}

function serializeConversation(messages: OpenAiMessage[]): string {
  return messages
    .map((message, index) => `${index + 1}. ${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
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

function buildRevisionDecisionPrompt(request: DraftOrchestrationRequest): string {
  const currentDraft = normalizeOptionalText(request.currentDraft);

  if (!currentDraft) {
    throw new AgentError(
      "Revision decisions require a current draft.",
      "invalid-input",
    );
  }

  const messages = normalizeMessages(request.messages);

  return [
    `Prompt version: ${AGENT_PROMPT_VERSION}`,
    `Output contract version: ${REVISION_DECISION_OUTPUT_VERSION}`,
    "Current draft:",
    currentDraft,
    "Latest user request:",
    getLatestUserMessage(messages),
    "Recent conversation:",
    serializeConversation(messages),
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
): string {
  const messages = normalizeMessages(request.messages);
  const currentDraft = normalizeOptionalText(request.currentDraft);
  const sections = [
    `Prompt version: ${AGENT_PROMPT_VERSION}`,
    `Operation: ${operation === "create" ? "Create the first active LinkedIn draft." : "Revise the existing active LinkedIn draft without branching."}`,
    "Voice context:",
    serializeVoiceContext(request.voice),
    "Attached image context:",
    serializeImageContext(request.attachedImage),
    "Conversation transcript:",
    serializeConversation(messages),
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
      "- Stop after producing a single draft.",
    ].join("\n"),
  );

  return sections.join("\n\n");
}

export async function decideDraftRevision(
  request: DraftOrchestrationRequest,
  dependencies: AgentDependencies = {},
): Promise<RevisionDecision> {
  const generateTextImplementation = getGenerateTextImplementation(dependencies);

  try {
    const result = await generateTextImplementation({
      input: buildRevisionDecisionPrompt(request),
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
    const result = await generateTextImplementation({
      input: buildDraftGenerationPrompt(request, operation),
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
  const currentDraft = normalizeOptionalText(request.currentDraft);
  let decision: RevisionDecision | null = null;
  let stepsTaken = 0;

  if (currentDraft) {
    decision = await decideDraftRevision(
      {
        ...request,
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
        termination: {
          maxSteps: MAX_AGENT_STEPS,
          reason: "revision-not-requested",
          stepsTaken,
        },
      };
    }
  }

  const operation: Exclude<DraftOperation, "retain"> = currentDraft ? "revise" : "create";
  const generationResult = await generateDraft(
    {
      ...request,
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
    termination: {
      maxSteps: MAX_AGENT_STEPS,
      reason: "draft-generated",
      stepsTaken,
    },
  };
}
