"use client";

type ToastFeedbackPreset = {
  description: string;
  title: string;
  tone: ToastTone;
};

export type ToastTone = "success" | "error" | "info";
export type ToastOutcome = "success" | "error";

export const TOAST_FEEDBACK_COPY = {
  copy: {
    success: {
      title: "Copied to clipboard",
      description: "Your latest draft text is ready to paste anywhere.",
      tone: "success",
    },
    error: {
      title: "Copy failed",
      description: "The draft could not be copied right now. Try again in a moment.",
      tone: "error",
    },
  },
  save: {
    success: {
      title: "Changes saved",
      description: "Your latest edits are stored and ready for the next revision.",
      tone: "success",
    },
    error: {
      title: "Save failed",
      description: "Your latest edits could not be saved. Retry once the connection settles.",
      tone: "error",
    },
  },
  upload: {
    success: {
      title: "Upload complete",
      description: "Your file is attached and ready to use in the current draft flow.",
      tone: "success",
    },
    error: {
      title: "Upload failed",
      description: "The file could not be uploaded. Check the file and try again.",
      tone: "error",
    },
  },
  import: {
    success: {
      title: "Import complete",
      description: "The imported content is ready to use in your voice setup.",
      tone: "success",
    },
    error: {
      title: "Import failed",
      description: "The import could not be completed. Review the source content and retry.",
      tone: "error",
    },
  },
} as const satisfies Record<string, Record<ToastOutcome, ToastFeedbackPreset>>;

export type ToastAction = keyof typeof TOAST_FEEDBACK_COPY;

export type ToastMessage = {
  description: string;
  title: string;
  tone: ToastTone;
};

export type ToastProps = ToastMessage & {
  dismissLabel?: string;
  isVisible?: boolean;
  onDismiss?: () => void;
};

export type ToastItem = ToastProps & {
  id: string;
};

export type ToastRegionProps = {
  label?: string;
  toasts: readonly ToastItem[];
};

const TONE_STYLES: Record<ToastTone, string> = {
  success: "border-emerald-200/80 bg-emerald-50 text-emerald-950 shadow-emerald-200/70",
  error: "border-rose-200/80 bg-rose-50 text-rose-950 shadow-rose-200/70",
  info: "border-sky-200/80 bg-white text-slate-950 shadow-slate-200/70",
};

const TONE_BADGES: Record<ToastTone, string> = {
  success: "Success",
  error: "Error",
  info: "Info",
};

function getAnnouncementMode(tone: ToastTone): {
  live: "assertive" | "polite";
  role: "alert" | "status";
} {
  if (tone === "error") {
    return {
      role: "alert",
      live: "assertive",
    };
  }

  return {
    role: "status",
    live: "polite",
  };
}

function appendDetail(baseDescription: string, detail?: string): string {
  if (typeof detail !== "string") {
    return baseDescription;
  }

  const trimmedDetail = detail.trim();

  return trimmedDetail.length > 0 ? `${baseDescription} ${trimmedDetail}` : baseDescription;
}

export function getToastFeedback(
  action: ToastAction,
  outcome: ToastOutcome,
  detail?: string,
): ToastMessage {
  const preset = TOAST_FEEDBACK_COPY[action][outcome];

  return {
    title: preset.title,
    tone: preset.tone,
    description: appendDetail(preset.description, detail),
  };
}

export function ToastRegion({ label = "Notifications", toasts }: ToastRegionProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-atomic="true"
      aria-label={label}
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-3 px-4 sm:items-end"
    >
      {toasts.map(({ id, ...toast }) => (
        <div key={id} className="w-full max-w-sm">
          <Toast {...toast} />
        </div>
      ))}
    </div>
  );
}

export default function Toast({
  title,
  description,
  tone = "info",
  isVisible = true,
  onDismiss,
  dismissLabel = "Dismiss notification",
}: ToastProps) {
  if (!isVisible) {
    return null;
  }

  const announcementMode = getAnnouncementMode(tone);

  return (
    <div
      aria-atomic="true"
      aria-live={announcementMode.live}
      className={`pointer-events-auto w-full rounded-3xl border px-4 py-4 shadow-lg backdrop-blur ${TONE_STYLES[tone]}`}
      role={announcementMode.role}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] opacity-70">
            {TONE_BADGES[tone]}
          </p>
          <p className="mt-1 text-sm font-semibold tracking-tight">{title}</p>
          <p className="mt-2 text-sm leading-6 opacity-80">{description}</p>
        </div>
        {onDismiss ? (
          <button
            aria-label={dismissLabel}
            className="rounded-full border border-current/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            onClick={onDismiss}
            type="button"
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}
