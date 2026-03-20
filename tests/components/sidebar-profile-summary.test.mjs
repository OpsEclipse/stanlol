import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function compileFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-sidebar-profile-summary-"));

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
      "components/sidebar-profile-summary.tsx",
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

async function loadSidebarProfileSummaryModule() {
  const projectRoot = process.cwd();
  const outputDirectory = compileFixture(projectRoot);
  const modulePath = resolve(outputDirectory, "sidebar-profile-summary.js");

  assert.equal(existsSync(modulePath), true);

  return {
    module: await import(pathToFileURL(modulePath).href),
    outputDirectory,
  };
}

test("SidebarProfileSummary renders the current user's display name and email", async (t) => {
  const { module, outputDirectory } = await loadSidebarProfileSummaryModule();

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const view = resolveElementTree(
    module.SidebarProfileSummary({
      displayName: "Stan Writer",
      email: "writer@example.com",
    }),
  );
  const text = collectText(view).join(" ");

  assert.match(text, /Account/);
  assert.match(text, /Stan Writer/);
  assert.match(text, /writer@example\.com/);
  assert.match(text, /SW/);
});

test("SidebarProfileSummary falls back gracefully when only an email is available", async (t) => {
  const { module, outputDirectory } = await loadSidebarProfileSummaryModule();

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const view = resolveElementTree(
    module.SidebarProfileSummary({
      displayName: "   ",
      email: "writer@example.com",
    }),
  );
  const text = collectText(view).join(" ");

  assert.match(text, /writer@example\.com/);
  assert.match(text, /Authenticated workspace profile/);
  assert.match(text, /WE/);
});
