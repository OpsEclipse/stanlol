export const LOCAL_FEATURE_FLAG_ENV_VARS = {
  autoLogin: "STANLOL_LOCAL_AUTO_LOGIN",
} as const;

export type LocalFeatureFlagName = keyof typeof LOCAL_FEATURE_FLAG_ENV_VARS;

export const localFeatureFlagNames = Object.keys(
  LOCAL_FEATURE_FLAG_ENV_VARS,
) as LocalFeatureFlagName[];

const ENABLED_FLAG_VALUES = new Set(["1", "on", "true", "yes"]);

function readEnvValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];

  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue === "" ? undefined : normalizedValue;
}

export function isLocalDevelopmentEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  if (readEnvValue(env, "NODE_ENV") !== "development") {
    return false;
  }

  const vercelEnv = readEnvValue(env, "VERCEL_ENV");
  return vercelEnv === undefined || vercelEnv === "development";
}

export function isLocalFeatureEnabled(
  featureName: LocalFeatureFlagName,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isLocalDevelopmentEnvironment(env)) {
    return false;
  }

  const envVarName = LOCAL_FEATURE_FLAG_ENV_VARS[featureName];
  const flagValue = readEnvValue(env, envVarName);

  return flagValue !== undefined && ENABLED_FLAG_VALUES.has(flagValue);
}

export function getLocalFeatureFlags(
  env: NodeJS.ProcessEnv = process.env,
): Record<LocalFeatureFlagName, boolean> {
  return {
    autoLogin: isLocalFeatureEnabled("autoLogin", env),
  };
}
