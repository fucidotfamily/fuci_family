import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/config";
import { registrationFile } from "@/lib/agentCard";
import { resolveAgent } from "@/lib/store";

export const dynamic = "force-dynamic";

import { defaultDescription } from "@/lib/strategy";
import { createdWithFuci } from "@/lib/forest";

/** ERC-8004 registration file for a spawned frond (its tokenURI). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { agent: a } = await resolveAgent(id);
  if (!a) return NextResponse.json({ error: "Frond not found" }, { status: 404 });
  // Agents created through the Fuci factory say so; the name stays the owner's own.
  const withFuci = await createdWithFuci(a).catch(() => false);
  const description = a.profile?.description || defaultDescription(a);
  return NextResponse.json(
    registrationFile({
      name: a.name,
      description: withFuci && !/created with fuci/i.test(description) ? `${description} Created with Fuci · www.fuci.family` : description,
      createdWith: withFuci ? SITE_URL : undefined,
      image: `${SITE_URL}/api/agent/${a.id}/image`,
      agentId: a.erc8004Id ?? null,
      web: `${SITE_URL}/agent/${a.id}`,
      house: false,
      x: a.x?.username,
      profile: a.profile,
      a2a: `${SITE_URL}/api/agent/${a.id}/a2a`,
    }),
    { headers: { "Cache-Control": "public, s-maxage=10", "Access-Control-Allow-Origin": "*" } },
  );
}
