import { formatTimestamp, type TimestampInput } from "../lib/format-timestamp.js";

export interface ThreadHistoryItem {
  id: string;
  isActive?: boolean;
  title: string | null;
  updatedAt: string;
}

export interface ThreadHistoryListProps {
  className?: string;
  emptyLabel?: string;
  now?: TimestampInput;
  threads: ReadonlyArray<ThreadHistoryItem>;
}

const DEFAULT_EMPTY_LABEL = "No recent threads yet.";
const UNTITLED_THREAD_LABEL = "Untitled thread";

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function getThreadTitle(title: string | null): string {
  const normalizedTitle = title?.trim();

  return normalizedTitle ? normalizedTitle : UNTITLED_THREAD_LABEL;
}

export function ThreadHistoryList({
  className,
  emptyLabel = DEFAULT_EMPTY_LABEL,
  now,
  threads,
}: ThreadHistoryListProps) {
  if (threads.length === 0) {
    return (
      <section
        aria-live="polite"
        className={joinClassNames(
          "rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-5 text-sm text-stone-300 shadow-lg shadow-black/10 backdrop-blur-sm",
          className,
        )}
      >
        {emptyLabel}
      </section>
    );
  }

  return (
    <section
      aria-label="Thread history"
      className={joinClassNames(
        "rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-3 shadow-lg shadow-black/10 backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between px-2 pb-3">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-stone-400">
            History
          </p>
          <h2 className="mt-2 text-base font-semibold text-white">Recent activity</h2>
        </div>
        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.24em] text-stone-300">
          {threads.length} threads
        </span>
      </div>
      <ul className="space-y-2">
        {threads.map((thread) => {
          const title = getThreadTitle(thread.title);
          const relativeTimestamp = formatTimestamp(thread.updatedAt, {
            format: "relative",
            now,
          });
          const absoluteTimestamp = formatTimestamp(thread.updatedAt, { format: "dateTime" });
          const timestampLabel = relativeTimestamp || absoluteTimestamp;

          return (
            <li key={thread.id}>
              <button
                type="button"
                data-active={thread.isActive ? "true" : undefined}
                className={joinClassNames(
                  "flex w-full items-start justify-between gap-4 rounded-[1.2rem] border px-4 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-200",
                  thread.isActive
                    ? "border-white/15 bg-white/[0.06] shadow-inner shadow-white/5"
                    : "border-white/5 bg-black/20 hover:border-white/10 hover:bg-white/[0.04]",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-white">{title}</span>
                  <span className="mt-1 block text-xs text-stone-400">
                    {thread.isActive ? "Open thread" : "Recent conversation"}
                  </span>
                </span>
                <time
                  dateTime={thread.updatedAt}
                  title={absoluteTimestamp}
                  className="shrink-0 text-xs font-medium text-stone-300"
                >
                  {timestampLabel}
                </time>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
