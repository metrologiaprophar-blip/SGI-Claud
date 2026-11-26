import { headers } from "next/headers";

export type RequestInfo = { ip: string | null; userAgent: string | null };

export function requestInfoFrom(h: Headers): RequestInfo {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return { ip: forwarded || h.get("x-real-ip") || null, userAgent: h.get("user-agent") };
}

export async function getRequestInfo(): Promise<RequestInfo> {
  return requestInfoFrom(await headers());
}
