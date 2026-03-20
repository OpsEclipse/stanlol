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
      "components/account-settings-panel.tsx",
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
  return {
    accessToken,
    async select() {
      return globalThis.__stanlolWorkspaceVoices ?? [];
    },
  };
}

export async function getCurrentUserProfile() {
  return globalThis.__stanlolWorkspaceProfile ?? null;
}
`,
  );

  return outputDirectory;
}

function rewriteCompiledImports(filePath, replacements) {
  const source = readFileSync(filePath, "utf8");
  let nextSource = source;

  for (const [search, replacement] of replacements) {
    nextSource = nextSource.replace(search, replacement);
  }

  writeFileSync(filePath, nextSource);
}

function compileSignOutRouteFixture(projectRoot) {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "stanlol-auth-sign-out-route-"));

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
      "--esModuleInterop",
      "--skipLibCheck",
      "app/auth/sign-out/route.ts",
      "lib/db.ts",
    ],
    {
      cwd: projectRoot,
      stdio: "pipe",
    },
  );

  symlinkSync(resolve(projectRoot, "node_modules"), resolve(outputDirectory, "node_modules"), "dir");

  rewriteCompiledImports(resolve(outputDirectory, "app/auth/sign-out/route.js"), [
    ['from "next/server";', 'from "next/server.js";'],
    ['from "../../../lib/auth-session";', 'from "../../../lib/auth-session.js";'],
  ]);
  rewriteCompiledImports(resolve(outputDirectory, "lib/auth-session.js"), [
    ['from "next/server";', 'from "next/server.js";'],
    ['from "./db";', 'from "./db.js";'],
  ]);

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

function findElementByAriaLabel(value, label) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const match = findElementByAriaLabel(entry, label);

      if (match) {
        return match;
      }
    }

    return null;
  }

  if (!isElementLike(value)) {
    return null;
  }

  if (value.props?.["aria-label"] === label) {
    return value;
  }

  return findElementByAriaLabel(value.props.children, label);
}

function getSetCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }

  const setCookie = response.headers.get("set-cookie");
  return setCookie ? [setCookie] : [];
}

test("workspace page shows thread activity times in the sidebar history list", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compilePageFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
    delete globalThis.__stanlolWorkspaceCookies;
    delete globalThis.__stanlolWorkspaceProfile;
    delete globalThis.__stanlolWorkspaceVoices;
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
  globalThis.__stanlolWorkspaceVoices = [
    {
      created_at: "2026-03-19T21:00:00.000Z",
      description: "Proof-first notes for customer-facing updates.",
      id: "voice-123",
      instructions: "Lead with evidence, keep the tone calm, and close with one CTA.",
      name: "Customer-ready operator",
      updated_at: "2026-03-19T21:10:00.000Z",
      user_id: "user-123",
    },
    {
      created_at: "2026-03-19T19:30:00.000Z",
      description: null,
      id: "voice-456",
      instructions: "Use direct product language and short paragraphs for launch recaps.",
      name: "Launch recap",
      updated_at: "2026-03-19T19:45:00.000Z",
      user_id: "user-123",
    },
  ];

  const pageModule = await import(pathToFileURL(pageModulePath).href);
  const view = resolveElementTree(await pageModule.default());
  const text = collectText(view).join(" ");
  const anchors = findElementsByType(view, "a");
  const forms = findElementsByType(view, "form");
  const main = findElementsByType(view, "main")[0];
  const buttons = findElementsByType(view, "button");
  const focusedWorkspace = findElementByAriaLabel(view, "Focused workspace");
  const conversationSurface = findElementByAriaLabel(view, "Conversation surface");
  const compositionGuidance = findElementByAriaLabel(view, "Composition guidance");
  const promptComposer = findElementByAriaLabel(view, "Prompt composer");
  const sidebarEntryPoints = findElementByAriaLabel(view, "Sidebar entry points");
  const workspaceSidebar = findElementByAriaLabel(view, "Workspace sidebar");
  const narrowScreenWorkflowNotes = findElementByAriaLabel(view, "Narrow-screen workflow notes");
  const compactWorkspaceControls = findElementByAriaLabel(view, "Compact workspace controls");
  const draftPanel = findElementByAriaLabel(view, "Draft panel");
  const voiceCreationForm = findElementByAriaLabel(view, "Voice creation form");
  const savedVoiceDetail = findElementByAriaLabel(view, "Saved voice detail");
  const voiceImportOptions = findElementByAriaLabel(view, "Voice import options");
  const textareas = findElementsByType(view, "textarea");
  const inputs = findElementsByType(view, "input");
  const timeElements = findElementsByType(view, "time");

  assert.ok(main);
  assert.ok(focusedWorkspace);
  assert.ok(conversationSurface);
  assert.ok(compositionGuidance);
  assert.ok(promptComposer);
  assert.ok(sidebarEntryPoints);
  assert.ok(workspaceSidebar);
  assert.ok(narrowScreenWorkflowNotes);
  assert.ok(compactWorkspaceControls);
  assert.ok(draftPanel);
  assert.ok(voiceCreationForm);
  assert.ok(savedVoiceDetail);
  assert.ok(voiceImportOptions);
  assert.equal(draftPanel.props.hidden, true);
  assert.equal(draftPanel.props["data-draft-panel-state"], "hidden");
  assert.match(main.props.className, /min-h-\[100dvh\]/);
  assert.match(main.props.className, /overflow-y-auto/);
  assert.match(main.props.className, /lg:h-\[100dvh\]/);
  assert.match(main.props.className, /lg:overflow-hidden/);
  assert.match(String(focusedWorkspace.props.className), /order-1/);
  assert.match(String(focusedWorkspace.props.className), /lg:order-2/);
  assert.match(String(workspaceSidebar.props.className), /order-2/);
  assert.match(String(workspaceSidebar.props.className), /lg:order-1/);
  assert.match(String(compositionGuidance.props.className), /hidden/);
  assert.match(String(compositionGuidance.props.className), /lg:block/);
  assert.match(String(narrowScreenWorkflowNotes.props.className), /lg:hidden/);
  assert.match(String(compactWorkspaceControls.props.className), /lg:hidden/);
  assert.match(String(promptComposer.props.className), /mt-auto/);
  assert.match(text, /Account/);
  assert.match(text, /Stan Writer/);
  assert.match(text, /writer@example\.com/);
  assert.match(text, /Conversation history/);
  assert.match(text, /Conversation workspace/);
  assert.match(text, /Conversation and composition/);
  assert.match(text, /Active working thread/);
  assert.match(text, /Build the next reply/);
  assert.match(text, /Message composer/);
  assert.match(text, /Primary action/);
  assert.match(text, /Create a reusable voice/);
  assert.match(text, /Reusable profile/);
  assert.match(text, /Voice name/);
  assert.match(text, /Short description/);
  assert.match(text, /Writing instructions/);
  assert.match(text, /Imported samples/);
  assert.match(text, /No samples attached yet/);
  assert.match(text, /0 samples/);
  assert.match(text, /Voice guidance/);
  assert.match(text, /Concise openings/);
  assert.match(text, /Save voice/);
  assert.match(text, /Clear form/);
  assert.match(text, /Recent activity/);
  assert.match(text, /Launch announcement angle/);
  assert.match(text, /Quiet access to history, profile, and settings\./);
  assert.match(text, /History/);
  assert.match(text, /Profile/);
  assert.match(text, /Settings/);
  assert.match(text, /The center panel now carries the active discussion and composition controls/);
  assert.match(text, /Keep the exploratory back-and-forth visible while the reply is being shaped\./);
  assert.match(text, /The center panel keeps the writing brief close to the thread/);
  assert.match(text, /The primary action stays pinned to the bottom of the center panel/);
  assert.match(text, /Save thought/);
  assert.match(text, /Shape response/);
  assert.match(text, /Focused essentials/);
  assert.match(text, /Core workflow first/);
  assert.match(text, /Compact account access/);
  assert.match(text, /Small-screen mode/);
  assert.match(text, /Conversation-first workspace/);
  assert.match(text, /Available on wider screens/);
  assert.match(text, /Draft panel reserved/);
  assert.match(text, /stays hidden until the first active draft exists/i);
  assert.match(text, /Account settings/);
  assert.match(text, /Profile and access/);
  assert.match(text, /Environment and controls/);
  assert.match(text, /Saved voices/);
  assert.match(text, /Review reusable writing profiles without leaving the workspace\./);
  assert.match(text, /Voice detail/);
  assert.match(text, /Ready to edit/);
  assert.match(text, /Edit the saved profile fields here/i);
  assert.match(text, /Save edits/);
  assert.match(text, /Reset edits/);
  assert.match(text, /Import options/);
  assert.match(text, /1 ready, 1 gated/);
  assert.match(text, /Prior writing samples/);
  assert.match(text, /Open manual import/);
  assert.match(text, /Profile and post history/);
  assert.match(text, /LinkedIn import pending/);
  assert.match(text, /Customer-ready operator/);
  assert.match(text, /Proof-first notes for customer-facing updates\./);
  assert.match(text, /Launch recap/);
  assert.match(text, /Use direct product language and short paragraphs for launch recaps\./);
  assert.match(text, /2\s+saved/);
  assert.match(text, /Authenticated workspace access/);
  assert.match(text, /Sign out/);
  assert.match(text, /End this workspace session and return to the sign-in screen\./);
  assert.match(text, /Profile settings stay expanded on wider screens/i);
  assert.equal(inputs.length >= 3, true);
  assert.equal(textareas.length >= 7, true);
  assert.equal(
    inputs.some((input) => /customer-ready operator/i.test(String(input.props.defaultValue))),
    true,
  );
  assert.equal(
    textareas.some((textarea) =>
      /customer-facing launch update/i.test(String(textarea.props.defaultValue)),
    ),
    true,
  );
  assert.equal(
    textareas.some((textarea) =>
      /launch updates and product notes/i.test(String(textarea.props.defaultValue)),
    ),
    true,
  );
  assert.equal(
    textareas.some((textarea) =>
      /Write with a confident operator tone/i.test(String(textarea.props.defaultValue)),
    ),
    true,
  );
  assert.equal(
    textareas.some((textarea) =>
      /Proof-first notes for customer-facing updates\./i.test(String(textarea.props.defaultValue)),
    ),
    true,
  );
  assert.equal(
    textareas.some((textarea) =>
      /Lead with evidence, keep the tone calm, and close with one CTA\./i.test(
        String(textarea.props.defaultValue),
      ),
    ),
    true,
  );
  assert.equal(
    forms.some((form) => form.props.action === "/auth/sign-out" && form.props.method === "post"),
    true,
  );
  assert.equal(anchors.some((anchor) => anchor.props.href === "#thread-history"), true);
  assert.equal(anchors.some((anchor) => anchor.props.href === "#current-account"), true);
  assert.equal(anchors.some((anchor) => anchor.props.href === "#workspace-settings"), true);
  assert.equal(
    forms.some((form) => form.props["aria-label"] === "Voice profile fields"),
    true,
  );
  assert.equal(
    forms.some(
      (form) =>
        form.props["aria-label"] === "Message composer form" &&
        form.props.action === "/workspace" &&
        form.props.method === "get",
    ),
    true,
  );
  assert.equal(forms.some((form) => form.props["aria-label"] === "Voice detail editor"), true);
  assert.equal(
    forms.some(
      (form) =>
        form.props["aria-label"] === "Manual voice import action" &&
        form.props.action === "/workspace" &&
        form.props.method === "get",
    ),
    true,
  );
  assert.equal(buttons.some((button) => collectText(button).join(" ").includes("Save thought")), true);
  assert.equal(buttons.some((button) => collectText(button).join(" ").includes("Shape response")), true);
  assert.equal(buttons.some((button) => collectText(button).join(" ").includes("Save voice")), true);
  assert.equal(buttons.some((button) => collectText(button).join(" ").includes("Clear form")), true);
  assert.equal(buttons.some((button) => collectText(button).join(" ").includes("Save edits")), true);
  assert.equal(buttons.some((button) => collectText(button).join(" ").includes("Reset edits")), true);
  assert.equal(
    buttons.some((button) => collectText(button).join(" ").includes("Open manual import")),
    true,
  );
  assert.equal(
    buttons.some((button) => collectText(button).join(" ").includes("LinkedIn import pending")),
    true,
  );
  assert.equal(timeElements.length, 3);
  for (const timeElement of timeElements) {
    assert.equal(typeof timeElement.props.dateTime, "string");
    assert.equal(String(timeElement.props.dateTime).length > 0, true);
    assert.equal(collectText(timeElement).join("").trim().length > 0, true);
  }
});

test("workspace page appends a submitted composer message into the active thread", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compilePageFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
    delete globalThis.__stanlolWorkspaceCookies;
    delete globalThis.__stanlolWorkspaceProfile;
    delete globalThis.__stanlolWorkspaceVoices;
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
  globalThis.__stanlolWorkspaceVoices = [];

  const pageModule = await import(pathToFileURL(pageModulePath).href);
  const view = resolveElementTree(
    await pageModule.default({
      searchParams: Promise.resolve({
        message: "Keep the CTA to one sentence and make the pilot result the first line.",
        threadId: "thread-launch-announcement",
      }),
    }),
  );
  const text = collectText(view).join(" ");
  const textareas = findElementsByType(view, "textarea");

  assert.match(text, /4\s+turns/);
  assert.match(text, /New user message/);
  assert.match(text, /Keep the CTA to one sentence and make the pilot result the first line\./);
  assert.equal(
    textareas.some((textarea) => textarea.props.id === "workspace-message-composer" && textarea.props.defaultValue === ""),
    true,
  );
});

test("workspace page opens the staged manual import workflow inside voice detail", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compilePageFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
    delete globalThis.__stanlolWorkspaceCookies;
    delete globalThis.__stanlolWorkspaceProfile;
    delete globalThis.__stanlolWorkspaceVoices;
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
  globalThis.__stanlolWorkspaceVoices = [
    {
      created_at: "2026-03-19T21:00:00.000Z",
      description: "Proof-first notes for customer-facing updates.",
      id: "voice-123",
      instructions: "Lead with evidence, keep the tone calm, and close with one CTA.",
      name: "Customer-ready operator",
      updated_at: "2026-03-19T21:10:00.000Z",
      user_id: "user-123",
    },
  ];

  const pageModule = await import(pathToFileURL(pageModulePath).href);
  const view = resolveElementTree(
    await pageModule.default({
      searchParams: Promise.resolve({
        voiceId: "voice-123",
        voiceImport: "manual",
      }),
    }),
  );
  const text = collectText(view).join(" ");
  const manualVoiceImport = findElementByAriaLabel(view, "Manual voice import");
  const manualImportSources = findElementByAriaLabel(view, "Manual import sources");
  const forms = findElementsByType(view, "form");
  const buttons = findElementsByType(view, "button");

  assert.ok(manualVoiceImport);
  assert.ok(manualImportSources);
  assert.match(text, /Manual import/);
  assert.match(text, /Bring source material into\s+Customer-ready operator/);
  assert.match(text, /3 sources staged/);
  assert.match(text, /Paste prior writing/);
  assert.match(text, /Upload a text file/);
  assert.match(text, /Upload a CSV export/);
  assert.match(text, /Back to voice detail/);
  assert.equal(
    forms.some(
      (form) =>
        form.props["aria-label"] === "Close manual voice import" &&
        form.props.action === "/workspace" &&
        form.props.method === "get",
    ),
    true,
  );
  assert.equal(
    buttons.some((button) => collectText(button).join(" ").includes("Back to voice detail")),
    true,
  );
});

test("POST /auth/sign-out clears auth cookies and redirects to the sign-in screen", async (t) => {
  const projectRoot = process.cwd();
  const outputDirectory = compileSignOutRouteFixture(projectRoot);

  t.after(() => {
    rmSync(outputDirectory, { force: true, recursive: true });
  });

  const routeModulePath = resolve(outputDirectory, "app/auth/sign-out/route.js");

  assert.equal(existsSync(routeModulePath), true);

  const routeModule = await import(pathToFileURL(routeModulePath).href);
  const {
    ACCESS_TOKEN_COOKIE,
    ACCESS_TOKEN_EXPIRES_AT_COOKIE,
    POST,
    REFRESH_TOKEN_COOKIE,
    SIGN_OUT_PATH,
  } = routeModule;

  const response = await POST(new Request(`https://stanlol.test${SIGN_OUT_PATH}`, { method: "POST" }));
  const location = response.headers.get("location");
  const setCookies = getSetCookies(response);

  assert.equal(response.status, 303);
  assert.equal(location, "https://stanlol.test/");
  assert.ok(setCookies.some((cookie) => cookie.startsWith(`${ACCESS_TOKEN_COOKIE}=`)));
  assert.ok(setCookies.some((cookie) => cookie.startsWith(`${REFRESH_TOKEN_COOKIE}=`)));
  assert.ok(setCookies.some((cookie) => cookie.startsWith(`${ACCESS_TOKEN_EXPIRES_AT_COOKIE}=`)));
  assert.ok(setCookies.every((cookie) => /Expires=Thu, 01 Jan 1970 00:00:00 GMT/.test(cookie)));
});
