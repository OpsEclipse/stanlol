import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function compilePageFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-home-page-"));

  execFileSync(
    "npx",
    [
      "tsc",
      "--outDir",
      outputDirectory,
      "--module",
      "esnext",
      "--moduleResolution",
      "bundler",
      "--target",
      "es2022",
      "--jsx",
      "react-jsx",
      "--esModuleInterop",
      "--skipLibCheck",
      "app/page.tsx",
      "components/google-oauth-sign-in-screen.tsx",
    ],
    {
      cwd: projectRoot,
      stdio: "pipe",
    },
  );

  symlinkSync(resolve(projectRoot, "node_modules"), resolve(outputDirectory, "node_modules"), "dir");

  return outputDirectory;
}

function isElementLike(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "props" in value && "type" in value;
}

function isFunctionComponentLike(value) {
  return typeof value === "function";
}

function resolveElementTree(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => resolveElementTree(entry));
  }

  if (!isElementLike(value)) {
    return value;
  }

  if (isFunctionComponentLike(value.type)) {
    return resolveElementTree(value.type(value.props));
  }

  return {
    ...value,
    props: {
      ...value.props,
      children: resolveElementTree(value.props.children),
    },
  };
}

function collectText(value) {
  if (typeof value === "string" || typeof value === "number") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectText(entry));
  }

  if (!isElementLike(value)) {
    return [];
  }

  return collectText(value.props.children);
}

function findElementByHref(value, href) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const match = findElementByHref(entry, href);

      if (match) {
        return match;
      }
    }

    return null;
  }

  if (!isElementLike(value)) {
    return null;
  }

  if (value.props.href === href) {
    return value;
  }

  return findElementByHref(value.props.children, href);
}

test("home page composes the Google OAuth sign-in screen", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compilePageFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const pageModulePath = resolve(outputDirectory, "app/page.js");

  assert.equal(existsSync(pageModulePath), true);

  const pageModule = await import(pathToFileURL(pageModulePath).href);
  const view = resolveElementTree(pageModule.default());
  const text = collectText(view).join(" ");
  const authLink = findElementByHref(view, pageModule.GOOGLE_OAUTH_PATH);

  assert.match(text, /Workspace sign-in/);
  assert.match(text, /Sign in with Google to enter Stanlol\./);
  assert.match(text, /Continue with Google/);
  assert.ok(authLink);
  assert.equal(authLink?.props.href, "/auth/callback?provider=google");
});

test("home page surfaces a sanitized auth error message when sign-in fails", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compilePageFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const pageModulePath = resolve(outputDirectory, "app/page.js");

  assert.equal(existsSync(pageModulePath), true);

  const pageModule = await import(pathToFileURL(pageModulePath).href);
  const view = resolveElementTree(
    pageModule.default({
      searchParams: {
        authError: "error_description=provider leaked detail",
      },
    }),
  );
  const text = collectText(view).join(" ");

  assert.match(text, /Sign-in could not be completed\./);
  assert.match(text, /Start the sign-in flow again\./);
  assert.equal(text.includes("provider leaked detail"), false);
});
