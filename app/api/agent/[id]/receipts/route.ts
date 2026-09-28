import { agentHistory } from "@/lib/history";
import { resolveAgent } from "@/lib/store";

export const dynamic = "force-dynamic";

/** A CSV cell: quoted, and never read as a formula by spreadsheet apps. */
const cell = (v: string | number | undefined) => {
  const s = v === undefined ? "" : String(v);
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** The agent's receipts: every payment and trade in its history (the latest 200 events), as CSV. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { agent } = await resolveAgent((await params).id);
  if (!agent) return new Response("Agent not found", { status: 404 });
  const rows = (await agentHistory(agent)).filter((e) => (e.kind === "payment" || e.kind === "trade") && e.usdc);
  const csv = [
    ["time_utc", "kind", "description", "usdc", "transaction"].map(cell).join(","),
    ...rows.map((e) => [new Date(e.at).toISOString(), /^Moved /.test(e.label) ? "gateway deposit" : e.kind, e.label, e.usdc, e.href ?? (/^Moved /.test(e.label) ? "" : "settled in a Circle Gateway batch")].map(cell).join(",")),
  ].join("\r\n");
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fuci-${agent.id.replace(/[^a-z0-9-]/gi, "")}-receipts-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
