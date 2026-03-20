import {
  ThreadHistoryList,
  type ThreadHistoryItem,
} from "../../components/thread-history-list.js";

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

export default function WorkspacePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-stone-950 px-4 py-4 text-stone-100 md:px-6 md:py-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.22),_transparent_36%),linear-gradient(145deg,_#0c0a09_0%,_#1c1917_48%,_#292524_100%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-7xl flex-col gap-6 lg:flex-row">
        <aside className="w-full lg:max-w-sm xl:max-w-md">
          <div className="rounded-[2rem] border border-white/10 bg-white/8 p-4 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="px-2 pb-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.34em] text-emerald-100/80">
                Workspace
              </p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                Conversation history
              </h1>
              <p className="mt-3 text-sm leading-6 text-stone-300">
                Recent thread activity now shows directly in the sidebar so returning to the right
                conversation takes less scanning.
              </p>
            </div>
            <ThreadHistoryList threads={WORKSPACE_THREAD_HISTORY} />
          </div>
        </aside>
        <section className="flex min-h-[28rem] flex-1 items-center justify-center rounded-[2rem] border border-white/10 bg-white/8 p-8 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-200/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.26em] text-emerald-100">
              Workspace ready
            </span>
            <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-5xl">
              Auth completed. Stanlol can hand off to the workspace.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-stone-300 md:text-lg">
              The authenticated landing route is now available at <code>/workspace</code> so OAuth
              and magic link completion can move users into the product shell without a dead-end
              redirect.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
