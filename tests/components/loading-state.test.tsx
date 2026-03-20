import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

type ElementLike = {
  props: Record<string, unknown> & {
    children?: unknown;
  };
  type: unknown;
};

type FunctionComponentLike = (props: Record<string, unknown>) => unknown;

function getProjectRoot(): string {
  return process.cwd();
}

function compileLoadingStateFixture(projectRoot: string): string {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-loading-state-"));

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
      "components/loading-state.tsx",
      "tests/components/loading-state.test.tsx",
    ],
    {
      cwd: projectRoot,
      stdio: "pipe",
    },
  );

  symlinkSync(resolve(projectRoot, "node_modules"), resolve(outputDirectory, "node_modules"), "dir");

  return outputDirectory;
}

function isElementLike(value: unknown): value is ElementLike {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return "props" in candidate && "type" in candidate;
}

function isFunctionComponentLike(value: unknown): value is FunctionComponentLike {
  return typeof value === "function";
}

function resolveElementTree(value: unknown): unknown {
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

function collectText(value: unknown): string[] {
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

function findElementByType(value: unknown, type: string): ElementLike | null {
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

function findElementsByProp(
  value: unknown,
  key: string,
  expectedValue: unknown,
  matches: ElementLike[] = [],
): ElementLike[] {
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

test("loading state copy defines the supported surfaces", async (t) => {
  const projectRoot = getProjectRoot();
  const outputDirectory = compileLoadingStateFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const modulePath = resolve(outputDirectory, "components/loading-state.js");

  assert.equal(existsSync(modulePath), true);

  const loadingStateModule = (await import(pathToFileURL(modulePath).href)) as {
    LOADING_STATE_COPY: Record<
      string,
      {
        description: string;
        eyebrow: string;
        title: string;
      }
    >;
  };

  assert.deepEqual(Object.keys(loadingStateModule.LOADING_STATE_COPY), [
    "auth",
    "chat",
    "drafts",
    "uploads",
    "settings",
  ]);

  const titles = Object.values(loadingStateModule.LOADING_STATE_COPY).map((entry) => entry.title);

  assert.equal(new Set(titles).size, titles.length);
});

test("LoadingState renders the shared accessible shell and accepts overrides", async (t) => {
  const projectRoot = getProjectRoot();
  const outputDirectory = compileLoadingStateFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const loadingStateModule = (await import(
    pathToFileURL(resolve(outputDirectory, "components/loading-state.js")).href
  )) as {
    LoadingState: (props: {
      children?: unknown;
      description?: string;
      kind: "chat";
      title?: string;
    }) => unknown;
  };

  const view = loadingStateModule.LoadingState({
    kind: "chat",
    title: "Loading your active thread",
    description: "Rebuilding the conversation state for the current workspace.",
    children: "Context footer",
  });

  const resolvedView = resolveElementTree(view);
  const section = findElementByType(resolvedView, "section");
  const text = collectText(resolvedView).join(" ");
  const skeletonLines = findElementsByProp(resolvedView, "data-loading-skeleton", "line");
  const skeletonPanels = findElementsByProp(resolvedView, "data-loading-panel", "primary");

  assert.ok(section);
  assert.equal(section?.props["aria-busy"], "true");
  assert.equal(section?.props["aria-live"], "polite");
  assert.equal(section?.props.role, "status");
  assert.equal(section?.props["data-loading-kind"], "chat");
  assert.match(text, /Loading chat/);
  assert.match(text, /Loading your active thread/);
  assert.match(text, /Rebuilding the conversation state/);
  assert.match(text, /Context footer/);
  assert.equal(skeletonLines.length, 10);
  assert.equal(skeletonPanels.length, 1);
});

test("named loading state variants map to the correct copy and kind", async (t) => {
  const projectRoot = getProjectRoot();
  const outputDirectory = compileLoadingStateFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const loadingStateModule = (await import(
    pathToFileURL(resolve(outputDirectory, "components/loading-state.js")).href
  )) as {
    AuthLoadingState: () => unknown;
    ChatLoadingState: () => unknown;
    DraftsLoadingState: () => unknown;
    SettingsLoadingState: () => unknown;
    UploadsLoadingState: () => unknown;
    LOADING_STATE_COPY: Record<
      string,
      {
        description: string;
        eyebrow: string;
        title: string;
      }
    >;
  };

  const variants = [
    ["auth", loadingStateModule.AuthLoadingState],
    ["chat", loadingStateModule.ChatLoadingState],
    ["drafts", loadingStateModule.DraftsLoadingState],
    ["uploads", loadingStateModule.UploadsLoadingState],
    ["settings", loadingStateModule.SettingsLoadingState],
  ] as const;

  for (const [kind, Component] of variants) {
    const view = Component();
    const resolvedView = resolveElementTree(view);
    const section = findElementByType(resolvedView, "section");
    const text = collectText(resolvedView).join(" ");
    const expectedCopy = loadingStateModule.LOADING_STATE_COPY[kind];

    assert.equal(section?.props["data-loading-kind"], kind);
    assert.match(text, new RegExp(expectedCopy.eyebrow));
    assert.match(text, new RegExp(expectedCopy.title));
    assert.match(text, new RegExp(expectedCopy.description));
  }
});
