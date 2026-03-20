import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function compileLoadingFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-workspace-loading-"));

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
      "app/workspace/loading.tsx",
      "components/loading-state.tsx",
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

function resolveElementTree(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => resolveElementTree(entry));
  }

  if (!isElementLike(value)) {
    return value;
  }

  if (typeof value.type === "function") {
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

function findElementByType(value, type) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const match = findElementByType(entry, type);

      if (match) {
        return match;
      }
    }

    return null;
  }

  if (!isElementLike(value)) {
    return null;
  }

  if (value.type === type) {
    return value;
  }

  return findElementByType(value.props.children, type);
}

test("workspace loading screen shows the auth bootstrap loading state", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileLoadingFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const modulePath = resolve(outputDirectory, "app/workspace/loading.js");

  assert.equal(existsSync(modulePath), true);

  const loadingModule = await import(pathToFileURL(modulePath).href);
  const view = resolveElementTree(loadingModule.default());
  const text = collectText(view).join(" ");
  const main = findElementByType(view, "main");
  const section = findElementByType(view, "section");

  assert.ok(main);
  assert.ok(section);
  assert.equal(section?.props["data-loading-kind"], "auth");
  assert.match(text, /Authenticating/);
  assert.match(text, /Resolving your session/);
  assert.match(text, /authenticated workspace shell/i);
});
