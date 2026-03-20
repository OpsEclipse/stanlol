export const OPENAI_API_BASE_URL = "https://api.openai.com/v1";
export const OPENAI_RESPONSES_PATH = "/responses";
export const DEFAULT_OPENAI_MODEL = "gpt-5";
export const OPENAI_API_KEY_ENV_NAME = "OPENAI_API_KEY";

export type OpenAiMessageRole = "assistant" | "developer" | "system" | "user";

export interface OpenAiMessage {
  content: string;
  role: OpenAiMessageRole;
}

export type OpenAiInput = string | OpenAiMessage[];

export interface CreateOpenAiResponseOptions {
  input: OpenAiInput;
  instructions?: string;
  maxOutputTokens?: number;
  metadata?: Record<string, string>;
  model?: string;
  previousResponseId?: string;
  signal?: AbortSignal;
  temperature?: number;
}

export interface OpenAiOutputTextItem {
  text?: string;
  type?: string;
}

export interface OpenAiOutputMessage {
  content?: OpenAiOutputTextItem[];
  role?: string;
  type?: string;
}

export interface OpenAiResponse {
  id: string;
  model: string;
  output?: OpenAiOutputMessage[];
  output_text?: string;
}

export interface GenerateTextResult {
  id: string;
  model: string;
  outputText: string;
  response: OpenAiResponse;
}

export class AiError extends Error {
  readonly code:
    | "client-not-supported"
    | "invalid-input"
    | "invalid-response"
    | "request-failed";
  readonly status?: number;

  constructor(message: string, code: AiError["code"], status?: number) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.status = status;
  }
}

interface OpenAiInputTextContent {
  text: string;
  type: "input_text";
}

interface OpenAiInputMessage {
  content: OpenAiInputTextContent[];
  role: "assistant" | "developer" | "user";
}

interface CreateOpenAiRequestBody {
  input: string | OpenAiInputMessage[];
  instructions?: string;
  max_output_tokens?: number;
  metadata?: Record<string, string>;
  model: string;
  previous_response_id?: string;
  temperature?: number;
}

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new AiError(
      "OpenAI access is only available on the server.",
      "client-not-supported",
    );
  }
}

function readRequiredText(value: string, fieldName: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new AiError(`${fieldName} cannot be empty.`, "invalid-input");
  }

  return trimmedValue;
}

function readApiKey(): string {
  const apiKey = process.env[OPENAI_API_KEY_ENV_NAME];

  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new AiError(
      `Missing required environment variable: ${OPENAI_API_KEY_ENV_NAME}`,
      "request-failed",
    );
  }

  return apiKey.trim();
}

function normalizeMessageRole(role: OpenAiMessageRole): OpenAiInputMessage["role"] {
  return role === "system" ? "developer" : role;
}

function serializeInput(input: OpenAiInput): string | OpenAiInputMessage[] {
  if (typeof input === "string") {
    return readRequiredText(input, "OpenAI input");
  }

  if (input.length === 0) {
    throw new AiError("OpenAI input must include at least one message.", "invalid-input");
  }

  return input.map((message, index) => ({
    content: [
      {
        text: readRequiredText(message.content, `OpenAI message ${index + 1} content`),
        type: "input_text",
      },
    ],
    role: normalizeMessageRole(message.role),
  }));
}

function buildRequestBody(options: CreateOpenAiResponseOptions): CreateOpenAiRequestBody {
  const requestBody: CreateOpenAiRequestBody = {
    input: serializeInput(options.input),
    model: options.model ?? DEFAULT_OPENAI_MODEL,
  };

  if (options.instructions) {
    requestBody.instructions = readRequiredText(options.instructions, "OpenAI instructions");
  }

  if (typeof options.maxOutputTokens === "number") {
    requestBody.max_output_tokens = options.maxOutputTokens;
  }

  if (options.metadata) {
    requestBody.metadata = options.metadata;
  }

  if (options.previousResponseId) {
    requestBody.previous_response_id = readRequiredText(
      options.previousResponseId,
      "OpenAI previousResponseId",
    );
  }

  if (typeof options.temperature === "number") {
    requestBody.temperature = options.temperature;
  }

  return requestBody;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getOpenAiErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const error = payload.error;

  if (!isRecord(error) || typeof error.message !== "string") {
    return null;
  }

  const message = error.message.trim();
  return message === "" ? null : message;
}

function isOpenAiResponse(payload: unknown): payload is OpenAiResponse {
  return (
    isRecord(payload) &&
    typeof payload.id === "string" &&
    typeof payload.model === "string"
  );
}

async function parseJsonPayload(response: Response): Promise<unknown> {
  const rawBody = await response.text();

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new AiError("OpenAI returned a non-JSON response.", "invalid-response", response.status);
  }
}

function getResponseEndpoint(): string {
  return `${OPENAI_API_BASE_URL}${OPENAI_RESPONSES_PATH}`;
}

export async function createOpenAiResponse(
  options: CreateOpenAiResponseOptions,
  dependencies: {
    fetch?: typeof fetch;
  } = {},
): Promise<OpenAiResponse> {
  assertServerOnly();

  const fetchImplementation = dependencies.fetch ?? globalThis.fetch;

  if (typeof fetchImplementation !== "function") {
    throw new AiError("Fetch is not available in this runtime.", "request-failed");
  }

  const requestBody = buildRequestBody(options);
  const apiKey = readApiKey();

  let response: Response;

  try {
    response = await fetchImplementation(getResponseEndpoint(), {
      body: JSON.stringify(requestBody),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Unknown network failure";

    throw new AiError(`OpenAI request failed: ${message}`, "request-failed");
  }

  const payload = await parseJsonPayload(response);

  if (!response.ok) {
    throw new AiError(
      getOpenAiErrorMessage(payload) ??
        `OpenAI request failed with status ${response.status}.`,
      "request-failed",
      response.status,
    );
  }

  if (!isOpenAiResponse(payload)) {
    throw new AiError("OpenAI returned an invalid response payload.", "invalid-response");
  }

  return payload;
}

function extractOutputText(response: OpenAiResponse): string {
  if (typeof response.output_text === "string" && response.output_text !== "") {
    return response.output_text;
  }

  const fragments: string[] = [];

  for (const item of response.output ?? []) {
    if (!Array.isArray(item.content)) {
      continue;
    }

    for (const contentItem of item.content) {
      if (contentItem.type === "output_text" && typeof contentItem.text === "string") {
        fragments.push(contentItem.text);
      }
    }
  }

  if (fragments.length === 0) {
    throw new AiError("OpenAI response did not include any text output.", "invalid-response");
  }

  return fragments.join("");
}

export async function generateText(
  options: CreateOpenAiResponseOptions,
  dependencies: {
    fetch?: typeof fetch;
  } = {},
): Promise<GenerateTextResult> {
  const response = await createOpenAiResponse(options, dependencies);

  return {
    id: response.id,
    model: response.model,
    outputText: extractOutputText(response),
    response,
  };
}
