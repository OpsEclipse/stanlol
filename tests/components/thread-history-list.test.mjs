import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function compileFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-thread-history-list-"));

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

function findElementsByProp(value, key, expectedValue, matches = []) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      findElementsByProp(entry, key, expectedValue, matches);
    }

    return matches;
  }

  if (!isElementLike(value)) {
    return matches;
  }

  if (value.props[key] === expectedValue) {
    matches.push(value);
  }

  return findElementsByProp(value.props.children, key, expectedValue, matches);
}

async function loadThreadHistoryListModule() {
  const projectRoot = process.cwd();
  const outputDirectory = compileFixture(projectRoot);
  const modulePath = resolve(outputDirectory, "components/thread-history-list.js");

  assert.equal(existsSync(modulePath), true);

  return {
    module: await import(pathToFileURL(modulePath).href),
    outputDirectory,
  };
}

test("ThreadHistoryList renders relative activity timestamps and highlights the active thread", async (t) => {
  const { module, outputDirectory } = await loadThreadHistoryListModule();

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const view = resolveElementTree(
    module.ThreadHistoryList({
      now: "2026-03-19T22:15:00.000Z",
      threads: [
        {
          id: "thread-1",
          title: "Launch announcement angle",
          updatedAt: "2026-03-19T22:10:00.000Z",
          isActive: true,
        },
        {
          id: "thread-2",
          title: null,
          updatedAt: "2026-03-19T20:15:00.000Z",
        },
      ],
    }),
  );

  const text = collectText(view).join(" ");
  const times = findElementsByType(view, "time");
  const activeItems = findElementsByProp(view, "data-active", "true");

  assert.match(text, /History/);
  assert.match(text, /Recent activity/);
  assert.match(text, /Launch announcement angle/);
  assert.match(text, /Untitled thread/);
  assert.deepEqual(
    times.map((entry) => collectText(entry).join("").trim()),
    ["5 minutes ago", "2 hours ago"],
  );
  assert.equal(times[0]?.props.dateTime, "2026-03-19T22:10:00.000Z");
  assert.equal(typeof times[0]?.props.title, "string");
  assert.equal(String(times[0]?.props.title).length > 0, true);
  assert.equal(activeItems.length, 1);
});

test("ThreadHistoryList renders an empty history label when no threads are available", async (t) => {
  const { module, outputDirectory } = await loadThreadHistoryListModule();

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const view = resolveElementTree(
    module.ThreadHistoryList({
      emptyLabel: "Nothing to reopen yet.",
      threads: [],
    }),
  );

  assert.match(collectText(view).join(" "), /Nothing to reopen yet\./);
});
