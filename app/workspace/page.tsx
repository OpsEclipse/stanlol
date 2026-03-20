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
import { formatTimestamp } from "../../lib/format-timestamp.js";
import { getCurrentUserProfile, getUserDb } from "../../lib/db.js";
import { listVoiceProfiles, type VoiceProfileRow } from "../../lib/voice-list.js";

const ACCESS_TOKEN_COOKIE_NAME = "stanlol-access-token";
const SIGN_OUT_PATH = "/auth/sign-out";
const VOICE_ID_SEARCH_PARAM = "voiceId";
const VOICE_IMPORT_SEARCH_PARAM = "voiceImport";
const MANUAL_VOICE_IMPORT_MODE = "manual";

interface SidebarIdentity {
  displayName: string | null;
  email: string | null;
  userId: string | null;
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
      userId: null,
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
    userId: normalizeText(payload.sub) ?? normalizeText(payload.user_id),
  };
}

interface WorkspaceContext {
  sidebarIdentity: SidebarIdentity;
  voiceProfiles: VoiceProfileRow[];
}

type WorkspaceSearchParamValue = string | string[] | undefined;
type WorkspaceSearchParams = Record<string, WorkspaceSearchParamValue>;

async function loadWorkspaceContext(): Promise<WorkspaceContext> {
  let accessToken = "";

  try {
    const cookieStore = await cookies();
    accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value?.trim() ?? "";
  } catch {
    return {
      sidebarIdentity: {
        displayName: null,
        email: null,
        userId: null,
      },
      voiceProfiles: [],
    };
  }

  if (!accessToken) {
    return {
      sidebarIdentity: {
        displayName: null,
        email: null,
        userId: null,
      },
      voiceProfiles: [],
    };
  }

  const fallbackIdentity = deriveSidebarIdentityFromToken(accessToken);

  try {
    const userDb = getUserDb(accessToken);
    const profile = await getCurrentUserProfile(userDb).catch(() => null);
    const userId = normalizeText(profile?.id) ?? fallbackIdentity.userId;
    const voiceProfiles = userId ? await listVoiceProfiles(userDb, { userId }).catch(() => []) : [];

    return {
      sidebarIdentity: {
        displayName: normalizeText(profile?.display_name) ?? fallbackIdentity.displayName,
        email: normalizeText(profile?.email) ?? fallbackIdentity.email,
        userId,
      },
      voiceProfiles,
    };
  } catch {
    return {
      sidebarIdentity: fallbackIdentity,
      voiceProfiles: [],
    };
  }
}

function getVoiceSummary(voiceProfile: VoiceProfileRow): string {
  return (
    normalizeText(voiceProfile.description) ??
    normalizeText(voiceProfile.instructions) ??
    "Saved voice profile"
  );
}

function getVoiceUpdatedLabel(updatedAt: string): string {
  const relativeLabel = formatTimestamp(updatedAt, { format: "relative" });
  const absoluteLabel = formatTimestamp(updatedAt, { format: "date" });

  if (relativeLabel) {
    return `Updated ${relativeLabel}`;
  }

  if (absoluteLabel) {
    return `Updated ${absoluteLabel}`;
  }

  return "Updated recently";
}

function getVoiceCreatedLabel(createdAt: string): string {
  const absoluteLabel = formatTimestamp(createdAt, { format: "date" });

  if (absoluteLabel) {
    return `Created ${absoluteLabel}`;
  }

  return "Created recently";
}

function getSelectedVoiceProfile(
  voiceProfiles: ReadonlyArray<VoiceProfileRow>,
  searchParams: WorkspaceSearchParams,
): VoiceProfileRow | null {
  const requestedVoiceId = readSearchParamValue(searchParams[VOICE_ID_SEARCH_PARAM]);

  if (requestedVoiceId) {
    const selectedVoiceProfile = voiceProfiles.find((voiceProfile) => voiceProfile.id === requestedVoiceId);

    if (selectedVoiceProfile) {
      return selectedVoiceProfile;
    }
  }

  return voiceProfiles[0] ?? null;
}

function SavedVoiceList({
  showHeader = false,
  voiceProfiles,
}: {
  showHeader?: boolean;
  voiceProfiles: ReadonlyArray<VoiceProfileRow>;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4">
      {showHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-stone-400">
              Saved voices
            </p>
            <p className="mt-2 text-sm leading-6 text-stone-300">
              Review reusable writing profiles without leaving the workspace.
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-stone-300">
            {voiceProfiles.length} saved
          </span>
        </div>
      ) : null}
      {voiceProfiles.length === 0 ? (
        <p className={showHeader ? "mt-4 text-sm leading-6 text-stone-300" : "text-sm leading-6 text-stone-300"}>
          Saved voices will appear here after the first profile is created.
        </p>
      ) : (
        <ul className={showHeader ? "mt-4 space-y-3" : "space-y-3"}>
          {voiceProfiles.map((voiceProfile) => (
            <li
              key={voiceProfile.id}
              className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{voiceProfile.name}</p>
                  <p className="mt-2 text-sm leading-6 text-stone-300">
                    {getVoiceSummary(voiceProfile)}
                  </p>
                </div>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-200/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-emerald-100">
                  {getVoiceUpdatedLabel(voiceProfile.updated_at)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const VOICE_IMPORT_OPTIONS = [
  {
    buttonLabel: "Open manual import",
    description:
      "Open the staged manual import workflow for pasted samples, text files, and CSV-based examples.",
    eyebrow: "Manual",
    status: "Ready",
    title: "Prior writing samples",
  },
  {
    buttonLabel: "LinkedIn import pending",
    description:
      "Use a gated LinkedIn import path when the supported connection flow is available.",
    eyebrow: "LinkedIn",
    status: "Gated",
    title: "Profile and post history",
  },
] as const;

const MANUAL_IMPORT_SOURCE_OPTIONS = [
  {
    description: "Start with copied posts, notes, or announcements once pasted-text import lands.",
    eyebrow: "Paste",
    status: "Next",
    title: "Paste prior writing",
  },
  {
    description: "Upload a plain text document when the file-based import path is connected.",
    eyebrow: "Text file",
    status: "Next",
    title: "Upload a text file",
  },
  {
    description: "Bring in structured exports after the CSV import parser is available.",
    eyebrow: "CSV",
    status: "Next",
    title: "Upload a CSV export",
  },
] as const;

function SavedVoiceDetail({
  isManualImportOpen,
  voiceProfile,
}: {
  isManualImportOpen: boolean;
  voiceProfile: Readonly<VoiceProfileRow> | null;
}) {
  if (!voiceProfile) {
    return (
      <div className="rounded-[1.35rem] border border-dashed border-white/10 bg-white/[0.02] p-4">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-stone-400">
          Voice detail
        </p>
        <p className="mt-3 text-sm font-medium text-white">Saved voice detail appears here</p>
        <p className="mt-2 text-sm leading-6 text-stone-300">
          Create the first voice profile to unlock edit controls and staged import options.
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label="Saved voice detail"
      className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-stone-400">
            Voice detail
          </p>
          <h4 className="mt-2 text-lg font-semibold text-white">{voiceProfile.name}</h4>
          <p className="mt-2 text-sm leading-6 text-stone-300">{getVoiceSummary(voiceProfile)}</p>
        </div>
        <span className="rounded-full border border-emerald-300/20 bg-emerald-200/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-emerald-100">
          {getVoiceUpdatedLabel(voiceProfile.updated_at)}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-300">
          {getVoiceCreatedLabel(voiceProfile.created_at)}
        </span>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-300">
          Ready to edit
        </span>
      </div>
      <form aria-label="Voice detail editor" className="mt-5 space-y-4">
        <div>
          <label
            className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-stone-400"
            htmlFor={`voice-detail-name-${voiceProfile.id}`}
          >
            Voice name
          </label>
          <input
            id={`voice-detail-name-${voiceProfile.id}`}
            className="mt-3 h-12 w-full rounded-[1.1rem] border border-white/10 bg-black/20 px-4 text-sm text-stone-100 outline-none placeholder:text-stone-500 focus:border-white/20"
            defaultValue={voiceProfile.name}
            type="text"
          />
        </div>
        <div>
          <label
            className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-stone-400"
            htmlFor={`voice-detail-description-${voiceProfile.id}`}
          >
            Short description
          </label>
          <textarea
            id={`voice-detail-description-${voiceProfile.id}`}
            className="mt-3 min-h-24 w-full rounded-[1.35rem] border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-stone-100 outline-none placeholder:text-stone-500 focus:border-white/20"
            defaultValue={voiceProfile.description ?? ""}
            rows={3}
          />
        </div>
        <div>
          <label
            className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-stone-400"
            htmlFor={`voice-detail-instructions-${voiceProfile.id}`}
          >
            Writing instructions
          </label>
          <textarea
            id={`voice-detail-instructions-${voiceProfile.id}`}
            className="mt-3 min-h-40 w-full rounded-[1.35rem] border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-stone-100 outline-none placeholder:text-stone-500 focus:border-white/20"
            defaultValue={voiceProfile.instructions}
            rows={6}
          />
        </div>
        <div className="flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-lg text-sm leading-6 text-stone-300">
            Edit the saved profile fields here, then attach source material from the import options
            below.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-stone-100 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950"
              type="button"
            >
              Reset edits
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-200/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200/40 hover:bg-emerald-200/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950"
              type="button"
            >
              Save edits
            </button>
          </div>
        </div>
      </form>
      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-stone-400">
              Import options
            </p>
            <p className="mt-2 text-sm leading-6 text-stone-300">
              Expand this voice with examples by opening the manual import workflow now, or use the
              LinkedIn path once that gated connection is available.
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-300">
            1 ready, 1 gated
          </span>
        </div>
        <div aria-label="Voice import options" className="mt-4 grid gap-3">
          {VOICE_IMPORT_OPTIONS.map((option) => (
            <article
              key={option.title}
              className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-lg">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-amber-200/75">
                    {option.eyebrow}
                  </p>
                  <h5 className="mt-2 text-sm font-semibold text-white">{option.title}</h5>
                  <p className="mt-2 text-sm leading-6 text-stone-300">{option.description}</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-300">
                  {option.status}
                </span>
              </div>
              {option.eyebrow === "Manual" ? (
                <form
                  action="/workspace"
                  aria-label="Manual voice import action"
                  className="mt-4"
                  method="get"
                >
                  <input name={VOICE_ID_SEARCH_PARAM} type="hidden" value={voiceProfile.id} />
                  <input
                    name={VOICE_IMPORT_SEARCH_PARAM}
                    type="hidden"
                    value={MANUAL_VOICE_IMPORT_MODE}
                  />
                  <button
                    className="inline-flex items-center justify-center rounded-full border border-amber-300/25 bg-amber-200/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-200/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950"
                    type="submit"
                  >
                    {option.buttonLabel}
                  </button>
                </form>
              ) : (
                <button
                  className="mt-4 inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-stone-400"
                  disabled
                  type="button"
                >
                  {option.buttonLabel}
                </button>
              )}
            </article>
          ))}
        </div>
        {isManualImportOpen ? (
          <section
            aria-label="Manual voice import"
            className="mt-4 rounded-[1.35rem] border border-amber-300/20 bg-amber-200/[0.07] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-xl">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-amber-100/80">
                  Manual import
                </p>
                <h5 className="mt-2 text-sm font-semibold text-white">
                  Bring source material into {voiceProfile.name}
                </h5>
                <p className="mt-2 text-sm leading-6 text-stone-200">
                  Choose the manual source you want to use. Pasted text, plain text uploads, and
                  CSV uploads all begin from this saved-voice workflow.
                </p>
              </div>
              <span className="rounded-full border border-amber-200/20 bg-black/20 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-amber-100">
                3 sources staged
              </span>
            </div>
            <div aria-label="Manual import sources" className="mt-4 grid gap-3 sm:grid-cols-3">
              {MANUAL_IMPORT_SOURCE_OPTIONS.map((option) => (
                <article
                  key={option.title}
                  className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-amber-100/80">
                        {option.eyebrow}
                      </p>
                      <h6 className="mt-2 text-sm font-semibold text-white">{option.title}</h6>
                      <p className="mt-2 text-sm leading-6 text-stone-300">{option.description}</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-300">
                      {option.status}
                    </span>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-lg text-sm leading-6 text-stone-200">
                Manual imports stay attached to this voice detail workflow so source material is
                always scoped to the saved profile you are editing.
              </p>
              <form
                action="/workspace"
                aria-label="Close manual voice import"
                method="get"
              >
                <input name={VOICE_ID_SEARCH_PARAM} type="hidden" value={voiceProfile.id} />
                <button
                  className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-stone-100 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950"
                  type="submit"
                >
                  Back to voice detail
                </button>
              </form>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
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

const INITIAL_COMPOSER_DRAFT =
  "Write a concise customer-facing launch update that opens with the pilot result, explains what changed, and ends with a clear next step.";
const WORKSPACE_COMPOSITION_NOTES = [
  "Audience stays visible beside the conversation so composition choices remain grounded.",
  "Proof points can be staged here before the dedicated draft panel appears.",
  "Calls to action remain explicit so each reply can move cleanly into drafting.",
] as const;

const WORKSPACE_COMPOSER_TAGS = ["Audience: customers", "Tone: confident", "CTA: request demo"] as const;
const ACTIVE_WORKSPACE_THREAD_ID = WORKSPACE_THREAD_HISTORY[0]?.id ?? "thread-launch-announcement";
const NARROW_SCREEN_WORKSPACE_NOTES = [
  "The active thread stays first so replies can be shaped without scrolling through account chrome.",
  "History and profile context drop below the composer once the core workflow is already in view.",
  "Account settings compress into a lighter control card until wider breakpoints restore the full panel.",
] as const;
const VOICE_CREATION_GUIDANCE = [
  "Capture the recurring tone, pacing, and structural habits you want Stanlol to reuse.",
  "Keep instructions concrete so later validation and saving can preserve a reliable writing profile.",
  "Imported examples stay optional and can be attached after the core voice profile exists.",
] as const;
const VOICE_CREATION_TRAITS = [
  "Concise openings",
  "Proof-led structure",
  "Operator language",
  "Clear CTA endings",
] as const;

function readSearchParamValue(value: WorkspaceSearchParamValue): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return null;
}

async function resolveWorkspaceSearchParams(
  value: Promise<WorkspaceSearchParams> | WorkspaceSearchParams | undefined,
): Promise<WorkspaceSearchParams> {
  if (!value) {
    return {};
  }

  return "then" in value ? await value : value;
}

function getWorkspaceConversationMessages(searchParams: WorkspaceSearchParams) {
  const submittedThreadId = readSearchParamValue(searchParams.threadId);
  const submittedMessage = readSearchParamValue(searchParams.message);

  if (submittedThreadId !== ACTIVE_WORKSPACE_THREAD_ID || submittedMessage === null) {
    return WORKSPACE_CONVERSATION_MESSAGES;
  }

  return [
    ...WORKSPACE_CONVERSATION_MESSAGES,
    {
      id: "user-submission",
      accentClassName: "border-sky-300/20 bg-sky-200/10 text-sky-100",
      body: submittedMessage,
      detail: "New user message",
      speaker: "You",
    },
  ] as const;
}

interface WorkspacePageProps {
  searchParams?: Promise<WorkspaceSearchParams> | WorkspaceSearchParams;
}

export default async function WorkspacePage({ searchParams }: WorkspacePageProps = {}) {
  const { sidebarIdentity, voiceProfiles } = await loadWorkspaceContext();
  const resolvedSearchParams = await resolveWorkspaceSearchParams(searchParams);
  const conversationMessages = getWorkspaceConversationMessages(resolvedSearchParams);
  const composerDraft =
    readSearchParamValue(resolvedSearchParams.message) === null ? INITIAL_COMPOSER_DRAFT : "";
  const featuredVoiceProfile = getSelectedVoiceProfile(voiceProfiles, resolvedSearchParams);
  const isManualImportOpen =
    readSearchParamValue(resolvedSearchParams[VOICE_IMPORT_SEARCH_PARAM]) ===
      MANUAL_VOICE_IMPORT_MODE &&
    featuredVoiceProfile !== null &&
    readSearchParamValue(resolvedSearchParams[VOICE_ID_SEARCH_PARAM]) === featuredVoiceProfile.id;

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
            <div className="flex min-h-[28rem] flex-col rounded-[2rem] border border-white/10 bg-white/8 p-4 shadow-2xl shadow-black/40 backdrop-blur sm:p-5 lg:h-full">
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
              <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
                <section
                  aria-label="Narrow-screen workflow notes"
                  className="rounded-[1.75rem] border border-white/10 bg-black/20 p-4 shadow-lg shadow-black/20 lg:hidden"
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
                <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
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
                      {conversationMessages.length} turns
                    </span>
                  </div>
                  <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                    {conversationMessages.map((message) => (
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
                aria-label="Prompt composer"
                className="mt-auto rounded-[1.75rem] border border-sky-300/20 bg-sky-400/[0.08] p-4 shadow-lg shadow-black/20"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-sky-100/75">
                      Compose
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">Message composer</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
                      The primary action stays pinned to the bottom of the center panel so the next
                      reply is always in reach.
                    </p>
                  </div>
                  <span className="rounded-full border border-sky-200/30 bg-sky-200/15 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-sky-50">
                    Primary action
                  </span>
                </div>
                <form action="/workspace" aria-label="Message composer form" className="mt-4" method="get">
                  <input name="threadId" type="hidden" value={ACTIVE_WORKSPACE_THREAD_ID} />
                  <div>
                    <label
                      className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-stone-400"
                      htmlFor="workspace-message-composer"
                    >
                      Message draft
                    </label>
                    <textarea
                      id="workspace-message-composer"
                      className="mt-3 min-h-32 w-full rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-7 text-stone-100 outline-none placeholder:text-stone-500 focus:border-white/20"
                      defaultValue={composerDraft}
                      name="message"
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
                      Conversation context stays visible above while the draft panel stays out of
                      view.
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
                        type="submit"
                      >
                        Shape response
                      </button>
                    </div>
                  </div>
                </form>
              </section>
              </div>
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
              <section
                aria-label="Voice creation form"
                className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/30 backdrop-blur"
              >
                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-xl">
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-violet-100/75">
                        Voices
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-white">
                        Create a reusable voice
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-stone-300">
                        Shape a saved writing profile with a name, a short description, and clear
                        guidance for how drafts should sound when this voice is selected.
                      </p>
                    </div>
                    <span className="rounded-full border border-violet-300/20 bg-violet-200/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-violet-100">
                      Reusable profile
                    </span>
                  </div>
                  <form aria-label="Voice profile fields" className="mt-5 space-y-4">
                    <div>
                      <label
                        className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-stone-400"
                        htmlFor="voice-name"
                      >
                        Voice name
                      </label>
                      <input
                        id="voice-name"
                        className="mt-3 h-12 w-full rounded-[1.1rem] border border-white/10 bg-white/[0.04] px-4 text-sm text-stone-100 outline-none placeholder:text-stone-500 focus:border-white/20"
                        defaultValue="Customer-ready operator"
                        placeholder="Customer-ready operator"
                        type="text"
                      />
                    </div>
                    <div>
                      <label
                        className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-stone-400"
                        htmlFor="voice-description"
                      >
                        Short description
                      </label>
                      <textarea
                        id="voice-description"
                        className="mt-3 min-h-24 w-full rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-7 text-stone-100 outline-none placeholder:text-stone-500 focus:border-white/20"
                        defaultValue="For launch updates and product notes that sound calm, informed, and operationally sharp."
                        rows={3}
                      />
                    </div>
                    <div>
                      <label
                        className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-stone-400"
                        htmlFor="voice-instructions"
                      >
                        Writing instructions
                      </label>
                      <textarea
                        id="voice-instructions"
                        className="mt-3 min-h-40 w-full rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-7 text-stone-100 outline-none placeholder:text-stone-500 focus:border-white/20"
                        defaultValue="Write with a confident operator tone. Open with the strongest proof point, keep paragraphs tight, avoid hype, and close with one explicit next step."
                        rows={6}
                      />
                    </div>
                    <div className="grid gap-3">
                      <div className="rounded-[1.35rem] border border-dashed border-white/10 bg-white/[0.03] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="max-w-lg">
                            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-stone-400">
                              Imported samples
                            </p>
                            <p className="mt-2 text-sm font-medium text-white">
                              No samples attached yet
                            </p>
                            <p className="mt-2 text-sm leading-6 text-stone-300">
                              Paste writing examples or bring in LinkedIn material after the base
                              voice profile is named and saved.
                            </p>
                          </div>
                          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-stone-300">
                            0 samples
                          </span>
                        </div>
                      </div>
                      <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-stone-400">
                          Voice guidance
                        </p>
                        <ul className="mt-3 space-y-3">
                          {VOICE_CREATION_GUIDANCE.map((note) => (
                            <li
                              key={note}
                              className="rounded-[1.1rem] border border-white/10 bg-black/20 p-3 text-sm leading-6 text-stone-200"
                            >
                              {note}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {VOICE_CREATION_TRAITS.map((trait) => (
                            <span
                              key={trait}
                              className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-stone-200"
                            >
                              {trait}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="max-w-lg text-sm leading-6 text-stone-300">
                        Save the core voice first, then attach imported examples and selection
                        controls in the follow-up workflow.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <button
                          className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-stone-100 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950"
                          type="button"
                        >
                          Clear form
                        </button>
                        <button
                          className="inline-flex items-center justify-center rounded-full border border-violet-300/20 bg-violet-200/10 px-4 py-2 text-sm font-semibold text-violet-100 transition hover:border-violet-200/40 hover:bg-violet-200/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950"
                          type="button"
                        >
                          Save voice
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </section>
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
                    <div className="mt-5 border-t border-white/10 pt-4">
                      <SavedVoiceList showHeader voiceProfiles={voiceProfiles} />
                      <div className="mt-4">
                        <SavedVoiceDetail
                          isManualImportOpen={isManualImportOpen}
                          voiceProfile={featuredVoiceProfile}
                        />
                      </div>
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
                  </AccountSettingsSection>
                  <AccountSettingsSection
                    description="Saved voice profiles stay visible in settings so reusable tones and structures remain easy to review."
                    eyebrow="Voices"
                    title="Saved voices"
                  >
                    <SavedVoiceList voiceProfiles={voiceProfiles} />
                    <SavedVoiceDetail
                      isManualImportOpen={isManualImportOpen}
                      voiceProfile={featuredVoiceProfile}
                    />
                  </AccountSettingsSection>
                  <AccountSettingsSection
                    description="Session controls stay separate so account exit remains obvious even as more settings land in this panel."
                    eyebrow="Workspace"
                    title="Session"
                  >
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
