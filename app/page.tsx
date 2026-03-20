import {
  GoogleOAuthSignInScreen,
  GOOGLE_OAUTH_PATH,
} from "../components/google-oauth-sign-in-screen.js";

export { GOOGLE_OAUTH_PATH };

type HomePageProps = {
  searchParams?: {
    authError?: string | string[];
  };
};

export default function Home({ searchParams }: HomePageProps = {}) {
  return <GoogleOAuthSignInScreen authErrorCode={searchParams?.authError} />;
}
