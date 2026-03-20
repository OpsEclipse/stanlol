import type { ReactNode } from "react";

export const LOADING_STATE_COPY = {
  auth: {
    eyebrow: "Authenticating",
    title: "Opening your workspace",
    description: "Checking your session and loading the account details tied to this workspace.",
  },
  chat: {
    eyebrow: "Loading chat",
    title: "Restoring your conversation",
    description: "Bringing back messages, draft context, and the thread state for this workspace.",
  },
  drafts: {
    eyebrow: "Loading drafts",
    title: "Preparing saved drafts",
    description: "Fetching generated drafts and their revision history so you can keep editing.",
  },
  uploads: {
    eyebrow: "Loading uploads",
    title: "Preparing your attachments",
    description: "Collecting uploaded assets and warming up previews before they appear in the composer.",
  },
  settings: {
    eyebrow: "Loading settings",
    title: "Fetching workspace settings",
    description: "Loading your account preferences and workspace controls before the panel appears.",
  },
} as const;

export type LoadingStateKind = keyof typeof LOADING_STATE_COPY;

type LoadingStateProps = {
  kind: LoadingStateKind;
  className?: string;
  title?: string;
  description?: string;
  children?: ReactNode;
};

type VariantProps = Omit<LoadingStateProps, "kind">;

const PRIMARY_LINE_WIDTHS = ["w-11/12", "w-full", "w-10/12"] as const;
const SECONDARY_LINE_WIDTHS = ["w-full", "w-5/6", "w-2/3"] as const;

function joinClasses(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function LoadingSkeletonBlock({
  lineWidths,
  slot,
}: {
  lineWidths: readonly string[];
  slot: "primary" | "secondary";
}) {
  return (
    <div
      aria-hidden="true"
      className="space-y-3 rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm shadow-slate-950/5"
      data-loading-panel={slot}
    >
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 animate-pulse rounded-2xl bg-slate-200"
          data-loading-skeleton="avatar"
        />
        <div className="space-y-2">
          <div
            className="h-3 w-20 animate-pulse rounded-full bg-slate-200"
            data-loading-skeleton="line"
          />
          <div
            className="h-3 w-28 animate-pulse rounded-full bg-slate-100"
            data-loading-skeleton="line"
          />
        </div>
      </div>
      <div className="space-y-2">
        {lineWidths.map((lineWidth) => (
          <div
            key={`${slot}-${lineWidth}`}
            className={joinClasses("h-3 animate-pulse rounded-full bg-slate-200", lineWidth)}
            data-loading-skeleton="line"
          />
        ))}
      </div>
    </div>
  );
}

export function LoadingState({
  kind,
  className,
  title,
  description,
  children,
}: LoadingStateProps) {
  const content = LOADING_STATE_COPY[kind];

  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className={joinClasses("w-full", className)}
      data-loading-kind={kind}
      role="status"
    >
      <div className="rounded-3xl border border-slate-200/80 bg-slate-50/80 p-6 shadow-sm shadow-slate-950/5 sm:p-8">
        <div className="space-y-4">
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            {content.eyebrow}
          </span>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              {title ?? content.title}
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              {description ?? content.description}
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(16rem,1fr)]">
          <LoadingSkeletonBlock lineWidths={PRIMARY_LINE_WIDTHS} slot="primary" />
          <LoadingSkeletonBlock lineWidths={SECONDARY_LINE_WIDTHS} slot="secondary" />
        </div>
        {children ? <div className="mt-6">{children}</div> : null}
      </div>
    </section>
  );
}

export function AuthLoadingState(props: VariantProps) {
  return <LoadingState kind="auth" {...props} />;
}

export function ChatLoadingState(props: VariantProps) {
  return <LoadingState kind="chat" {...props} />;
}

export function DraftsLoadingState(props: VariantProps) {
  return <LoadingState kind="drafts" {...props} />;
}

export function UploadsLoadingState(props: VariantProps) {
  return <LoadingState kind="uploads" {...props} />;
}

export function SettingsLoadingState(props: VariantProps) {
  return <LoadingState kind="settings" {...props} />;
}
