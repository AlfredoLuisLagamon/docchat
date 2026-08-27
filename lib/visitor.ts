import { cookies } from "next/headers";
import {
  VISITOR_COOKIE,
  isVisitorId,
  visitorCookieOptions,
} from "@/lib/visitor-cookie";

export { VISITOR_COOKIE, isVisitorId, visitorCookieOptions };

export async function getVisitorId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(VISITOR_COOKIE)?.value;
  return isVisitorId(value) ? value : null;
}

export async function ensureVisitorId(): Promise<string> {
  const existing = await getVisitorId();
  if (existing) {
    return existing;
  }

  const visitorId = crypto.randomUUID();
  const store = await cookies();
  store.set(VISITOR_COOKIE, visitorId, visitorCookieOptions());
  return visitorId;
}
