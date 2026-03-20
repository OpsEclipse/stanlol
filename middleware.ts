import { NextResponse } from "next/server";

import {
  clearAuthSessionCookies,
  readAuthSession,
  refreshAuthSession,
  shouldRefreshAuthSession,
  writeAuthSessionCookies,
} from "./lib/auth-session";

export async function middleware(request: Request): Promise<NextResponse> {
  const session = readAuthSession(request);

  if (!shouldRefreshAuthSession(session)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  try {
    const refreshedSession = await refreshAuthSession(session.refreshToken ?? "");

    writeAuthSessionCookies(response, request, {
      ...refreshedSession,
      refreshToken: refreshedSession.refreshToken ?? session.refreshToken,
    });
  } catch {
    clearAuthSessionCookies(response, request);
  }

  return response;
}

export const config = {
  matcher: ["/workspace/:path*"],
};
