import { NextRequest, NextResponse } from "next/server";
import {
  VISITOR_COOKIE,
  isVisitorId,
  visitorCookieOptions,
} from "@/lib/visitor-cookie";

export function proxy(request: NextRequest) {
  const existing = request.cookies.get(VISITOR_COOKIE)?.value;
  const visitorId = isVisitorId(existing) ? existing : crypto.randomUUID();
  const response = NextResponse.next();

  if (visitorId !== existing) {
    request.cookies.set(VISITOR_COOKIE, visitorId);
    response.cookies.set(VISITOR_COOKIE, visitorId, visitorCookieOptions());
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
