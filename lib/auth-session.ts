import { NextResponse } from "next/server";

import {
  getUserDb,
  syncCurrentUserProfile,
  type AuthenticatedUserProfile,
} from "./db";

export const SUPABASE_URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
export const SUPABASE_ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
export const ACCESS_TOKEN_COOKIE = "stanlol-access-token";
export const REFRESH_TOKEN_COOKIE = "stanlol-refresh-token";
export const ACCESS_TOKEN_EXPIRES_AT_COOKIE = "stanlol-access-token-expires-at";

export interface AuthSessionPayload {
  accessToken: string;
  expiresAt: string | null;
  refreshToken: string | null;
}

export function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();

  if (!forwardedHost) {
    return url.origin;
  }

  const protocol = forwardedProto || url.protocol.replace(/:$/, "");
  return `${protocol}://${forwardedHost}`;
}

export function buildSupabaseAuthUrl(pathname: string): URL {
  return new URL(pathname, readRequiredEnv(SUPABASE_URL_KEY));
}

export function isSecureOrigin(origin: string): boolean {
  return new URL(origin).protocol === "https:";
}

export function setCookie(
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

export function clearCookie(response: NextResponse, name: string, secure: boolean): void {
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

export function normalizeSessionPayload(payload: unknown): AuthSessionPayload {
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

export function normalizeAuthenticatedUser(payload: unknown): AuthenticatedUserProfile {
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

export async function fetchSupabaseAuth(
  input: URL,
  init: RequestInit,
  fetchImplementation: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const response = await fetchImplementation(input, init);

  if (!response.ok) {
    throw new Error(`Supabase auth request failed with status ${response.status}.`);
  }

  return (await response.json()) as Record<string, unknown>;
}

export async function fetchAuthenticatedUser(
  accessToken: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<AuthenticatedUserProfile> {
  const response = await fetchSupabaseAuth(
    buildSupabaseAuthUrl("/auth/v1/user"),
    {
      headers: {
        apikey: readRequiredEnv(SUPABASE_ANON_KEY),
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
    },
    fetchImplementation,
  );

  return normalizeAuthenticatedUser(response);
}

export async function applyAuthSession(
  response: NextResponse,
  request: Request,
  session: AuthSessionPayload,
  fetchImplementation: typeof fetch = fetch,
): Promise<AuthenticatedUserProfile> {
  const secure = isSecureOrigin(getRequestOrigin(request));
  const user = await fetchAuthenticatedUser(session.accessToken, fetchImplementation);
  const userDb = getUserDb(session.accessToken);

  await syncCurrentUserProfile(userDb, user);

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

  return user;
}
