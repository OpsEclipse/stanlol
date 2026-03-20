import { NextResponse } from "next/server";

import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_EXPIRES_AT_COOKIE,
  clearAuthSessionCookies,
  REFRESH_TOKEN_COOKIE,
} from "../../../lib/auth-session";

export { ACCESS_TOKEN_COOKIE, ACCESS_TOKEN_EXPIRES_AT_COOKIE, REFRESH_TOKEN_COOKIE };

export const SIGN_OUT_PATH = "/auth/sign-out";
export const SIGN_OUT_REDIRECT_PATH = "/";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL(SIGN_OUT_REDIRECT_PATH, request.url), {
    status: 303,
  });

  clearAuthSessionCookies(response, request);

  return response;
}
