import type { ReactNode } from "react";

export interface AccountSettingsPanelProps {
  children?: ReactNode;
  className?: string;
  description?: string;
  title?: string;
}

export interface AccountSettingsSectionProps {
  children?: ReactNode;
  className?: string;
  description: string;
  eyebrow: string;
  title: string;
}

export interface SettingsPanelItemProps {
  className?: string;
  description?: string;
  label: string;
  status?: string;
  value: string;
}

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function AccountSettingsPanel({
  children,
  className,
  description = "A lightweight surface for account details and workspace-level controls.",
  title = "Account settings",
}: AccountSettingsPanelProps) {
  return (
    <section
      aria-label={title}
      className={joinClassNames(
        "rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20 backdrop-blur sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.34em] text-sky-100/80">
            Settings
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-stone-300">{description}</p>
        </div>
        <span className="rounded-full border border-sky-300/20 bg-sky-200/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-sky-100">
          Lightweight
        </span>
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">{children}</div>
    </section>
  );
}

export function AccountSettingsSection({
  children,
  className,
  description,
  eyebrow,
  title,
}: AccountSettingsSectionProps) {
  return (
    <article
      className={joinClassNames(
        "rounded-[1.5rem] border border-white/10 bg-black/20 p-4 shadow-lg shadow-black/20",
        className,
      )}
    >
      <div>
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-amber-200/75">
          {eyebrow}
        </p>
        <h3 className="mt-2 text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-stone-300">{description}</p>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </article>
  );
}

export function SettingsPanelItem({
  className,
  description,
  label,
  status,
  value,
}: SettingsPanelItemProps) {
  return (
    <div
      className={joinClassNames(
        "rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">
            {label}
          </p>
          <p className="mt-2 text-sm font-medium text-white">{value}</p>
        </div>
        {status ? (
          <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-200/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-emerald-100">
            {status}
          </span>
        ) : null}
      </div>
      {description ? <p className="mt-2 text-sm leading-6 text-stone-300">{description}</p> : null}
    </div>
  );
}
