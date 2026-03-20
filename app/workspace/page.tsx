export default function WorkspacePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-stone-950 px-6 py-12 text-stone-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.22),_transparent_36%),linear-gradient(145deg,_#0c0a09_0%,_#1c1917_48%,_#292524_100%)]" />
      <section className="relative w-full max-w-3xl rounded-[2rem] border border-white/10 bg-white/8 p-8 shadow-2xl shadow-black/40 backdrop-blur">
        <span className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-200/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.26em] text-emerald-100">
          Workspace ready
        </span>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Auth completed. Stanlol can hand off to the workspace.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-stone-300 md:text-lg">
          The authenticated landing route is now available at <code>/workspace</code> so OAuth
          and magic link completion can move users into the product shell without a dead-end
          redirect.
        </p>
      </section>
    </main>
  );
}
