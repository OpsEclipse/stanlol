import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function compilePageFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-workspace-page-"));

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
      "app/workspace/page.tsx",
      "components/thread-history-list.tsx",
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

function findElementsByType(value, type, matches = []) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      findElementsByType(entry, type, matches);
    }

    return matches;
  }

  if (!isElementLike(value)) {
    return matches;
  }

  if (value.type === type) {
    matches.push(value);
  }

  return findElementsByType(value.props.children, type, matches);
}

test("workspace page shows thread activity times in the sidebar history list", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compilePageFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const pageModulePath = resolve(outputDirectory, "app/workspace/page.js");

  assert.equal(existsSync(pageModulePath), true);

  const pageModule = await import(pathToFileURL(pageModulePath).href);
  const view = resolveElementTree(pageModule.default());
  const text = collectText(view).join(" ");
  const timeElements = findElementsByType(view, "time");

  assert.match(text, /Conversation history/);
  assert.match(text, /Recent activity/);
  assert.match(text, /Launch announcement angle/);
  assert.equal(timeElements.length, 3);
  for (const timeElement of timeElements) {
    assert.equal(typeof timeElement.props.dateTime, "string");
    assert.equal(String(timeElement.props.dateTime).length > 0, true);
    assert.equal(collectText(timeElement).join("").trim().length > 0, true);
  }
});
