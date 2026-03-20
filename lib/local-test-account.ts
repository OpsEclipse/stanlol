import { type DbRow, getAdminDb, type SupabaseDbClient } from "./db.js";
import { isLocalDevelopmentEnvironment } from "./local-feature-flags.js";

export const LOCAL_TEST_ACCOUNT_ENV_VARS = {
  email: "STANLOL_LOCAL_TEST_ACCOUNT_EMAIL",
} as const;

export interface LocalTestAccount {
  displayName: string | null;
  email: string;
  id: string;
}

export interface FindSeededLocalTestAccountOptions {
  db?: SupabaseDbClient;
  env?: NodeJS.ProcessEnv;
}

type UserProfileRow = DbRow & {
  display_name: string | null;
  email: string;
  id: string;
};

function normalizeEmail(value: string | undefined): string | null {
  const normalizedValue = value?.trim().toLowerCase();
  return normalizedValue ? normalizedValue : null;
}

function normalizeLocalTestAccount(row: UserProfileRow | null): LocalTestAccount | null {
  if (!row) {
    return null;
  }

  const id = typeof row.id === "string" ? row.id.trim() : "";
  const email = typeof row.email === "string" ? row.email.trim() : "";

  if (!id || !email) {
    return null;
  }

  return {
    displayName: typeof row.display_name === "string" ? row.display_name : null,
    email,
    id,
  };
}

export function getConfiguredLocalTestAccountEmail(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return normalizeEmail(env[LOCAL_TEST_ACCOUNT_ENV_VARS.email]);
}

export async function findSeededLocalTestAccount(
  options: FindSeededLocalTestAccountOptions = {},
): Promise<LocalTestAccount | null> {
  const env = options.env ?? process.env;

  if (!isLocalDevelopmentEnvironment(env)) {
    return null;
  }

  const email = getConfiguredLocalTestAccountEmail(env);

  if (!email) {
    return null;
  }

  const db = options.db ?? getAdminDb();
  const row = await db.selectOne<UserProfileRow>("user_profiles", {
    columns: ["id", "email", "display_name"],
    filters: [{ column: "email", operator: "ilike", value: email }],
  });

  return normalizeLocalTestAccount(row);
}
