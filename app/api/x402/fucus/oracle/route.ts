import { NextResponse } from "next/server";
import { getTide } from "@/lib/argus";
import { errorResponse } from "@/lib/http";
import { toolById } from "@/lib/tools";
import { paid } from "@/lib/x402";

export const dynamic = "force-dynamic";

export const GET = paid(toolById("fucus_oracle")!, async () => {
  try {
    return NextResponse.json({ tool: "fucus_oracle", ...(await getTide()) });
  } catch (e) {
    return errorResponse(e, "fucus_oracle");
  }
});
