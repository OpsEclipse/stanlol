import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getUserDb,
  syncCurrentUserProfile,
  type AuthenticatedUserProfile,
} from "../../../lib/db.js";

const SUPABASE_URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

export const AUTH_CALLBACK_PATH = "/auth/callback";
export const DEFAULT_AUTH_SUCCESS_PATH = "/workspace";
export const AUTH_CALLBACK_ERROR_PARAM = "authError";
export const PKCE_CODE_VERIFIER_COOKIE = "stanlol-pkce-code-verifier";
export const ACCESS_TOKEN_COOKIE = "stanlol-access-token";
export const REFRESH_TOKEN_COOKIE = "stanlol-refresh-token";
export const ACCESS_TOKEN_EXPIRES_AT_COOKIE = "stanlol-access-token-expires-at";

const SUPPORTED_OAUTH_PROVIDERS = new Set(["google"]);
const SUPPORTED_EMAIL_OTP_TYPES = new Set([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "recovery",
  "signup",
]);

interface AuthSessionPayload {
  accessToken: string;
  expiresAt: string | null;
  refreshToken: string | null;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();

  if (!forwardedHost) {
    return url.origin;
  }

  const protocol = forwardedProto || url.protocol.replace(/:$/, "");
  return `${protocol}://${forwardedHost}`;
}

function buildSupabaseUrl(pathname: string): URL {
  return new URL(pathname, readRequiredEnv(SUPABASE_URL_KEY));
}

function sanitizeNextPath(value: string | null, fallback = DEFAULT_AUTH_SUCCESS_PATH): string {
  const candidate = value?.trim() || fallback;

  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  return candidate;
}

function parseCookies(request: Request): Map<string, string> {
  const cookieHeader = request.headers.get("cookie");
  const cookies = new Map<string, string>();

  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(/;\s*/)) {
    if (!part) {
      continue;
    }

    const separatorIndex = part.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const name = decodeURIComponent(part.slice(0, separatorIndex).trim());
    const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());

    if (name) {
      cookies.set(name, value);
    }
  }

  return cookies;
}

function getCookie(request: Request, name: string): string | null {
  return parseCookies(request).get(name) ?? null;
}

function createPkceCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function createPkceCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

function isSecureOrigin(origin: string): boolean {
  return new URL(origin).protocol === "https:";
}

function setCookie(
  response: NextResponse,
  name: string,
  value: string,
  options: {
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    secure: boolean;
  },
): void {
  response.cookies.set({
    expires: options.expires,
    httpOnly: options.httpOnly ?? true,
    maxAge: options.maxAge,
    name,
    path: "/",
    sameSite: "lax",
    secure: options.secure,
    value,
  });
}

function clearCookie(response: NextResponse, name: string, secure: boolean): void {
  response.cookies.set({
    expires: new Date(0),
    httpOnly: true,
    name,
    path: "/",
    sameSite: "lax",
    secure,
    value: "",
  });
}

function redirectToPath(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, getRequestOrigin(request)));
}

function redirectToFailure(request: Request, code: string): NextResponse {
  const response = redirectToPath(request, `/?${AUTH_CALLBACK_ERROR_PARAM}=${encodeURIComponent(code)}`);
  const secure = isSecureOrigin(getRequestOrigin(request));

  clearCookie(response, PKCE_CODE_VERIFIER_COOKIE, secure);
  clearCookie(response, ACCESS_TOKEN_COOKIE, secure);
  clearCookie(response, REFRESH_TOKEN_COOKIE, secure);
  clearCookie(response, ACCESS_TOKEN_EXPIRES_AT_COOKIE, secure);

  return response;
}

function normalizeSessionPayload(payload: unknown): AuthSessionPayload {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Supabase auth session payload was not an object.");
  }

  const session = payload as Record<string, unknown>;
  const accessToken =
    typeof session.access_token === "string" ? session.access_token.trim() : "";
  const refreshToken =
    typeof session.refresh_token === "string" ? session.refresh_token.trim() : null;
  const expiresIn =
    typeof session.expires_in === "number" && Number.isFinite(session.expires_in)
      ? session.expires_in
      : null;

  if (!accessToken) {
    throw new Error("Supabase auth session payload did not include an access token.");
  }

  return {
    accessToken,
    expiresAt:
      expiresIn === null ? null : new Date(Date.now() + expiresIn * 1_000).toISOString(),
    refreshToken: refreshToken || null,
  };
}

function normalizeAuthenticatedUser(payload: unknown): AuthenticatedUserProfile {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Supabase auth user payload was not an object.");
  }

  const user = payload as Record<string, unknown>;
  const id = typeof user.id === "string" ? user.id.trim() : "";

  if (!id) {
    throw new Error("Supabase auth user payload did not include a user id.");
  }

  const email = typeof user.email === "string" ? user.email : null;
  const userMetadata =
    typeof user.user_metadata === "object" &&
    user.user_metadata !== null &&
    !Array.isArray(user.user_metadata)
      ? (user.user_metadata as Record<string, unknown>)
      : null;

  return {
    email,
    id,
    user_metadata: userMetadata,
  };
}

async function fetchSupabaseAuth(
  input: URL,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(input, init);

  if (!response.ok) {
    throw new Error(`Supabase auth request failed with status ${response.status}.`);
  }

  return (await response.json()) as Record<string, unknown>;
}

async function exchangeCodeForSession(
  authCode: string,
  codeVerifier: string,
): Promise<AuthSessionPayload> {
  const response = await fetchSupabaseAuth(
    new URL("/auth/v1/token?grant_type=pkce", buildSupabaseUrl("/")),
    {
      body: JSON.stringify({
        auth_code: authCode,
        code_verifier: codeVerifier,
      }),
      headers: {
        apikey: readRequiredEnv(SUPABASE_ANON_KEY),
        "content-type": "application/json",
      },
      method: "POST",
    },
  );

  return normalizeSessionPayload(response);
}

async function verifyTokenHash(
  tokenHash: string,
  type: string,
): Promise<AuthSessionPayload> {
  const response = await fetchSupabaseAuth(buildSupabaseUrl("/auth/v1/verify"), {
    body: JSON.stringify({
      token_hash: tokenHash,
      type,
    }),
    headers: {
      apikey: readRequiredEnv(SUPABASE_ANON_KEY),
      "content-type": "application/json",
    },
    method: "POST",
  });

  return normalizeSessionPayload(response);
}

async function fetchAuthenticatedUser(accessToken: string): Promise<AuthenticatedUserProfile> {
  const response = await fetchSupabaseAuth(buildSupabaseUrl("/auth/v1/user"), {
    headers: {
      apikey: readRequiredEnv(SUPABASE_ANON_KEY),
      authorization: `Bearer ${accessToken}`,
    },
    method: "GET",
  });

  return normalizeAuthenticatedUser(response);
}

async function completeAuth(
  request: Request,
  session: AuthSessionPayload,
  nextPath: string,
): Promise<NextResponse> {
  const secure = isSecureOrigin(getRequestOrigin(request));
  const user = await fetchAuthenticatedUser(session.accessToken);
  const userDb = getUserDb(session.accessToken);

  await syncCurrentUserProfile(userDb, user);

  const response = redirectToPath(request, nextPath);

  setCookie(response, ACCESS_TOKEN_COOKIE, session.accessToken, {
    expires: session.expiresAt ? new Date(session.expiresAt) : undefined,
    secure,
  });

  if (session.refreshToken) {
    setCookie(response, REFRESH_TOKEN_COOKIE, session.refreshToken, {
      secure,
    });
  }

  if (session.expiresAt) {
    setCookie(response, ACCESS_TOKEN_EXPIRES_AT_COOKIE, session.expiresAt, {
      secure,
    });
  }

  clearCookie(response, PKCE_CODE_VERIFIER_COOKIE, secure);

  return response;
}

function startOAuthFlow(request: Request, provider: string, nextPath: string): NextResponse {
  const codeVerifier = createPkceCodeVerifier();
  const codeChallenge = createPkceCodeChallenge(codeVerifier);
  const origin = getRequestOrigin(request);
  const secure = isSecureOrigin(origin);
  const callbackUrl = new URL(AUTH_CALLBACK_PATH, origin);

  callbackUrl.searchParams.set("next", nextPath);

  const authorizeUrl = buildSupabaseUrl("/auth/v1/authorize");

  authorizeUrl.searchParams.set("provider", provider);
  authorizeUrl.searchParams.set("redirect_to", callbackUrl.toString());
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "s256");

  const response = NextResponse.redirect(authorizeUrl);

  setCookie(response, PKCE_CODE_VERIFIER_COOKIE, codeVerifier, {
    maxAge: 60 * 10,
    secure,
  });

  return response;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const nextPath = sanitizeNextPath(url.searchParams.get("next"));
  const provider = url.searchParams.get("provider")?.trim().toLowerCase() ?? null;
  const authCode = url.searchParams.get("code")?.trim() ?? null;
  const tokenHash = url.searchParams.get("token_hash")?.trim() ?? null;
  const tokenType = url.searchParams.get("type")?.trim().toLowerCase() ?? null;

  if (!authCode && !tokenHash && provider) {
    if (!SUPPORTED_OAUTH_PROVIDERS.has(provider)) {
      return redirectToFailure(request, "unsupported_auth_provider");
    }

    return startOAuthFlow(request, provider, nextPath);
  }

  try {
    if (authCode) {
      const codeVerifier = getCookie(request, PKCE_CODE_VERIFIER_COOKIE);

      if (!codeVerifier) {
        return redirectToFailure(request, "missing_pkce_verifier");
      }

      return await completeAuth(
        request,
        await exchangeCodeForSession(authCode, codeVerifier),
        nextPath,
      );
    }

    if (tokenHash && tokenType && SUPPORTED_EMAIL_OTP_TYPES.has(tokenType)) {
      return await completeAuth(request, await verifyTokenHash(tokenHash, tokenType), nextPath);
    }
  } catch {
    return redirectToFailure(request, "auth_callback_failed");
  }

  return redirectToFailure(request, "invalid_auth_callback");
}
