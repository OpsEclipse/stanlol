import { NextResponse } from "next/server";

import {
  applyAuthSession,
  buildSupabaseAuthUrl,
  fetchSupabaseAuth,
  normalizeSessionPayload,
  readRequiredEnv,
  SUPABASE_ANON_KEY,
} from "../../../../lib/auth-session";
import { jsonError } from "../../../../lib/json-response";
import {
  findSeededLocalTestAccount,
  getConfiguredLocalTestAccountEmail,
  LocalAutoLoginError,
} from "../../../../lib/local-test-account";
import {
  isLocalDevelopmentEnvironment,
  isLocalFeatureEnabled,
} from "../../../../lib/local-feature-flags";
import { object, validatePayload } from "../../../../lib/validation";

const SUPABASE_SERVICE_ROLE_KEY = "SUPABASE_SERVICE_ROLE_KEY";
const SUPABASE_GENERATE_LINK_TYPE = "magiclink";
const EMPTY_BODY_VALIDATOR = object({});

const DEV_AUTO_LOGIN_DISABLED_MESSAGE = "Dev auto-login is not enabled.";
const LOCAL_TEST_ACCOUNT_NOT_CONFIGURED_MESSAGE = "Seeded local test account is not configured.";
const LOCAL_TEST_ACCOUNT_NOT_FOUND_MESSAGE = "Seeded local test account was not found.";

function buildAdminGenerateLinkUrl(): URL {
  return buildSupabaseAuthUrl("/auth/v1/admin/generate_link");
}

async function parseRequestPayload(request: Request): Promise<unknown> {
  const bodyText = await request.text();

  if (!bodyText.trim()) {
    return {};
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    throw new Error("Invalid request payload.");
  }
}

function normalizeGeneratedLinkToken(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Supabase generate-link payload was not an object.");
  }

  const payloadRecord = payload as Record<string, unknown>;
  const hashedToken = payloadRecord.hashed_token;
  const tokenHash =
    typeof hashedToken === "string"
      ? hashedToken.trim()
      : "";

  if (!tokenHash) {
    throw new Error("Supabase generate-link payload did not include a token hash.");
  }

  return tokenHash;
}

async function createSeededAccountSession(email: string): Promise<ReturnType<typeof normalizeSessionPayload>> {
  const generatedLink = await fetchSupabaseAuth(buildAdminGenerateLinkUrl(), {
    body: JSON.stringify({
      email,
      type: SUPABASE_GENERATE_LINK_TYPE,
    }),
    headers: {
      apikey: readRequiredEnv(SUPABASE_SERVICE_ROLE_KEY),
      authorization: `Bearer ${readRequiredEnv(SUPABASE_SERVICE_ROLE_KEY)}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

  const tokenHash = normalizeGeneratedLinkToken(generatedLink);
  const verifiedSession = await fetchSupabaseAuth(buildSupabaseAuthUrl("/auth/v1/verify"), {
    body: JSON.stringify({
      token_hash: tokenHash,
      type: SUPABASE_GENERATE_LINK_TYPE,
    }),
    headers: {
      apikey: readRequiredEnv(SUPABASE_ANON_KEY),
      "content-type": "application/json",
    },
    method: "POST",
  });

  return normalizeSessionPayload(verifiedSession);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await parseRequestPayload(request);
    const validation = validatePayload(payload, EMPTY_BODY_VALIDATOR);

    if (validation.success === false) {
      return jsonError(validation.error, { status: 400 });
    }

    if (!isLocalDevelopmentEnvironment()) {
      throw new LocalAutoLoginError();
    }

    if (!isLocalFeatureEnabled("autoLogin")) {
      return jsonError(new LocalAutoLoginError(DEV_AUTO_LOGIN_DISABLED_MESSAGE), { status: 403 });
    }

    const configuredEmail = getConfiguredLocalTestAccountEmail();

    if (!configuredEmail) {
      return jsonError(LOCAL_TEST_ACCOUNT_NOT_CONFIGURED_MESSAGE, { status: 404 });
    }

    const account = await findSeededLocalTestAccount();

    if (!account) {
      return jsonError(LOCAL_TEST_ACCOUNT_NOT_FOUND_MESSAGE, { status: 404 });
    }

    const session = await createSeededAccountSession(account.email);
    const response = NextResponse.json({
      success: true,
      data: {
        user: account,
      },
    });

    await applyAuthSession(response, request, session);

    return response;
  } catch (error) {
    if (error instanceof LocalAutoLoginError) {
      return jsonError(error.message, { status: 403 });
    }

    if (error instanceof Error && error.message === "Invalid request payload.") {
      return jsonError(error.message, { status: 400 });
    }

    return jsonError(error);
  }
}
