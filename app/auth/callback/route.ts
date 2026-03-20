import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_EXPIRES_AT_COOKIE,
  applyAuthSession,
  buildSupabaseAuthUrl,
  clearCookie,
  fetchSupabaseAuth,
  getRequestOrigin,
  isSecureOrigin,
  normalizeSessionPayload,
  readRequiredEnv,
  REFRESH_TOKEN_COOKIE,
  setCookie,
  SUPABASE_ANON_KEY,
  type AuthSessionPayload,
} from "../../../lib/auth-session";

export const AUTH_CALLBACK_PATH = "/auth/callback";
export const DEFAULT_AUTH_SUCCESS_PATH = "/workspace";
export const AUTH_CALLBACK_ERROR_PARAM = "authError";
export const PKCE_CODE_VERIFIER_COOKIE = "stanlol-pkce-code-verifier";
export {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_EXPIRES_AT_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from "../../../lib/auth-session";

const SUPPORTED_OAUTH_PROVIDERS = new Set(["google"]);
const SUPPORTED_EMAIL_OTP_TYPES = new Set([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "recovery",
  "signup",
]);

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

async function exchangeCodeForSession(
  authCode: string,
  codeVerifier: string,
): Promise<AuthSessionPayload> {
  const response = await fetchSupabaseAuth(
    new URL("/auth/v1/token?grant_type=pkce", buildSupabaseAuthUrl("/")),
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
  const response = await fetchSupabaseAuth(buildSupabaseAuthUrl("/auth/v1/verify"), {
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

async function completeAuth(
  request: Request,
  session: AuthSessionPayload,
  nextPath: string,
): Promise<NextResponse> {
  const secure = isSecureOrigin(getRequestOrigin(request));
  const response = redirectToPath(request, nextPath);
  await applyAuthSession(response, request, session);

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

  const authorizeUrl = buildSupabaseAuthUrl("/auth/v1/authorize");

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
