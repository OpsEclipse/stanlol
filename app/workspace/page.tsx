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

export default async function WorkspacePage() {
  const sidebarIdentity = await loadSidebarIdentity();

  return (
    <main className="relative h-[100dvh] min-h-screen overflow-hidden bg-stone-950 text-stone-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.22),_transparent_36%),linear-gradient(145deg,_#0c0a09_0%,_#1c1917_48%,_#292524_100%)]" />
      <div className="relative mx-auto flex h-full w-full max-w-[96rem] flex-col gap-4 px-3 py-3 sm:px-4 sm:py-4 lg:flex-row lg:gap-5">
        <aside aria-label="Workspace sidebar" className="flex w-full shrink-0 flex-col lg:h-full lg:w-[19rem]">
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
              <ul className="grid gap-2">
                {SIDEBAR_ENTRY_POINTS.map((entryPoint) => (
                  <li key={entryPoint.href}>
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
            <div className="min-h-0 flex-1 overflow-y-auto px-2">
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
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="flex min-h-[28rem] flex-col rounded-[2rem] border border-white/10 bg-white/8 p-6 shadow-2xl shadow-black/40 backdrop-blur sm:p-8">
              <div className="max-w-3xl">
                <span className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-200/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.26em] text-emerald-100">
                  Workspace ready
                </span>
                <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-5xl">
                  Full-height workspace frame
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-stone-300 md:text-lg">
                  The authenticated route now holds a dedicated, viewport-height shell so the
                  writing session stays focused while the conversation surface and draft panel land
                  in the next layout steps.
                </p>
              </div>
              <div className="mt-8 flex min-h-0 flex-1 flex-col justify-end">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-amber-200/75">
                      Workspace frame
                    </p>
                    <p className="mt-3 text-lg font-semibold text-white">Focused center canvas</p>
                    <p className="mt-2 text-sm leading-6 text-stone-300">
                      The active session now has a stable full-height container for the primary
                      conversation surface.
                    </p>
                  </div>
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-sky-100/75">
                      Authenticated shell
                    </p>
                    <p className="mt-3 text-lg font-semibold text-white">Sidebar stays anchored</p>
                    <p className="mt-2 text-sm leading-6 text-stone-300">
                      History, profile, and account controls stay visible without pushing the
                      working area off-screen.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div id="workspace-settings">
              <AccountSettingsPanel className="xl:h-full">
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
        </section>
      </div>
    </main>
  );
}
