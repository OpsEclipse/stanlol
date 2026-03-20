import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

type ElementLike = {
  props: {
    ["aria-live"]?: unknown;
    ["aria-label"]?: unknown;
    children?: unknown;
    onClick?: unknown;
    role?: unknown;
  };
  type: unknown;
};

type ToastModule = {
  TOAST_FEEDBACK_COPY: Record<
    "copy" | "save" | "upload" | "import",
    Record<
      "success" | "error",
      {
        description: string;
        title: string;
        tone: "success" | "error" | "info";
      }
    >
  >;
  ToastRegion: React.ComponentType<{
    label?: string;
    toasts: ReadonlyArray<{
      description: string;
      id: string;
      title: string;
      tone: "success" | "error" | "info";
    }>;
  }>;
  default: (props: {
    description: string;
    dismissLabel?: string;
    isVisible?: boolean;
    onDismiss?: () => void;
    title: string;
    tone?: "success" | "error" | "info";
  }) => unknown;
  getToastFeedback: (
    action: "copy" | "save" | "upload" | "import",
    outcome: "success" | "error",
    detail?: string,
  ) => {
    description: string;
    title: string;
    tone: "success" | "error" | "info";
  };
};

function compileToastFixture(projectRoot: string): string {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-toast-"));

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
      "components/toast.tsx",
      "tests/components/toast.test.tsx",
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

async function loadToastModule(): Promise<{ module: ToastModule; outputDirectory: string }> {
  const projectRoot = process.cwd();
  const outputDirectory = compileToastFixture(projectRoot);
  const toastModule = (await import(
    pathToFileURL(resolve(outputDirectory, "components/toast.js")).href
  )) as ToastModule;

  return {
    module: toastModule,
    outputDirectory,
  };
}

test("toast feedback presets cover copy, save, upload, and import outcomes", async (t) => {
  const { module, outputDirectory } = await loadToastModule();

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  assert.deepEqual(Object.keys(module.TOAST_FEEDBACK_COPY), ["copy", "save", "upload", "import"]);
  assert.deepEqual(Object.keys(module.TOAST_FEEDBACK_COPY.copy), ["success", "error"]);

  const successMessage = module.getToastFeedback("copy", "success", "Copied from the current draft.");
  const errorMessage = module.getToastFeedback("upload", "error");

  assert.equal(successMessage.title, "Copied to clipboard");
  assert.equal(successMessage.tone, "success");
  assert.match(successMessage.description, /ready to paste anywhere/i);
  assert.match(successMessage.description, /Copied from the current draft\./);
  assert.equal(errorMessage.title, "Upload failed");
  assert.equal(errorMessage.tone, "error");
});

test("toast renders visible feedback with accessible announcements and dismiss action", async (t) => {
  const { module, outputDirectory } = await loadToastModule();

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  let dismissCalls = 0;

  const view = module.default({
    title: "Import complete",
    description: "The imported content is ready to use in your voice setup.",
    tone: "success",
    onDismiss: () => {
      dismissCalls += 1;
    },
  });

  const text = collectText(view).join(" ");
  const dismissButton = findElementByType(view, "button");

  assert.match(text, /Success/);
  assert.match(text, /Import complete/);
  assert.match(text, /ready to use in your voice setup/);
  assert.ok(isElementLike(view));
  if (!isElementLike(view)) {
    assert.fail("Expected the toast component to return a rendered element.");
  }
  assert.equal(view.props.role, "status");
  assert.equal(view.props["aria-live"], "polite");
  assert.ok(dismissButton);

  const dismissHandler = dismissButton.props.onClick;
  assert.equal(typeof dismissHandler, "function");
  if (typeof dismissHandler !== "function") {
    assert.fail("Expected the dismiss control to expose an onClick handler.");
  }

  dismissHandler();

  assert.equal(dismissCalls, 1);
});

test("toast hides itself when it is not visible and escalates errors in the toast region", async (t) => {
  const { module, outputDirectory } = await loadToastModule();

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const hiddenView = module.default({
    title: "Hidden toast",
    description: "This should not render.",
    isVisible: false,
  });

  assert.equal(hiddenView, null);

  const markup = renderToStaticMarkup(
    React.createElement(module.ToastRegion, {
      label: "Feedback queue",
      toasts: [
        {
          id: "copy-success",
          ...module.getToastFeedback("copy", "success"),
        },
        {
          id: "save-error",
          ...module.getToastFeedback("save", "error"),
        },
      ],
    }),
  );

  assert.match(markup, /Feedback queue/);
  assert.match(markup, /Copied to clipboard/);
  assert.match(markup, /Save failed/);
  assert.match(markup, /role="alert"/);
  assert.match(markup, /aria-live="assertive"/);
});
