import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

  const pageModulePath = resolve(outputDirectory, "app/page.js");
  const compiledPage = readFileSync(pageModulePath, "utf8")
    .replace('from "next/headers";', 'from "./page-next-headers.mock.js";')
    .replace('from "next/navigation";', 'from "./page-next-navigation.mock.js";');

  writeFileSync(pageModulePath, compiledPage);
  writeFileSync(
    resolve(outputDirectory, "app/page-next-headers.mock.js"),
    `export async function cookies() {
  return {
    get(name) {
      return globalThis.__stanlolHomePageCookies?.get(name);
    },
  };
}
`,
  );
  writeFileSync(
    resolve(outputDirectory, "app/page-next-navigation.mock.js"),
    `export function redirect(path) {
  throw new Error(\`REDIRECT:\${path}\`);
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

function findElementByProp(value, propName, propValue) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const match = findElementByProp(entry, propName, propValue);

      if (match) {
        return match;
      }
    }

    return null;
  }

  if (!isElementLike(value)) {
    return null;
  }

  if (value.props?.[propName] === propValue) {
    return value;
  }

  return findElementByProp(value.props.children, propName, propValue);
}

test("home page composes the Google OAuth and magic link sign-in controls", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compilePageFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
    delete globalThis.__stanlolHomePageCookies;
  });

  const pageModulePath = resolve(outputDirectory, "app/page.js");

  assert.equal(existsSync(pageModulePath), true);

  const pageModule = await import(pathToFileURL(pageModulePath).href);
  globalThis.__stanlolHomePageCookies = new Map();
  const view = resolveElementTree(await pageModule.default());
  const text = collectText(view).join(" ");
  const authLink = findElementByHref(view, pageModule.GOOGLE_OAUTH_PATH);
  const magicLinkForm = findElementByProp(view, "action", pageModule.MAGIC_LINK_REQUEST_PATH);
  const emailField = findElementByProp(view, "name", "email");

  assert.match(text, /Workspace sign-in/);
  assert.match(text, /Sign in to Stanlol and enter the workspace\./);
  assert.match(text, /Continue with Google/);
  assert.match(text, /Request a secure email link\./);
  assert.match(text, /Email me a magic link/);
  assert.ok(authLink);
  assert.ok(magicLinkForm);
  assert.ok(emailField);
  assert.equal(authLink?.props.href, "/auth/callback?provider=google");
  assert.equal(magicLinkForm?.props.method, "post");
});

test("home page surfaces a sanitized auth error message when sign-in fails", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compilePageFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
    delete globalThis.__stanlolHomePageCookies;
  });

  const pageModulePath = resolve(outputDirectory, "app/page.js");

  assert.equal(existsSync(pageModulePath), true);

  const pageModule = await import(pathToFileURL(pageModulePath).href);
  globalThis.__stanlolHomePageCookies = new Map();
  const view = resolveElementTree(
    await pageModule.default({
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

test("home page surfaces magic link request feedback and preserves the submitted email", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compilePageFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
    delete globalThis.__stanlolHomePageCookies;
  });

  const pageModulePath = resolve(outputDirectory, "app/page.js");

  assert.equal(existsSync(pageModulePath), true);

  const pageModule = await import(pathToFileURL(pageModulePath).href);
  globalThis.__stanlolHomePageCookies = new Map();
  const view = resolveElementTree(
    await pageModule.default({
      searchParams: {
        email: "writer@example.com",
        magicLinkStatus: "sent",
      },
    }),
  );
  const text = collectText(view).join(" ");
  const emailField = findElementByProp(view, "name", "email");

  assert.match(text, /Check your inbox\./);
  assert.match(text, /the sign-in link is on its way now\./);
  assert.equal(emailField?.props.defaultValue, "writer@example.com");
});

test("home page redirects authenticated users into the workspace", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compilePageFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
    delete globalThis.__stanlolHomePageCookies;
  });

  const pageModulePath = resolve(outputDirectory, "app/page.js");

  assert.equal(existsSync(pageModulePath), true);

  globalThis.__stanlolHomePageCookies = new Map([
    ["stanlol-refresh-token", { value: "persisted-refresh-token" }],
  ]);

  const pageModule = await import(pathToFileURL(pageModulePath).href);

  await assert.rejects(pageModule.default(), /REDIRECT:\/workspace/);
});
