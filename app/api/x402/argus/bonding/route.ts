import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { getBonding, getLaunches } from "@/lib/argus";
import { FUCI_TOKEN } from "@/lib/config";
import { errorResponse } from "@/lib/http";
import { toolById } from "@/lib/tools";
import { paid } from "@/lib/x402";

export const dynamic = "force-dynamic";

// Failures return >= 400, so withX402 does not settle the payment.
export const GET = paid(toolById("argus_bonding")!, async (req) => {
  try {
    const param = req.nextUrl.searchParams.get("token") || FUCI_TOKEN;
    const token = param && isAddress(param) ? param : (await getLaunches(1)).data[0]?.token;
    if (!token) return NextResponse.json({ error: "No Argus launches found on Arc" }, { status: 404 });
    return NextResponse.json({ tool: "argus_bonding", ...(await getBonding(token)) });
  } catch (e) {
    return errorResponse(e, "argus_bonding");
  }
});
