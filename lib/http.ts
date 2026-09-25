import { NextResponse } from "next/server";
import { NotFoundError } from "./argus";

/** Turn a thrown error into a JSON response with a meaningful status (never an empty 500). */
export function errorResponse(e: unknown, where: string) {
  const err = e as { response?: { data?: { message?: string } }; message?: string; shortMessage?: string };
  const message = err?.response?.data?.message ?? err?.shortMessage ?? err?.message ?? String(e);
  const status = e instanceof NotFoundError ? 404 : 502;
  console.error(`[${where}]`, message);
  return NextResponse.json({ error: message, where }, { status });
}
