import { cookies } from "next/headers";
import {
  AccountSettingsPanel,
  AccountSettingsSection,
  SettingsPanelItem,
} from "../../components/account-settings-panel.js";
import { SidebarProfileSummary } from "../../components/sidebar-profile-summary.js";
import {
  ThreadHistoryList,
  type ThreadHistoryItem,
} from "../../components/thread-history-list.js";
import { getCurrentUserProfile, getUserDb } from "../../lib/db.js";

const ACCESS_TOKEN_COOKIE_NAME = "stanlol-access-token";
const SIGN_OUT_PATH = "/auth/sign-out";

interface SidebarIdentity {
  displayName: string | null;
  email: string | null;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue ? normalizedValue : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeBase64Url(value: string): string | null {
  const normalizedValue = value.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalizedValue.length % 4;
  const paddedValue =
    remainder === 0 ? normalizedValue : `${normalizedValue}${"=".repeat(4 - remainder)}`;

  try {
    return Buffer.from(paddedValue, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function parseAccessTokenPayload(accessToken: string): Record<string, unknown> | null {
  const segments = accessToken.split(".");

  if (segments.length < 2) {
    return null;
  }

  const payload = decodeBase64Url(segments[1] ?? "");

  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as unknown;

    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readDisplayNameFromMetadata(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) {
    return null;
  }

  for (const key of ["display_name", "full_name", "name", "user_name"] as const) {
    const value = normalizeText(metadata[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

function deriveSidebarIdentityFromToken(accessToken: string): SidebarIdentity {
  const payload = parseAccessTokenPayload(accessToken);

  if (!payload) {
    return {
      displayName: null,
      email: null,
    };
  }

  const userMetadata = isRecord(payload.user_metadata)
    ? payload.user_metadata
    : isRecord(payload.userMetadata)
      ? payload.userMetadata
      : null;

  return {
    displayName:
      normalizeText(payload.display_name) ??
      normalizeText(payload.name) ??
      readDisplayNameFromMetadata(userMetadata),
    email: normalizeText(payload.email),
  };
}

async function loadSidebarIdentity(): Promise<SidebarIdentity> {
  let accessToken = "";

  try {
    const cookieStore = await cookies();
    accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value?.trim() ?? "";
  } catch {
    return {
      displayName: null,
      email: null,
    };
  }

  if (!accessToken) {
    return {
      displayName: null,
      email: null,
    };
  }

  const fallbackIdentity = deriveSidebarIdentityFromToken(accessToken);

  try {
    const profile = await getCurrentUserProfile(getUserDb(accessToken));

    if (!profile) {
      return fallbackIdentity;
    }

    return {
      displayName: normalizeText(profile.display_name),
      email: normalizeText(profile.email),
    };
  } catch {
    return fallbackIdentity;
  }
}

function createDemoThreadHistory(): ThreadHistoryItem[] {
  const now = Date.now();

  return [
    {
      id: "thread-launch-announcement",
      title: "Launch announcement angle",
      updatedAt: new Date(now - 8 * 60 * 1000).toISOString(),
      isActive: true,
    },
    {
      id: "thread-investor-update",
      title: "Investor update follow-up",
      updatedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "thread-untitled",
      title: null,
      updatedAt: new Date(now - 28 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

const WORKSPACE_THREAD_HISTORY = createDemoThreadHistory();
const SIDEBAR_ENTRY_POINTS = [
  {
    href: "#thread-history",
    label: "History",
    summary: "Recent threads",
  },
  {
    href: "#current-account",
    label: "Profile",
    summary: "Current account",
  },
  {
    href: "#workspace-settings",
    label: "Settings",
    summary: "Account controls",
  },
] as const;

const WORKSPACE_CONVERSATION_MESSAGES = [
  {
    id: "assistant-brief",
    accentClassName: "border-emerald-300/20 bg-emerald-200/10 text-emerald-100",
    body:
      "I can help shape a launch note, tighten the angle, and keep the thread focused on audience, proof, and tone.",
    detail: "Assistant framing",
    speaker: "Stanlol",
  },
  {
    id: "user-goal",
    accentClassName: "border-sky-300/20 bg-sky-200/10 text-sky-100",
    body:
      "We need a concise update for existing customers. Keep it confident, mention the pilot results, and end with a clear CTA.",
    detail: "User objective",
    speaker: "You",
  },
  {
    id: "assistant-follow-up",
    accentClassName: "border-amber-300/20 bg-amber-200/10 text-amber-100",
    body:
      "I’ll keep the message short, anchor it in proof, and leave space for the final draft panel once the first response is ready.",
    detail: "Next-step alignment",
    speaker: "Stanlol",
  },
] as const;

const WORKSPACE_COMPOSITION_NOTES = [
  "Audience stays visible beside the conversation so composition choices remain grounded.",
  "Proof points can be staged here before the dedicated draft panel appears.",
  "Calls to action remain explicit so each reply can move cleanly into drafting.",
] as const;

const WORKSPACE_COMPOSER_TAGS = ["Audience: customers", "Tone: confident", "CTA: request demo"] as const;
const NARROW_SCREEN_WORKSPACE_NOTES = [
  "The active thread stays first so replies can be shaped without scrolling through account chrome.",
  "History and profile context drop below the composer once the core workflow is already in view.",
  "Account settings compress into a lighter control card until wider breakpoints restore the full panel.",
] as const;

export default async function WorkspacePage() {
  const sidebarIdentity = await loadSidebarIdentity();

  return (
    <main className="relative min-h-[100dvh] overflow-y-auto bg-stone-950 text-stone-100 lg:h-[100dvh] lg:min-h-screen lg:overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.22),_transparent_36%),linear-gradient(145deg,_#0c0a09_0%,_#1c1917_48%,_#292524_100%)]" />
      <div className="relative mx-auto flex min-h-full w-full max-w-[96rem] flex-col gap-4 px-3 py-3 sm:px-4 sm:py-4 lg:h-full lg:flex-row lg:gap-5">
        <aside
          aria-label="Workspace sidebar"
          className="order-2 flex w-full shrink-0 flex-col lg:order-1 lg:h-full lg:w-[19rem]"
        >
          <div className="flex h-full min-h-0 flex-col rounded-[1.9rem] border border-white/10 bg-black/20 p-3 shadow-2xl shadow-black/30 backdrop-blur-sm">
            <div className="px-2 pb-4">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.34em] text-stone-400">
                Workspace
              </p>
              <h1 className="mt-3 text-lg font-semibold tracking-tight text-white">
                Conversation history
              </h1>
              <p className="mt-2 text-sm leading-6 text-stone-400">
                Quiet access to history, profile, and settings.
              </p>
            </div>
            <nav aria-label="Sidebar entry points" className="px-2 pb-4">
              <ul className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:gap-2 lg:overflow-visible lg:pb-0">
                {SIDEBAR_ENTRY_POINTS.map((entryPoint) => (
                  <li key={entryPoint.href} className="min-w-[10.5rem] lg:min-w-0">
                    <a
                      className="flex items-center justify-between rounded-[1rem] border border-white/10 bg-white/[0.03] px-3 py-2.5 transition hover:border-white/15 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950"
                      href={entryPoint.href}
                    >
                      <span>
                        <span className="block text-sm font-medium text-white">{entryPoint.label}</span>
                        <span className="mt-1 block text-xs text-stone-400">
                          {entryPoint.summary}
                        </span>
                      </span>
                      <span className="text-xs uppercase tracking-[0.24em] text-stone-500">
                        Go
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="max-h-72 min-h-0 flex-1 overflow-y-auto px-2 lg:max-h-none">
              <div id="thread-history">
                <ThreadHistoryList threads={WORKSPACE_THREAD_HISTORY} />
              </div>
            </div>
            <div id="current-account" className="px-2 pt-4">
              <SidebarProfileSummary
                displayName={sidebarIdentity.displayName}
                email={sidebarIdentity.email}
              />
            </div>
          </div>
        </aside>
        <section
          aria-label="Focused workspace"
          className="order-1 flex min-h-0 min-w-0 flex-1 flex-col lg:order-2"
        >
          <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="flex min-h-[28rem] flex-col rounded-[2rem] border border-white/10 bg-white/8 p-4 shadow-2xl shadow-black/40 backdrop-blur sm:p-5">
              <div className="rounded-[1.65rem] border border-white/10 bg-black/20 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <span className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-200/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.26em] text-emerald-100">
                      Workspace ready
                    </span>
                    <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                      Conversation workspace
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-300 md:text-base">
                      The center panel now carries the active discussion and composition controls so
                      each thread has a focused place to think, respond, and prepare the next draft.
                    </p>
                  </div>
                  <div className="max-w-xs rounded-[1.3rem] border border-white/10 bg-white/[0.04] px-4 py-3">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-stone-400">
                      Focus
                    </p>
                    <p className="mt-2 text-sm font-medium text-white">Conversation and composition</p>
                    <p className="mt-2 text-sm leading-6 text-stone-300">
                      The working surface stays centered while sidebar context remains available.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <section
                  aria-label="Conversation surface"
                  className="flex min-h-[18rem] flex-col rounded-[1.75rem] border border-white/10 bg-black/20 p-4 shadow-lg shadow-black/20"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-stone-400">
                        Conversation
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-white">Active working thread</h3>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-stone-300">
                        Keep the exploratory back-and-forth visible while the reply is being shaped.
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-stone-200">
                      {WORKSPACE_CONVERSATION_MESSAGES.length} turns
                    </span>
                  </div>
                  <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                    {WORKSPACE_CONVERSATION_MESSAGES.map((message) => (
                      <article
                        key={message.id}
                        className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white">{message.speaker}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.24em] text-stone-400">
                              {message.detail}
                            </p>
                          </div>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] ${message.accentClassName}`}
                          >
                            Live context
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-stone-200">{message.body}</p>
                      </article>
                    ))}
                  </div>
                </section>
                <aside
                  aria-label="Composition guidance"
                  className="hidden rounded-[1.75rem] border border-white/10 bg-black/20 p-4 shadow-lg shadow-black/20 lg:block"
                >
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-amber-200/75">
                    Composition
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Build the next reply</h3>
                  <p className="mt-3 text-sm leading-6 text-stone-300">
                    The center panel keeps the writing brief close to the thread before a dedicated
                    draft surface appears.
                  </p>
                  <ul className="mt-5 space-y-3">
                    {WORKSPACE_COMPOSITION_NOTES.map((note) => (
                      <li
                        key={note}
                        className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-3 text-sm leading-6 text-stone-200"
                      >
                        {note}
                      </li>
                    ))}
                  </ul>
                </aside>
              </div>
              <section
                aria-label="Narrow-screen workflow notes"
                className="mt-4 rounded-[1.75rem] border border-white/10 bg-black/20 p-4 shadow-lg shadow-black/20 lg:hidden"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-amber-200/75">
                      Narrow screens
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">Focused essentials</h3>
                  </div>
                  <span className="rounded-full border border-amber-300/20 bg-amber-200/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-amber-100">
                    Core workflow first
                  </span>
                </div>
                <ul className="mt-4 space-y-3">
                  {NARROW_SCREEN_WORKSPACE_NOTES.map((note) => (
                    <li
                      key={note}
                      className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-3 text-sm leading-6 text-stone-200"
                    >
                      {note}
                    </li>
                  ))}
                </ul>
              </section>
              <section
                aria-label="Prompt composer"
                className="mt-4 rounded-[1.75rem] border border-white/10 bg-black/20 p-4 shadow-lg shadow-black/20"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-sky-100/75">
                      Compose
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">Message composer</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
                      Draft the next turn directly beneath the conversation so intent and wording
                      stay connected.
                    </p>
                  </div>
                  <span className="rounded-full border border-sky-300/20 bg-sky-200/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-sky-100">
                    Ready to shape
                  </span>
                </div>
                <div className="mt-4">
                  <label
                    className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-stone-400"
                    htmlFor="workspace-message-composer"
                  >
                    Message draft
                  </label>
                  <textarea
                    id="workspace-message-composer"
                    className="mt-3 min-h-32 w-full rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-7 text-stone-100 outline-none placeholder:text-stone-500 focus:border-white/20"
                    defaultValue="Write a concise customer-facing launch update that opens with the pilot result, explains what changed, and ends with a clear next step."
                    rows={5}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {WORKSPACE_COMPOSER_TAGS.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-stone-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-5 flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm leading-6 text-stone-300">
                    Conversation context stays visible here while the dedicated draft panel remains
                    out of view.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-stone-100 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950"
                      type="button"
                    >
                      Save thought
                    </button>
                    <button
                      className="inline-flex items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-200/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200/40 hover:bg-emerald-200/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950"
                      type="button"
                    >
                      Shape response
                    </button>
                  </div>
                </div>
              </section>
            </div>
            <div className="flex min-h-0 flex-col gap-4">
              <aside
                aria-hidden="true"
                aria-label="Draft panel"
                className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/30 backdrop-blur"
                data-draft-panel-state="hidden"
                hidden
                id="workspace-draft-panel"
              >
                <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 p-5">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-stone-500">
                    Draft
                  </p>
                  <h3 className="mt-3 text-xl font-semibold text-white">Draft panel reserved</h3>
                  <p className="mt-3 text-sm leading-6 text-stone-300">
                    The right-side draft region stays hidden until the first active draft exists.
                  </p>
                </div>
              </aside>
              <div id="workspace-settings" className="min-h-0 flex-1">
                <section
                  aria-label="Compact workspace controls"
                  className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/30 backdrop-blur lg:hidden"
                >
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="max-w-xl">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-sky-100/75">
                          Workspace controls
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-white">Compact account access</h3>
                        <p className="mt-3 text-sm leading-6 text-stone-300">
                          Smaller screens keep the account controls nearby without letting the full
                          settings panel interrupt the thread and composer workflow.
                        </p>
                      </div>
                      <span className="rounded-full border border-sky-300/20 bg-sky-200/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-sky-100">
                        Small-screen mode
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <SettingsPanelItem
                        description="Profile details stay in the sidebar while full account settings return on larger layouts."
                        label="Current view"
                        value="Conversation-first workspace"
                      />
                      <SettingsPanelItem
                        description="The full settings surface expands back into the right column once there is room for it."
                        label="Expanded controls"
                        value="Available on wider screens"
                      />
                    </div>
                    <form action={SIGN_OUT_PATH} className="mt-5 border-t border-white/10 pt-4" method="post">
                      <button
                        className="inline-flex items-center justify-center rounded-full border border-rose-300/25 bg-rose-200/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-200/40 hover:bg-rose-200/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950"
                        type="submit"
                      >
                        Sign out
                      </button>
                      <p className="mt-3 text-sm leading-6 text-stone-300">
                        Profile settings stay expanded on wider screens while the mobile view keeps
                        only the essential account actions in reach.
                      </p>
                    </form>
                  </div>
                </section>
                <AccountSettingsPanel className="hidden lg:block xl:h-full">
                  <AccountSettingsSection
                    description="This settings surface keeps the current account state nearby while more detailed profile controls land in follow-up tasks."
                    eyebrow="Account"
                    title="Profile and access"
                  >
                    <SettingsPanelItem
                      description="The current workspace session is authenticated and ready for account-specific preferences."
                      label="Sign-in status"
                      status="Active"
                      value="Authenticated workspace access"
                    />
                    <SettingsPanelItem
                      description="Email visibility and editable display-name controls are staged on top of this base panel."
                      label="Profile controls"
                      value="Account preferences coming next"
                    />
                  </AccountSettingsSection>
                  <AccountSettingsSection
                    description="Workspace controls stay lightweight so the main shell can surface just the essentials without introducing heavy navigation."
                    eyebrow="Workspace"
                    title="Environment and controls"
                  >
                    <SettingsPanelItem
                      description="This area is reserved for low-friction workspace actions tied to the signed-in account."
                      label="Workspace scope"
                      status="Ready"
                      value="Primary writing workspace"
                    />
                    <SettingsPanelItem
                      description="Conversation history and future voice controls can share this settings surface without leaving the workspace shell."
                      label="Saved context"
                      value="History and workspace tools stay close"
                    />
                    <form action={SIGN_OUT_PATH} className="pt-1" method="post">
                      <button
                        className="inline-flex items-center justify-center rounded-full border border-rose-300/25 bg-rose-200/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-200/40 hover:bg-rose-200/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950"
                        type="submit"
                      >
                        Sign out
                      </button>
                      <p className="mt-3 text-sm leading-6 text-stone-300">
                        End this workspace session and return to the sign-in screen.
                      </p>
                    </form>
                  </AccountSettingsSection>
                </AccountSettingsPanel>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
