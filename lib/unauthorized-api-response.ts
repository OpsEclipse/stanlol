import { jsonError } from "./json-response.ts";

export const DEFAULT_UNAUTHENTICATED_API_MESSAGE = "Authentication required.";
export const DEFAULT_UNAUTHORIZED_API_MESSAGE =
  "You do not have permission to access this resource.";

export type ProtectedApiAuthErrorKind = "unauthenticated" | "unauthorized";

const PROTECTED_API_AUTH_ERROR_STATUS: Record<ProtectedApiAuthErrorKind, number> = {
  unauthenticated: 401,
  unauthorized: 403,
};

const PROTECTED_API_AUTH_ERROR_MESSAGE: Record<ProtectedApiAuthErrorKind, string> = {
  unauthenticated: DEFAULT_UNAUTHENTICATED_API_MESSAGE,
  unauthorized: DEFAULT_UNAUTHORIZED_API_MESSAGE,
};

export function createProtectedApiAuthErrorResponse(
  kind: ProtectedApiAuthErrorKind,
  error: unknown = PROTECTED_API_AUTH_ERROR_MESSAGE[kind],
  init: ResponseInit = {},
): Response {
  return jsonError(error, {
    ...init,
    status: init.status ?? PROTECTED_API_AUTH_ERROR_STATUS[kind],
  });
}

export function unauthenticatedApiResponse(
  error: unknown = DEFAULT_UNAUTHENTICATED_API_MESSAGE,
  init: ResponseInit = {},
): Response {
  return createProtectedApiAuthErrorResponse("unauthenticated", error, init);
}

export function unauthorizedApiResponse(
  error: unknown = DEFAULT_UNAUTHORIZED_API_MESSAGE,
  init: ResponseInit = {},
): Response {
  return createProtectedApiAuthErrorResponse("unauthorized", error, init);
}
