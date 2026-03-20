import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
      "components/sidebar-profile-summary.tsx",
      "components/thread-history-list.tsx",
    ],
    {
      cwd: projectRoot,
      stdio: "pipe",
    },
  );

  symlinkSync(resolve(projectRoot, "node_modules"), resolve(outputDirectory, "node_modules"), "dir");

  const pageModulePath = resolve(outputDirectory, "app/workspace/page.js");
  const compiledPage = readFileSync(pageModulePath, "utf8")
    .replace('from "next/headers";', 'from "./workspace-page-next-headers.mock.js";')
    .replace('from "../../lib/db.js";', 'from "./workspace-page-db.mock.js";');

  writeFileSync(pageModulePath, compiledPage);
  writeFileSync(
    resolve(outputDirectory, "app/workspace/workspace-page-next-headers.mock.js"),
    `export async function cookies() {
  return {
    get(name) {
      return globalThis.__stanlolWorkspaceCookies?.get(name);
    },
  };
}
`,
  );
  writeFileSync(
    resolve(outputDirectory, "app/workspace/workspace-page-db.mock.js"),
    `export function getUserDb(accessToken) {
  return { accessToken };
}

export async function getCurrentUserProfile() {
  return globalThis.__stanlolWorkspaceProfile ?? null;
}
`,
  );

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
    delete globalThis.__stanlolWorkspaceCookies;
    delete globalThis.__stanlolWorkspaceProfile;
  });

  const pageModulePath = resolve(outputDirectory, "app/workspace/page.js");

  assert.equal(existsSync(pageModulePath), true);

  globalThis.__stanlolWorkspaceCookies = new Map([
    ["stanlol-access-token", { value: "header.eyJlbWFpbCI6IndyaXRlckBleGFtcGxlLmNvbSIsIm5hbWUiOiJTdGFuIFdyaXRlciJ9.signature" }],
  ]);
  globalThis.__stanlolWorkspaceProfile = {
    created_at: "2026-03-19T20:00:00.000Z",
    display_name: "Stan Writer",
    email: "writer@example.com",
    id: "user-123",
    updated_at: "2026-03-19T20:15:00.000Z",
  };

  const pageModule = await import(pathToFileURL(pageModulePath).href);
  const view = resolveElementTree(await pageModule.default());
  const text = collectText(view).join(" ");
  const timeElements = findElementsByType(view, "time");

  assert.match(text, /Account/);
  assert.match(text, /Stan Writer/);
  assert.match(text, /writer@example\.com/);
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
