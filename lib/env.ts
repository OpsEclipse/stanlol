export const ENV_KEYS = {
  publicSupabaseUrl: "NEXT_PUBLIC_SUPABASE_URL",
  publicSupabaseAnonKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  supabaseServiceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
  openAiApiKey: "OPENAI_API_KEY",
  devAutoLoginEnabled: "DEV_AUTO_LOGIN_ENABLED",
  devAutoLoginEmail: "DEV_AUTO_LOGIN_EMAIL",
  nodeEnv: "NODE_ENV",
  vercelEnv: "VERCEL_ENV",
} as const;

export const REQUIRED_PUBLIC_ENV_KEYS = [
  ENV_KEYS.publicSupabaseUrl,
  ENV_KEYS.publicSupabaseAnonKey,
] as const;

export const REQUIRED_SERVER_ENV_KEYS = [
  ENV_KEYS.supabaseServiceRoleKey,
  ENV_KEYS.openAiApiKey,
] as const;

const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_ENV_VALUES = new Set(["0", "false", "no", "off"]);

export type NodeEnvironment = "development" | "production" | "test";
export type VercelEnvironment = "development" | "preview" | "production";
export type AppEnvironment = "development" | "preview" | "production" | "test";

export interface RuntimeEnvironment {
  appEnv: AppEnvironment;
  isDevelopment: boolean;
  isLocalDevelopment: boolean;
  isPreview: boolean;
  isProduction: boolean;
  isTest: boolean;
  nodeEnv: NodeEnvironment;
  vercelEnv: VercelEnvironment | null;
}

export interface PublicEnv {
  supabase: {
    anonKey: string;
    url: string;
  };
}

export interface FeatureFlags {
  devAutoLoginEnabled: boolean;
}

export interface ServerEnv extends PublicEnv {
  features: FeatureFlags;
  openAi: {
    apiKey: string;
  };
  runtime: RuntimeEnvironment;
  supabase: PublicEnv["supabase"] & {
    serviceRoleKey: string;
  };
  development: {
    autoLoginEmail?: string;
  };
}

let cachedPublicEnv: PublicEnv | null = null;
let cachedServerEnv: ServerEnv | null = null;

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name];

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "" ? undefined : trimmedValue;
}

function readRequiredEnv(name: string): string {
  const value = readOptionalEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readRequiredUrlEnv(name: string): string {
  const value = readRequiredEnv(name);

  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`Environment variable ${name} must be a valid URL.`);
  }
}

function readOptionalBooleanEnv(name: string, defaultValue = false): boolean {
  const value = readOptionalEnv(name);

  if (!value) {
    return defaultValue;
  }

  const normalizedValue = value.toLowerCase();

  if (TRUE_ENV_VALUES.has(normalizedValue)) {
    return true;
  }

  if (FALSE_ENV_VALUES.has(normalizedValue)) {
    return false;
  }

  throw new Error(
    `Environment variable ${name} must be a boolean-like value (${[
      ...TRUE_ENV_VALUES,
      ...FALSE_ENV_VALUES,
    ].join(", ")}).`,
  );
}

function readNodeEnv(): NodeEnvironment {
  const nodeEnv = readOptionalEnv(ENV_KEYS.nodeEnv);

  if (!nodeEnv) {
    return "development";
  }

  if (nodeEnv === "development" || nodeEnv === "production" || nodeEnv === "test") {
    return nodeEnv;
  }

  throw new Error(
    `Environment variable ${ENV_KEYS.nodeEnv} must be one of development, production, or test.`,
  );
}

function readVercelEnv(): VercelEnvironment | null {
  const vercelEnv = readOptionalEnv(ENV_KEYS.vercelEnv);

  if (!vercelEnv) {
    return null;
  }

  if (vercelEnv === "development" || vercelEnv === "preview" || vercelEnv === "production") {
    return vercelEnv;
  }

  throw new Error(
    `Environment variable ${ENV_KEYS.vercelEnv} must be one of development, preview, or production.`,
  );
}

function resolveRuntimeEnvironment(): RuntimeEnvironment {
  const nodeEnv = readNodeEnv();
  const vercelEnv = readVercelEnv();

  let appEnv: AppEnvironment;

  if (vercelEnv) {
    appEnv = vercelEnv;
  } else if (nodeEnv === "test") {
    appEnv = "test";
  } else if (nodeEnv === "production") {
    appEnv = "production";
  } else {
    appEnv = "development";
  }

  return {
    appEnv,
    isDevelopment: appEnv === "development",
    isLocalDevelopment: appEnv === "development" && vercelEnv !== "preview" && vercelEnv !== "production",
    isPreview: appEnv === "preview",
    isProduction: appEnv === "production",
    isTest: appEnv === "test",
    nodeEnv,
    vercelEnv,
  };
}

function buildPublicEnv(): PublicEnv {
  return {
    supabase: {
      anonKey: readRequiredEnv(ENV_KEYS.publicSupabaseAnonKey),
      url: readRequiredUrlEnv(ENV_KEYS.publicSupabaseUrl),
    },
  };
}

function assertServerSide(): void {
  if (typeof window !== "undefined") {
    throw new Error("Server environment values can only be read on the server.");
  }
}

function buildServerEnv(): ServerEnv {
  assertServerSide();

  const runtime = resolveRuntimeEnvironment();
  const publicEnv = getPublicEnv();
  const devAutoLoginRequested = readOptionalBooleanEnv(ENV_KEYS.devAutoLoginEnabled);

  return {
    ...publicEnv,
    development: {
      autoLoginEmail: readOptionalEnv(ENV_KEYS.devAutoLoginEmail),
    },
    features: {
      devAutoLoginEnabled: runtime.isLocalDevelopment && devAutoLoginRequested,
    },
    openAi: {
      apiKey: readRequiredEnv(ENV_KEYS.openAiApiKey),
    },
    runtime,
    supabase: {
      ...publicEnv.supabase,
      serviceRoleKey: readRequiredEnv(ENV_KEYS.supabaseServiceRoleKey),
    },
  };
}

export function getPublicEnv(): PublicEnv {
  if (!cachedPublicEnv) {
    cachedPublicEnv = buildPublicEnv();
  }

  return cachedPublicEnv;
}

export function getEnv(): ServerEnv {
  if (!cachedServerEnv) {
    cachedServerEnv = buildServerEnv();
  }

  return cachedServerEnv;
}

export function getFeatureFlags(): FeatureFlags {
  return getEnv().features;
}
