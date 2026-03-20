export const DEFAULT_ERROR_MESSAGE = "An unexpected error occurred.";

export type JsonSuccessEnvelope<T = unknown> = {
  success: true;
  data?: T;
  error?: never;
};

export type JsonErrorEnvelope = {
  success: false;
  data?: never;
  error: string;
};

export type JsonEnvelope<T = unknown> = JsonSuccessEnvelope<T> | JsonErrorEnvelope;

export function toErrorMessage(
  error: unknown,
  fallback: string = DEFAULT_ERROR_MESSAGE,
): string {
  if (typeof error === "string") {
    const trimmedMessage = error.trim();

    if (trimmedMessage) {
      return trimmedMessage;
    }
  }

  if (error instanceof Error) {
    const trimmedMessage = error.message.trim();

    if (trimmedMessage) {
      return trimmedMessage;
    }
  }

  return fallback;
}

export function createJsonResponse<T>(
  body: JsonEnvelope<T>,
  init: ResponseInit = {},
): Response {
  return Response.json(body, init);
}

export function jsonSuccess<T>(data?: T, init: ResponseInit = {}): Response {
  const body: JsonSuccessEnvelope<T> =
    data === undefined ? { success: true } : { success: true, data };

  return createJsonResponse(body, init);
}

export function jsonError(error: unknown, init: ResponseInit = {}): Response {
  const body: JsonErrorEnvelope = {
    success: false,
    error: toErrorMessage(error),
  };

  return createJsonResponse(body, {
    ...init,
    status: init.status ?? 500,
  });
}
