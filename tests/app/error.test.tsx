import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

type ElementLike = {
  props: {
    children?: unknown;
    href?: unknown;
    onClick?: unknown;
  };
  type: unknown;
};

function getProjectRoot(): string {
  return process.cwd();
}

function compileErrorBoundaryFixture(projectRoot: string): string {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-error-boundary-"));

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
      "app/error.tsx",
      "tests/app/error.test.tsx",
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

function findElementByHref(value: unknown, href: string): ElementLike | null {
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

test("app error boundary renders the recovery UI and retry action", async (t) => {
  const projectRoot = getProjectRoot();
  const outputDirectory = compileErrorBoundaryFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const compiledModulePath = resolve(outputDirectory, "app/error.js");

  assert.equal(existsSync(compiledModulePath), true);

  const errorModule = (await import(pathToFileURL(compiledModulePath).href)) as {
    ERROR_BOUNDARY_COPY: {
      description: string;
      digestLabel: string;
      eyebrow: string;
      home: string;
      retry: string;
      title: string;
    };
    default: (props: {
      error: Error & {
        digest?: string;
      };
      reset: () => void;
    }) => unknown;
  };

  let resetCalls = 0;

  const view = errorModule.default({
    error: Object.assign(new Error("boom"), { digest: "digest-123" }),
    reset: () => {
      resetCalls += 1;
    },
  });

  const text = collectText(view).join(" ");
  const retryButton = findElementByType(view, "button");
  const homeLink = findElementByHref(view, "/");

  assert.match(text, new RegExp(errorModule.ERROR_BOUNDARY_COPY.eyebrow));
  assert.match(text, new RegExp(errorModule.ERROR_BOUNDARY_COPY.title));
  assert.match(text, new RegExp(errorModule.ERROR_BOUNDARY_COPY.description));
  assert.match(text, /digest-123/);
  assert.ok(retryButton);
  const retryHandler = retryButton.props.onClick;
  assert.equal(typeof retryHandler, "function");
  if (typeof retryHandler !== "function") {
    assert.fail("Expected the retry control to expose an onClick handler.");
  }
  retryHandler();
  assert.equal(resetCalls, 1);
  assert.ok(homeLink);
  assert.equal(homeLink.props.href, "/");
  assert.deepEqual(collectText(homeLink.props.children), [errorModule.ERROR_BOUNDARY_COPY.home]);
});

test("app error boundary omits the digest label when no digest exists", async (t) => {
  const projectRoot = getProjectRoot();
  const outputDirectory = compileErrorBoundaryFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const errorModule = (await import(
    pathToFileURL(resolve(outputDirectory, "app/error.js")).href
  )) as {
    ERROR_BOUNDARY_COPY: {
      digestLabel: string;
    };
    default: (props: {
      error: Error & {
        digest?: string;
      };
      reset: () => void;
    }) => unknown;
  };

  const view = errorModule.default({
    error: new Error("boom"),
    reset: () => {},
  });

  const text = collectText(view).join(" ");

  assert.equal(text.includes(errorModule.ERROR_BOUNDARY_COPY.digestLabel), false);
});
