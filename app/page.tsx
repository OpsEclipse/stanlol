import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  GoogleOAuthSignInScreen,
  GOOGLE_OAUTH_PATH,
  MAGIC_LINK_REQUEST_PATH,
} from "../components/google-oauth-sign-in-screen.js";

export { GOOGLE_OAUTH_PATH };
export { MAGIC_LINK_REQUEST_PATH };

const ACCESS_TOKEN_COOKIE_NAME = "stanlol-access-token";
const REFRESH_TOKEN_COOKIE_NAME = "stanlol-refresh-token";
const WORKSPACE_PATH = "/workspace";

type HomePageProps = {
  searchParams?: {
    authError?: string | string[];
    email?: string | string[];
    magicLinkStatus?: string | string[];
  };
};

async function hasWorkspaceSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value?.trim() ?? "";
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value?.trim() ?? "";

  return accessToken.length > 0 || refreshToken.length > 0;
}

export default async function Home({ searchParams }: HomePageProps = {}) {
  if (await hasWorkspaceSession()) {
    redirect(WORKSPACE_PATH);
  }

  return (
    <GoogleOAuthSignInScreen
      authErrorCode={searchParams?.authError}
      magicLinkEmail={searchParams?.email}
      magicLinkStatus={searchParams?.magicLinkStatus}
    />
  );
}
