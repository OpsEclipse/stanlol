import assert from "node:assert/strict";
import test from "node:test";

const {
  LOCAL_FEATURE_FLAG_ENV_VARS,
  getLocalFeatureFlags,
  isLocalDevelopmentEnvironment,
  isLocalFeatureEnabled,
  localFeatureFlagNames,
} = await import(new URL("../../lib/local-feature-flags.ts", import.meta.url).href);

function createEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    ...overrides,
  };
}

test("defines the supported local-only feature flags in one place", () => {
  assert.deepEqual(localFeatureFlagNames, ["autoLogin"]);
  assert.deepEqual(LOCAL_FEATURE_FLAG_ENV_VARS, {
    autoLogin: "STANLOL_LOCAL_AUTO_LOGIN",
  });
});

test("enables a flag only when explicitly turned on in local development", () => {
  const env = createEnv({
    [LOCAL_FEATURE_FLAG_ENV_VARS.autoLogin]: " true ",
  });

  assert.equal(isLocalDevelopmentEnvironment(env), true);
  assert.equal(isLocalFeatureEnabled("autoLogin", env), true);
  assert.deepEqual(getLocalFeatureFlags(env), {
    autoLogin: true,
  });
});

test("keeps local-only flags disabled when the explicit env flag is missing", () => {
  const env = createEnv();

  assert.equal(isLocalFeatureEnabled("autoLogin", env), false);
  assert.deepEqual(getLocalFeatureFlags(env), {
    autoLogin: false,
  });
});

test("disables local-only flags outside development mode", () => {
  const env = createEnv({
    NODE_ENV: "production",
    [LOCAL_FEATURE_FLAG_ENV_VARS.autoLogin]: "1",
  });

  assert.equal(isLocalDevelopmentEnvironment(env), false);
  assert.equal(isLocalFeatureEnabled("autoLogin", env), false);
});

test("disables local-only flags in preview and production hosting environments", () => {
  const previewEnv = createEnv({
    VERCEL_ENV: "preview",
    [LOCAL_FEATURE_FLAG_ENV_VARS.autoLogin]: "1",
  });
  const productionEnv = createEnv({
    VERCEL_ENV: "production",
    [LOCAL_FEATURE_FLAG_ENV_VARS.autoLogin]: "1",
  });

  assert.equal(isLocalDevelopmentEnvironment(previewEnv), false);
  assert.equal(isLocalDevelopmentEnvironment(productionEnv), false);
  assert.equal(isLocalFeatureEnabled("autoLogin", previewEnv), false);
  assert.equal(isLocalFeatureEnabled("autoLogin", productionEnv), false);
});
