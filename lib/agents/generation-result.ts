import type { SupabaseDbClient } from "../db.ts";
import {
  logGenerationFailure,
  logGenerationSuccess,
  type GenerationAuditEventRow,
  type GenerationAuditMetadata,
} from "../generation-audit-log.ts";

export const GENERATION_RESULT_VERSION = "generation-result-v1";

export type GenerationAttemptOperation = "create" | "revise";
export type GenerationOperation = GenerationAttemptOperation | "retain";
export type GenerationResultStatus = "generated" | "unchanged" | "failed";

export interface GenerationAssistantOutput {
  role: "assistant";
  text: string;
}

export interface GenerationMetadata {
  model: string | null;
  operation: GenerationOperation;
  promptVersion: string | null;
  responseId: string | null;
}

export interface GenerationErrorDetails {
  code: string;
  message: string;
}

interface GenerationResultBase {
  generation: GenerationMetadata;
  version: typeof GENERATION_RESULT_VERSION;
}

export interface GeneratedGenerationResult extends GenerationResultBase {
  assistant: GenerationAssistantOutput;
  status: "generated";
}

export interface UnchangedGenerationResult extends GenerationResultBase {
  assistant: GenerationAssistantOutput;
  status: "unchanged";
}

export interface FailedGenerationResult extends GenerationResultBase {
  assistant: null;
  error: GenerationErrorDetails;
  status: "failed";
}

export type SuccessfulGenerationResult =
  | GeneratedGenerationResult
  | UnchangedGenerationResult;

export type GenerationResult = SuccessfulGenerationResult | FailedGenerationResult;

export interface CreateGeneratedGenerationResultOptions {
  model: string;
  operation: GenerationAttemptOperation;
  outputText: string;
  promptVersion?: string | null;
  responseId: string;
}

export interface CreateUnchangedGenerationResultOptions {
  outputText: string;
  promptVersion?: string | null;
}

export interface CreateFailedGenerationResultOptions {
  code?: string;
  message: string;
  model?: string | null;
  operation: GenerationAttemptOperation;
  promptVersion?: string | null;
  responseId?: string | null;
}

export interface LogSuccessfulGenerationResultOptions {
  draftId?: string | null;
  threadId?: string | null;
  userId: string;
  voiceId?: string | null;
}

export interface LogFailedGenerationResultOptions {
  draftId?: string | null;
  threadId?: string | null;
  userId: string;
  voiceId?: string | null;
}

function readRequiredText(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new Error(`${fieldName} cannot be empty.`);
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

function createAssistantOutput(outputText: string): GenerationAssistantOutput {
  return {
    role: "assistant",
    text: readRequiredText(outputText, "Generation output"),
  };
}

function createGenerationMetadata(
  operation: GenerationOperation,
  promptVersion: string | null | undefined,
  model: string | null | undefined,
  responseId: string | null | undefined,
): GenerationMetadata {
  return {
    model: normalizeOptionalText(model),
    operation,
    promptVersion: normalizeOptionalText(promptVersion),
    responseId: normalizeOptionalText(responseId),
  };
}

function createSuccessfulGenerationAuditMetadata(
  result: SuccessfulGenerationResult,
): GenerationAuditMetadata {
  return {
    assistantRole: result.assistant.role,
    assistantTextLength: result.assistant.text.length,
    promptVersion: result.generation.promptVersion,
    responseId: result.generation.responseId,
    resultStatus: result.status,
    resultVersion: result.version,
  };
}

function createFailedGenerationAuditMetadata(
  result: FailedGenerationResult,
): GenerationAuditMetadata {
  return {
    errorCode: result.error.code,
    promptVersion: result.generation.promptVersion,
    responseId: result.generation.responseId,
    resultStatus: result.status,
    resultVersion: result.version,
  };
}

export function createGeneratedGenerationResult(
  options: CreateGeneratedGenerationResultOptions,
): GeneratedGenerationResult {
  return {
    assistant: createAssistantOutput(options.outputText),
    generation: createGenerationMetadata(
      options.operation,
      options.promptVersion,
      readRequiredText(options.model, "Generation model"),
      readRequiredText(options.responseId, "Generation responseId"),
    ),
    status: "generated",
    version: GENERATION_RESULT_VERSION,
  };
}

export function createUnchangedGenerationResult(
  options: CreateUnchangedGenerationResultOptions,
): UnchangedGenerationResult {
  return {
    assistant: createAssistantOutput(options.outputText),
    generation: createGenerationMetadata("retain", options.promptVersion, null, null),
    status: "unchanged",
    version: GENERATION_RESULT_VERSION,
  };
}

export function createFailedGenerationResult(
  options: CreateFailedGenerationResultOptions,
): FailedGenerationResult {
  return {
    assistant: null,
    error: {
      code: normalizeOptionalText(options.code) ?? "generation-failed",
      message: readRequiredText(options.message, "Generation error message"),
    },
    generation: createGenerationMetadata(
      options.operation,
      options.promptVersion,
      options.model,
      options.responseId,
    ),
    status: "failed",
    version: GENERATION_RESULT_VERSION,
  };
}

export function hasAssistantOutput(
  result: GenerationResult,
): result is SuccessfulGenerationResult {
  return result.assistant !== null;
}

export function isFailedGenerationResult(
  result: GenerationResult,
): result is FailedGenerationResult {
  return result.status === "failed";
}

export function getAssistantOutputText(result: GenerationResult): string | null {
  return result.assistant?.text ?? null;
}

export async function logSuccessfulGenerationResult(
  db: SupabaseDbClient,
  result: GenerationResult,
  options: LogSuccessfulGenerationResultOptions,
): Promise<GenerationAuditEventRow> {
  if (isFailedGenerationResult(result)) {
    throw new Error("Successful generation audit events require a non-failed generation result.");
  }

  return logGenerationSuccess(db, {
    ...options,
    metadata: createSuccessfulGenerationAuditMetadata(result),
  });
}

export async function logFailedGenerationResult(
  db: SupabaseDbClient,
  result: GenerationResult,
  options: LogFailedGenerationResultOptions,
): Promise<GenerationAuditEventRow> {
  if (!isFailedGenerationResult(result)) {
    throw new Error("Failed generation audit events require a failed generation result.");
  }

  return logGenerationFailure(db, {
    ...options,
    errorMessage: result.error.message,
    metadata: createFailedGenerationAuditMetadata(result),
  });
}
