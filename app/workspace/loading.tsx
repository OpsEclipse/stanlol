import { AuthLoadingState } from "../../components/loading-state.js";

const AUTH_BOOTSTRAP_TITLE = "Resolving your session";
const AUTH_BOOTSTRAP_DESCRIPTION =
  "Checking your session and preparing the authenticated workspace shell before your conversation history appears.";

export default function WorkspaceLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-stone-950 px-4 py-4 text-stone-100 md:px-6 md:py-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.22),_transparent_36%),linear-gradient(145deg,_#0c0a09_0%,_#1c1917_48%,_#292524_100%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-7xl items-center justify-center">
        <AuthLoadingState
          className="max-w-4xl"
          title={AUTH_BOOTSTRAP_TITLE}
          description={AUTH_BOOTSTRAP_DESCRIPTION}
        />
      </div>
    </main>
  );
}
