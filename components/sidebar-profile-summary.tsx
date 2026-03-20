export interface SidebarProfileSummaryProps {
  className?: string;
  displayName?: string | null;
  email?: string | null;
}

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function normalizeText(value: string | null | undefined): string | null {
  const normalizedValue = value?.trim();

  return normalizedValue ? normalizedValue : null;
}

function getPrimaryLabel(displayName: string | null, email: string | null): string {
  return displayName ?? email ?? "Current account";
}

function getSecondaryLabel(displayName: string | null, email: string | null): string {
  if (displayName && email) {
    return email;
  }

  return "Authenticated workspace profile";
}

function getMonogram(displayName: string | null, email: string | null): string {
  const source = displayName ?? email ?? "Account";
  const segments = source
    .split(/[\s@._-]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return "AC";
  }

  if (segments.length === 1) {
    return segments[0].slice(0, 2).toUpperCase();
  }

  return `${segments[0][0] ?? ""}${segments[1][0] ?? ""}`.toUpperCase();
}

export function SidebarProfileSummary({
  className,
  displayName = null,
  email = null,
}: SidebarProfileSummaryProps) {
  const normalizedDisplayName = normalizeText(displayName);
  const normalizedEmail = normalizeText(email);
  const primaryLabel = getPrimaryLabel(normalizedDisplayName, normalizedEmail);
  const secondaryLabel = getSecondaryLabel(normalizedDisplayName, normalizedEmail);

  return (
    <section
      aria-label="Current account"
      className={joinClassNames(
        "rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/10 backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] border border-white/10 bg-black/20 text-sm font-semibold uppercase tracking-[0.16em] text-stone-100">
          {getMonogram(normalizedDisplayName, normalizedEmail)}
        </div>
        <div className="min-w-0">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-stone-400">
            Account
          </p>
          <p className="mt-2 truncate text-sm font-medium text-white">{primaryLabel}</p>
          <p className="mt-1 truncate text-xs text-stone-500">{secondaryLabel}</p>
        </div>
      </div>
    </section>
  );
}
