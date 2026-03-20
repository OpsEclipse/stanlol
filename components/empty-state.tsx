import type { ReactNode } from "react";

export type EmptyStateVariant = "threads" | "voices" | "drafts" | "imports";

export type EmptyStateCopy = {
  actionLabel: string;
  description: string;
  eyebrow: string;
  title: string;
};

export const EMPTY_STATE_COPY = {
  threads: {
    eyebrow: "Threads",
    title: "No conversations yet",
    description:
      "Start a thread to capture your context and create the first draft when you are ready.",
    actionLabel: "Start a thread",
  },
  voices: {
    eyebrow: "Voices",
    title: "No voice profiles yet",
    description:
      "Create a reusable voice profile to keep your tone, structure, and phrasing consistent across drafts.",
    actionLabel: "Create a voice",
  },
  drafts: {
    eyebrow: "Drafts",
    title: "No active draft yet",
    description:
      "Once the conversation has enough signal, the assistant will generate a draft here for review and refinement.",
    actionLabel: "Generate a draft",
  },
  imports: {
    eyebrow: "Imports",
    title: "Nothing imported yet",
    description:
      "Import source material to enrich a voice with real examples, background context, and writing patterns.",
    actionLabel: "Import content",
  },
} as const satisfies Record<EmptyStateVariant, EmptyStateCopy>;

export type EmptyStateProps = {
  actionLabel?: string;
  children?: ReactNode;
  className?: string;
  description: string;
  eyebrow: string;
  onAction?: () => void;
  title: string;
};

export type EmptyStatePresetProps = Pick<
  EmptyStateProps,
  "actionLabel" | "children" | "className" | "onAction"
>;

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function renderPresetEmptyState(
  copy: EmptyStateCopy,
  { actionLabel, children, className, onAction }: EmptyStatePresetProps,
) {
  return (
    <EmptyState
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      actionLabel={onAction ? actionLabel ?? copy.actionLabel : actionLabel}
      onAction={onAction}
      className={className}
    >
      {children}
    </EmptyState>
  );
}

export function EmptyState({
  actionLabel,
  children,
  className,
  description,
  eyebrow,
  onAction,
  title,
}: EmptyStateProps) {
  const shouldRenderAction =
    typeof onAction === "function" &&
    typeof actionLabel === "string" &&
    actionLabel.trim().length > 0;

  return (
    <section
      aria-live="polite"
      className={joinClassNames(
        "flex w-full items-center justify-center rounded-[1.75rem] border border-dashed border-zinc-200 bg-zinc-50/80 px-6 py-12 text-center shadow-sm shadow-zinc-950/5",
        className,
      )}
    >
      <div className="mx-auto flex max-w-md flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-zinc-200 bg-white text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-zinc-500 shadow-sm">
          {eyebrow}
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.32em] text-zinc-500">
          {eyebrow}
        </p>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950">
          {title}
        </h2>
        <p className="mt-4 text-base leading-7 text-zinc-600">{description}</p>
        {children ? <div className="mt-6">{children}</div> : null}
        {shouldRenderAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-8 inline-flex items-center justify-center rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function ThreadEmptyState(props: EmptyStatePresetProps) {
  return renderPresetEmptyState(EMPTY_STATE_COPY.threads, props);
}

export function VoiceEmptyState(props: EmptyStatePresetProps) {
  return renderPresetEmptyState(EMPTY_STATE_COPY.voices, props);
}

export function DraftEmptyState(props: EmptyStatePresetProps) {
  return renderPresetEmptyState(EMPTY_STATE_COPY.drafts, props);
}

export function ImportEmptyState(props: EmptyStatePresetProps) {
  return renderPresetEmptyState(EMPTY_STATE_COPY.imports, props);
}
