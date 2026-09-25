import { headers } from "next/headers";
import { SITE_URL } from "./config";

/**
 * The origin this page was requested on, so share links and preview images point at a
 * domain that serves them (www.fuci.family in production, localhost in development).
 * Requests on a *.vercel.app host use the canonical domain instead.
 */
export async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host || host.endsWith(".vercel.app")) return SITE_URL;
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto.split(",")[0]}://${host}`;
}
