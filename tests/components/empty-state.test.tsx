import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

type ElementLike = {
  props: {
    children?: unknown;
    className?: unknown;
    onClick?: unknown;
  };
  type: unknown;
};

type EmptyStateModule = {
  DraftEmptyState: (props: {
    actionLabel?: string;
    children?: unknown;
    className?: string;
    onAction?: () => void;
  }) => unknown;
  EMPTY_STATE_COPY: Record<
    "drafts" | "imports" | "threads" | "voices",
    {
      actionLabel: string;
      description: string;
      eyebrow: string;
      title: string;
    }
  >;
  EmptyState: (props: {
    actionLabel?: string;
    children?: unknown;
    className?: string;
    description: string;
    eyebrow: string;
    onAction?: () => void;
    title: string;
  }) => unknown;
  ImportEmptyState: (props: {
    actionLabel?: string;
    children?: unknown;
    className?: string;
    onAction?: () => void;
  }) => unknown;
  ThreadEmptyState: (props: {
    actionLabel?: string;
    children?: unknown;
    className?: string;
    onAction?: () => void;
  }) => unknown;
  VoiceEmptyState: (props: {
    actionLabel?: string;
    children?: unknown;
    className?: string;
    onAction?: () => void;
  }) => unknown;
};

function compileFixture(projectRoot: string): string {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-empty-state-"));

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
      "components/empty-state.tsx",
      "tests/components/empty-state.test.tsx",
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

function resolveRenderedTree(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => resolveRenderedTree(entry));
  }

  if (!isElementLike(value)) {
    return value;
  }

  if (typeof value.type === "function") {
    return resolveRenderedTree(value.type(value.props));
  }

  return {
    ...value,
    props: {
      ...value.props,
      children: resolveRenderedTree(value.props.children),
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

async function loadEmptyStateModule() {
  const projectRoot = process.cwd();
  const outputDirectory = compileFixture(projectRoot);
  const compiledModulePath = resolve(outputDirectory, "components/empty-state.js");

  return {
    module: (await import(pathToFileURL(compiledModulePath).href)) as EmptyStateModule,
    outputDirectory,
  };
}

test("empty state copy exposes the four supported presets", async (t) => {
  const { module, outputDirectory } = await loadEmptyStateModule();

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  assert.deepEqual(Object.keys(module.EMPTY_STATE_COPY), [
    "threads",
    "voices",
    "drafts",
    "imports",
  ]);

  for (const copy of Object.values(module.EMPTY_STATE_COPY)) {
    assert.notEqual(copy.eyebrow.trim(), "");
    assert.notEqual(copy.title.trim(), "");
    assert.notEqual(copy.description.trim(), "");
    assert.notEqual(copy.actionLabel.trim(), "");
  }
});

test("base empty state renders content, children, custom classes, and an action button", async (t) => {
  const { module, outputDirectory } = await loadEmptyStateModule();

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  let actionCalls = 0;

  const view = resolveRenderedTree(
    module.EmptyState({
      eyebrow: "Drafts",
      title: "Nothing here yet",
      description: "Generate a draft to see it here.",
      actionLabel: "Generate now",
      className: "border-emerald-300",
      onAction: () => {
        actionCalls += 1;
      },
      children: <span>Bring your context first.</span>,
    }),
  );

  const text = collectText(view).join(" ");
  const section = findElementByType(view, "section");
  const button = findElementByType(view, "button");

  assert.match(text, /Nothing here yet/);
  assert.match(text, /Generate a draft to see it here\./);
  assert.match(text, /Bring your context first\./);
  assert.ok(section);
  assert.equal(typeof section?.props.className, "string");
  assert.match(String(section?.props.className), /border-emerald-300/);
  assert.ok(button);
  assert.equal(typeof button?.props.onClick, "function");
  if (typeof button?.props.onClick !== "function") {
    assert.fail("Expected the empty state action button to expose an onClick handler.");
  }
  button.props.onClick();
  assert.equal(actionCalls, 1);
});

test("preset empty states render built-in copy and only show actions when wired", async (t) => {
  const { module, outputDirectory } = await loadEmptyStateModule();

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const threadView = resolveRenderedTree(module.ThreadEmptyState({ onAction: () => {} }));
  const voiceView = resolveRenderedTree(module.VoiceEmptyState({}));
  const draftView = resolveRenderedTree(module.DraftEmptyState({ onAction: () => {} }));
  const importView = resolveRenderedTree(
    module.ImportEmptyState({
      actionLabel: "Import samples",
      onAction: () => {},
    }),
  );

  assert.match(collectText(threadView).join(" "), new RegExp(module.EMPTY_STATE_COPY.threads.title));
  assert.match(collectText(voiceView).join(" "), new RegExp(module.EMPTY_STATE_COPY.voices.title));
  assert.match(collectText(draftView).join(" "), new RegExp(module.EMPTY_STATE_COPY.drafts.title));
  assert.match(collectText(importView).join(" "), /Import samples/);

  assert.ok(findElementByType(threadView, "button"));
  assert.equal(findElementByType(voiceView, "button"), null);
  assert.ok(findElementByType(draftView, "button"));
  assert.ok(findElementByType(importView, "button"));
});
