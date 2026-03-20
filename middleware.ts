import { NextResponse } from "next/server";

import {
  clearAuthSessionCookies,
  readAuthSession,
  refreshAuthSession,
  shouldRefreshAuthSession,
  writeAuthSessionCookies,
} from "./lib/auth-session";

const SIGN_IN_PATH = "/";

export async function middleware(request: Request): Promise<NextResponse> {
  const session = readAuthSession(request);

  if (!session.accessToken && !session.refreshToken) {
    return NextResponse.redirect(new URL(SIGN_IN_PATH, request.url));
  }

  if (!shouldRefreshAuthSession(session)) {
    return NextResponse.next();
  }

  try {
    const refreshedSession = await refreshAuthSession(session.refreshToken ?? "");
    const response = NextResponse.next();

    writeAuthSessionCookies(response, request, {
      ...refreshedSession,
      refreshToken: refreshedSession.refreshToken ?? session.refreshToken,
    });

    return response;
  } catch {
    const response = NextResponse.redirect(new URL(SIGN_IN_PATH, request.url));
    clearAuthSessionCookies(response, request);

    return response;
  }
}

export const config = {
  matcher: ["/workspace/:path*"],
};
