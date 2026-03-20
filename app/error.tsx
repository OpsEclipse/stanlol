"use client";

type AppErrorProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export const ERROR_BOUNDARY_COPY = {
  eyebrow: "Unexpected application error",
  title: "Something went wrong.",
  description:
    "An unexpected UI failure interrupted this screen. Try again, and if it keeps happening, return home and retry your last action.",
  retry: "Try again",
  home: "Go home",
  digestLabel: "Error reference",
} as const;

function getErrorDigest(error: AppErrorProps["error"]): string | null {
  if (typeof error.digest !== "string") {
    return null;
  }

  const trimmedDigest = error.digest.trim();

  return trimmedDigest.length > 0 ? trimmedDigest : null;
}

export default function Error({ error, reset }: AppErrorProps) {
  const digest = getErrorDigest(error);

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-zinc-950 px-6 py-16 text-zinc-50">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/30 backdrop-blur md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-400">
          {ERROR_BOUNDARY_COPY.eyebrow}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">
          {ERROR_BOUNDARY_COPY.title}
        </h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-zinc-300">
          {ERROR_BOUNDARY_COPY.description}
        </p>
        {digest ? (
          <p className="mt-4 text-sm text-zinc-400">
            {ERROR_BOUNDARY_COPY.digestLabel}:{" "}
            <span className="font-mono text-zinc-200">{digest}</span>
          </p>
        ) : null}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {ERROR_BOUNDARY_COPY.retry}
          </button>
          {/* A plain anchor keeps the recovery path available even if client navigation is unstable. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:border-white/30 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {ERROR_BOUNDARY_COPY.home}
          </a>
        </div>
      </div>
    </div>
  );
}
