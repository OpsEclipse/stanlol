import { NextResponse } from "next/server";

import {
  buildSupabaseAuthUrl,
  fetchSupabaseAuth,
  getRequestOrigin,
  readRequiredEnv,
  SUPABASE_ANON_KEY,
} from "../../../lib/auth-session";
import { object, string, validatePayload } from "../../../lib/validation";

export const MAGIC_LINK_PATH = "/auth/magic-link";
export const MAGIC_LINK_STATUS_PARAM = "magicLinkStatus";
export const MAGIC_LINK_EMAIL_PARAM = "email";
export const MAGIC_LINK_SENT_STATUS = "sent";
export const MAGIC_LINK_FAILED_STATUS = "failed";
export const MAGIC_LINK_INVALID_EMAIL_STATUS = "invalid_email";

const AUTH_CALLBACK_PATH = "/auth/callback";
const DEFAULT_AUTH_SUCCESS_PATH = "/workspace";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAGIC_LINK_REQUEST_VALIDATOR = object({
  email: string({
    maxLength: 320,
    trim: true,
  }),
});

function buildMagicLinkRedirectUrl(request: Request): string {
  const callbackUrl = new URL(AUTH_CALLBACK_PATH, getRequestOrigin(request));

  callbackUrl.searchParams.set("next", DEFAULT_AUTH_SUCCESS_PATH);

  return callbackUrl.toString();
}

function buildHomeRedirectUrl(
  request: Request,
  status: string,
  email: string | null = null,
): URL {
  const redirectUrl = new URL("/", getRequestOrigin(request));

  redirectUrl.searchParams.set(MAGIC_LINK_STATUS_PARAM, status);

  if (email) {
    redirectUrl.searchParams.set(MAGIC_LINK_EMAIL_PARAM, email);
  }

  return redirectUrl;
}

function redirectToStatus(
  request: Request,
  status: string,
  email: string | null = null,
): NextResponse {
  return NextResponse.redirect(buildHomeRedirectUrl(request, status, email), {
    status: 303,
  });
}

function normalizeRequestPayload(formData: FormData): unknown {
  return {
    email: formData.get("email"),
  };
}

async function requestMagicLink(email: string, request: Request): Promise<void> {
  await fetchSupabaseAuth(buildSupabaseAuthUrl("/auth/v1/otp"), {
    body: JSON.stringify({
      email,
      options: {
        emailRedirectTo: buildMagicLinkRedirectUrl(request),
      },
    }),
    headers: {
      apikey: readRequiredEnv(SUPABASE_ANON_KEY),
      "content-type": "application/json",
    },
    method: "POST",
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  let normalizedEmail: string | null = null;

  try {
    const formData = await request.formData();
    const validation = validatePayload(
      normalizeRequestPayload(formData),
      MAGIC_LINK_REQUEST_VALIDATOR,
    );

    if (validation.success === false) {
      return redirectToStatus(request, MAGIC_LINK_INVALID_EMAIL_STATUS);
    }

    normalizedEmail = validation.data.email.toLowerCase();

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return redirectToStatus(request, MAGIC_LINK_INVALID_EMAIL_STATUS, normalizedEmail);
    }

    await requestMagicLink(normalizedEmail, request);

    return redirectToStatus(request, MAGIC_LINK_SENT_STATUS, normalizedEmail);
  } catch {
    return redirectToStatus(request, MAGIC_LINK_FAILED_STATUS, normalizedEmail);
  }
}
