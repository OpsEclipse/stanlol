export const GOOGLE_OAUTH_PATH = "/auth/callback?provider=google";
export const MAGIC_LINK_REQUEST_PATH = "/auth/magic-link";

export const GOOGLE_OAUTH_COPY = {
  badge: "Workspace sign-in",
  title: "Sign in to Stanlol and enter the workspace.",
  description:
    "Choose Google OAuth or an email magic link to open the authenticated workspace, recover prior conversations, and keep your writing context attached to one profile.",
  buttonLabel: "Continue with Google",
  privacyNote:
    "Google OAuth and email magic links both return through the protected auth callback before workspace access is granted.",
  supportLabel: "Protected workspace access",
} as const;

export const MAGIC_LINK_COPY = {
  buttonLabel: "Email me a magic link",
  description:
    "Send a one-time sign-in link to your inbox and finish authentication from email without using Google.",
  emailLabel: "Work email",
  statusLabel: "Email link status",
  supportLabel: "Passwordless sign-in",
  title: "Request a secure email link.",
} as const;

export const MAGIC_LINK_STATUS_COPY = {
  failed: {
    description:
      "Stanlol could not send the email sign-in link. Try again in a moment.",
    title: "Magic link request failed.",
  },
  invalid_email: {
    description: "Enter a valid email address before requesting a sign-in link.",
    title: "A valid email address is required.",
  },
  sent: {
    description:
      "If that email can access this workspace, the sign-in link is on its way now.",
    title: "Check your inbox.",
  },
} as const;

type MagicLinkStatusCode = keyof typeof MAGIC_LINK_STATUS_COPY;

export const AUTH_ERROR_COPY = {
  auth_callback_failed: {
    title: "Sign-in could not be completed.",
    description:
      "The authentication handoff failed before workspace access was granted. Start the sign-in flow again.",
  },
  auth_provider_failed: {
    title: "Google sign-in was not completed.",
    description:
      "The provider returned the user to Stanlol without an active session. Start the sign-in flow again.",
  },
  invalid_auth_callback: {
    title: "The sign-in link is no longer valid.",
    description:
      "That authentication response cannot be used to open the workspace. Start a new sign-in attempt.",
  },
  missing_pkce_verifier: {
    title: "Your sign-in session expired.",
    description:
      "The browser no longer has the temporary verification state needed to finish Google sign-in. Start again.",
  },
  unsupported_auth_provider: {
    title: "This sign-in method is not available.",
    description:
      "Stanlol only supports the configured workspace sign-in provider on this screen.",
  },
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_COPY;

function normalizeAuthErrorCode(value: string | string[] | null | undefined): string | null {
  if (Array.isArray(value)) {
    return normalizeAuthErrorCode(value[0]);
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return normalized.length > 0 ? normalized : null;
}

export function getAuthErrorCopy(value: string | string[] | null | undefined) {
  const code = normalizeAuthErrorCode(value);

  if (!code) {
    return null;
  }

  return AUTH_ERROR_COPY[code as AuthErrorCode] ?? AUTH_ERROR_COPY.auth_callback_failed;
}

function normalizeSearchParam(value: string | string[] | null | undefined): string | null {
  if (Array.isArray(value)) {
    return normalizeSearchParam(value[0]);
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

export function getMagicLinkStatusCopy(value: string | string[] | null | undefined) {
  const code = normalizeSearchParam(value)?.toLowerCase();

  if (!code) {
    return null;
  }

  return MAGIC_LINK_STATUS_COPY[code as MagicLinkStatusCode] ?? MAGIC_LINK_STATUS_COPY.failed;
}

function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21.805 12.23c0-.77-.068-1.506-.195-2.214H12v4.19h5.49a4.7 4.7 0 0 1-2.04 3.085v2.565h3.3c1.932-1.78 3.055-4.403 3.055-7.626Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.76 0 5.073-.915 6.764-2.48l-3.3-2.564c-.916.614-2.086.977-3.464.977-2.654 0-4.9-1.79-5.705-4.198H2.885V16.38A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.295 13.735A6.02 6.02 0 0 1 5.977 12c0-.603.109-1.187.318-1.735V7.62H2.885A10 10 0 0 0 2 12c0 1.596.382 3.107 1.06 4.38l3.235-2.645Z"
        fill="#FBBC04"
      />
      <path
        d="M12 6.067c1.5 0 2.846.517 3.905 1.53l2.927-2.926C17.068 3.033 14.759 2 12 2A10 10 0 0 0 3.06 7.62l3.235 2.646C7.1 7.857 9.346 6.067 12 6.067Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export type GoogleOAuthSignInScreenProps = {
  authErrorCode?: string | string[];
  magicLinkEmail?: string | string[];
  magicLinkStatus?: string | string[];
};

export function GoogleOAuthSignInScreen({
  authErrorCode,
  magicLinkEmail,
  magicLinkStatus,
}: GoogleOAuthSignInScreenProps) {
  const authError = getAuthErrorCopy(authErrorCode);
  const magicLinkFeedback = getMagicLinkStatusCopy(magicLinkStatus);
  const normalizedMagicLinkEmail = normalizeSearchParam(magicLinkEmail) ?? "";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-stone-950 px-6 py-12 text-stone-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.2),_transparent_34%),linear-gradient(135deg,_#0c0a09_0%,_#1c1917_48%,_#292524_100%)]" />
      <div className="absolute left-10 top-10 h-32 w-32 rounded-full border border-white/10 bg-white/5 blur-3xl" />
      <div className="absolute bottom-12 right-8 h-40 w-40 rounded-full border border-amber-300/10 bg-amber-200/10 blur-3xl" />

      <section className="relative grid w-full max-w-5xl gap-8 rounded-[2rem] border border-white/10 bg-white/8 p-6 shadow-2xl shadow-black/40 backdrop-blur md:grid-cols-[1.25fr_0.95fr] md:p-8">
        <div className="flex flex-col justify-between gap-10 rounded-[1.5rem] border border-white/8 bg-black/20 p-6 md:p-8">
          <div className="space-y-5">
            <span className="inline-flex w-fit rounded-full border border-amber-200/25 bg-amber-100/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-amber-100">
              {GOOGLE_OAUTH_COPY.badge}
            </span>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                {GOOGLE_OAUTH_COPY.title}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-stone-300 md:text-lg">
                {GOOGLE_OAUTH_COPY.description}
              </p>
            </div>
          </div>

          <div className="grid gap-3 text-sm text-stone-300 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Identity</p>
              <p className="mt-2 text-base font-medium text-white">Google or email link</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Access</p>
              <p className="mt-2 text-base font-medium text-white">Workspace-only entry</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">State</p>
              <p className="mt-2 text-base font-medium text-white">Conversation history ready</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-8 rounded-[1.5rem] border border-white/12 bg-stone-100 p-6 text-stone-950 md:p-8">
          <div className="space-y-4">
            {authError ? (
              <section
                aria-live="polite"
                role="alert"
                className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-4 py-4 text-left text-rose-950 shadow-sm shadow-rose-200/60"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-700">
                  Sign-in status
                </p>
                <h3 className="mt-2 text-base font-semibold">{authError.title}</h3>
                <p className="mt-2 text-sm leading-6 text-rose-900/90">{authError.description}</p>
              </section>
            ) : null}

            <section className="space-y-3 rounded-[1.5rem] border border-stone-200 bg-white px-4 py-4 shadow-sm">
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">
                  {GOOGLE_OAUTH_COPY.supportLabel}
                </p>
                <h2 className="text-2xl font-semibold tracking-tight text-stone-950">
                  Continue with Google.
                </h2>
                <p className="text-sm leading-6 text-stone-600">
                  Start the Google OAuth flow and return to the app for authenticated workspace
                  access.
                </p>
              </div>
              <a
                href={GOOGLE_OAUTH_PATH}
                className="inline-flex w-full items-center justify-center gap-3 rounded-full bg-stone-950 px-5 py-4 text-base font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-950"
              >
                <GoogleMark />
                <span>{GOOGLE_OAUTH_COPY.buttonLabel}</span>
              </a>
            </section>

            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">
              <span className="h-px flex-1 bg-stone-200" />
              <span>or</span>
              <span className="h-px flex-1 bg-stone-200" />
            </div>

            <section className="space-y-4 rounded-[1.5rem] border border-stone-200 bg-white px-4 py-4 shadow-sm">
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">
                  {MAGIC_LINK_COPY.supportLabel}
                </p>
                <h2 className="text-2xl font-semibold tracking-tight text-stone-950">
                  {MAGIC_LINK_COPY.title}
                </h2>
                <p className="text-sm leading-6 text-stone-600">{MAGIC_LINK_COPY.description}</p>
              </div>

              {magicLinkFeedback ? (
                <section
                  aria-live="polite"
                  className="rounded-[1.25rem] border border-emerald-200 bg-emerald-50 px-4 py-4 text-left text-emerald-950 shadow-sm shadow-emerald-200/60"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                    {MAGIC_LINK_COPY.statusLabel}
                  </p>
                  <h3 className="mt-2 text-base font-semibold">{magicLinkFeedback.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-emerald-900/90">
                    {magicLinkFeedback.description}
                  </p>
                </section>
              ) : null}

              <form action={MAGIC_LINK_REQUEST_PATH} method="post" className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="magic-link-email"
                    className="text-sm font-medium text-stone-700"
                  >
                    {MAGIC_LINK_COPY.emailLabel}
                  </label>
                  <input
                    id="magic-link-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    defaultValue={normalizedMagicLinkEmail}
                    className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-base text-stone-950 outline-none transition focus:border-stone-950 focus:bg-white focus:ring-2 focus:ring-stone-200"
                    placeholder="you@company.com"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-full border border-stone-950 px-5 py-4 text-base font-semibold text-stone-950 transition-transform duration-200 hover:-translate-y-0.5 hover:bg-stone-950 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-950"
                >
                  {MAGIC_LINK_COPY.buttonLabel}
                </button>
              </form>
            </section>

            <p className="text-sm leading-6 text-stone-500">{GOOGLE_OAUTH_COPY.privacyNote}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
