import { NextResponse, type NextRequest } from "next/server";

/**
 * The old Vercel domain moves to https://www.fuci.family (308, path kept).
 * API routes are left alone so x402 clients, the automation tick and callbacks
 * keep working on either host.
 */
export function proxy(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  if (host === "fuci.vercel.app") {
    const url = new URL(req.nextUrl.pathname + req.nextUrl.search, "https://www.fuci.family");
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image).*)"],
};
