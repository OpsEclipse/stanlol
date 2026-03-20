import { getUserDb, type SupabaseDbClient } from "./db";
import { jsonError } from "./json-response";

const SUPABASE_URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

export const DEFAULT_UNAUTHORIZED_MESSAGE = "Authentication required.";
export const DEFAULT_AUTH_ERROR_MESSAGE = "Failed to verify authentication.";

export interface AuthenticatedApiUser {
  email: string | null;
  id: string;
}

export interface AuthenticatedApiContext {
  accessToken: string;
  db: SupabaseDbClient;
  user: AuthenticatedApiUser;
}

export interface AuthenticateApiOptions {
  authErrorMessage?: string;
  fetch?: typeof fetch;
  unauthorizedMessage?: string;
}

export interface AuthenticatedApiSuccess {
  auth: AuthenticatedApiContext;
  success: true;
}

export interface AuthenticatedApiFailure {
  response: Response;
  success: false;
}

export type AuthenticatedApiResult = AuthenticatedApiFailure | AuthenticatedApiSuccess;

export type AuthenticatedApiHandler = (
  context: AuthenticatedApiContext,
  request: Request,
) => Promise<Response> | Response;

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readBearerToken(headers: Headers): string | null {
  const authorization = headers.get("authorization")?.trim();

  if (!authorization) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization);

  if (!match) {
    return null;
  }

  const accessToken = match[1]?.trim();

  return accessToken ? accessToken : null;
}

function buildSupabaseUserUrl(): string {
  const baseUrl = new URL(readRequiredEnv(SUPABASE_URL_KEY));
  return new URL("/auth/v1/user", baseUrl).toString();
}

function normalizeAuthenticatedUser(payload: unknown): AuthenticatedApiUser | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";

  if (!id) {
    return null;
  }

  return {
    email: typeof candidate.email === "string" ? candidate.email : null,
    id,
  };
}

export async function authenticateApiRequest(
  request: Request,
  options: AuthenticateApiOptions = {},
): Promise<AuthenticatedApiResult> {
  const accessToken = readBearerToken(request.headers);

  if (!accessToken) {
    return {
      response: jsonError(options.unauthorizedMessage ?? DEFAULT_UNAUTHORIZED_MESSAGE, {
        status: 401,
      }),
      success: false,
    };
  }

  const authFetch = options.fetch ?? globalThis.fetch;

  try {
    const response = await authFetch(buildSupabaseUserUrl(), {
      headers: {
        apikey: readRequiredEnv(SUPABASE_ANON_KEY),
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
    });

    if (response.status === 401 || response.status === 403) {
      return {
        response: jsonError(options.unauthorizedMessage ?? DEFAULT_UNAUTHORIZED_MESSAGE, {
          status: 401,
        }),
        success: false,
      };
    }

    if (!response.ok) {
      return {
        response: jsonError(options.authErrorMessage ?? DEFAULT_AUTH_ERROR_MESSAGE, {
          status: 502,
        }),
        success: false,
      };
    }

    const user = normalizeAuthenticatedUser((await response.json()) as unknown);

    if (!user) {
      return {
        response: jsonError(options.authErrorMessage ?? DEFAULT_AUTH_ERROR_MESSAGE, {
          status: 502,
        }),
        success: false,
      };
    }

    return {
      auth: {
        accessToken,
        db: getUserDb(accessToken),
        user,
      },
      success: true,
    };
  } catch {
    return {
      response: jsonError(options.authErrorMessage ?? DEFAULT_AUTH_ERROR_MESSAGE, {
        status: 502,
      }),
      success: false,
    };
  }
}

export function withAuthenticatedApi(
  handler: AuthenticatedApiHandler,
  options: AuthenticateApiOptions = {},
): (request: Request) => Promise<Response> {
  return async function authenticatedApi(request: Request): Promise<Response> {
    const result = await authenticateApiRequest(request, options);

    if (result.success === false) {
      return result.response;
    }

    return handler(result.auth, request);
  };
}
