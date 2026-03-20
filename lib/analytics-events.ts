export type AnalyticsEventCategory =
  | "auth"
  | "workspace"
  | "chat"
  | "draft"
  | "voice"
  | "import"
  | "upload";

export interface AnalyticsEventDefinition {
  readonly name: string;
  readonly category: AnalyticsEventCategory;
  readonly description: string;
}

export const analyticsEventTaxonomy = [
  {
    name: "auth.sign_in_started",
    category: "auth",
    description: "User begins a sign-in flow.",
  },
  {
    name: "auth.sign_in_completed",
    category: "auth",
    description: "User completes sign-in and gains workspace access.",
  },
  {
    name: "auth.signed_out",
    category: "auth",
    description: "User signs out of the product.",
  },
  {
    name: "workspace.opened",
    category: "workspace",
    description: "Authenticated workspace becomes available to the user.",
  },
  {
    name: "chat.thread_created",
    category: "chat",
    description: "User starts a new chat thread.",
  },
  {
    name: "chat.message_submitted",
    category: "chat",
    description: "User submits a prompt or follow-up message.",
  },
  {
    name: "chat.response_completed",
    category: "chat",
    description: "Assistant finishes responding in the active thread.",
  },
  {
    name: "draft.generated",
    category: "draft",
    description: "System produces the first draft for the current thread.",
  },
  {
    name: "draft.refined",
    category: "draft",
    description: "System produces a refinement of an existing draft.",
  },
  {
    name: "draft.copied",
    category: "draft",
    description: "User copies the current draft for external use.",
  },
  {
    name: "draft.time_to_first_draft_recorded",
    category: "draft",
    description: "System records elapsed time from first message to first draft.",
  },
  {
    name: "voice.created",
    category: "voice",
    description: "User creates a reusable writing voice.",
  },
  {
    name: "voice.updated",
    category: "voice",
    description: "User edits an existing writing voice.",
  },
  {
    name: "voice.selected",
    category: "voice",
    description: "User selects the active voice for a drafting session.",
  },
  {
    name: "import.started",
    category: "import",
    description: "User begins a voice-enrichment import flow.",
  },
  {
    name: "import.completed",
    category: "import",
    description: "Voice enrichment import finishes successfully.",
  },
  {
    name: "upload.completed",
    category: "upload",
    description: "User upload is stored and ready for downstream use.",
  },
] as const satisfies readonly AnalyticsEventDefinition[];

export type AnalyticsEventName = (typeof analyticsEventTaxonomy)[number]["name"];

export const analyticsEventNames = analyticsEventTaxonomy.map(
  (event) => event.name,
) as AnalyticsEventName[];

const analyticsEventNameSet = new Set<string>(analyticsEventNames);

export function isAnalyticsEventName(value: string): value is AnalyticsEventName {
  return analyticsEventNameSet.has(value);
}

export function getAnalyticsEventDefinition(
  name: AnalyticsEventName,
): (typeof analyticsEventTaxonomy)[number] {
  const analyticsEvent = analyticsEventTaxonomy.find((event) => event.name === name);

  if (!analyticsEvent) {
    throw new Error(`Unknown analytics event: ${name}`);
  }

  return analyticsEvent;
}
