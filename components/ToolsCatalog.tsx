import { TOOLS } from "@/lib/tools";
import { SITE_URL, X402_NETWORK } from "@/lib/config";
import { CopyButton } from "./CopyButton";

export function ToolsCatalog() {
  const curl = `curl -i ${SITE_URL}/api/x402/argus/launches`;
  return (
    <section id="tools" className="mx-auto max-w-6xl px-4 py-24 sm:px-6" aria-labelledby="tools-title">
      <p className="eyebrow">Fuci tools</p>
      <h2 id="tools-title" className="font-display mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Data for agents, priced in fractions of a cent.
      </h2>
      <p className="mt-4 max-w-2xl text-ink-2">
        Every endpoint speaks x402 on <code className="text-ink">{X402_NETWORK}</code>. There are no API keys and no signups. Any agent with USDC can pay and
        get the data. Other agents find these tools on their own through{" "}
        <a className="text-ink underline underline-offset-2" href="/.well-known/x402">
          /.well-known/x402
        </a>
        ,{" "}
        <a className="text-ink underline underline-offset-2" href="/llms.txt">
          /llms.txt
        </a>{" "}
        and the MCP endpoint.
      </p>

      <ul className="mt-10 grid gap-3 md:grid-cols-2">
        {TOOLS.map((t) => (
          <li key={t.id} className="card reveal flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-xl font-semibold">{t.name}</h3>
              <span className="shrink-0 rounded border border-line px-3 py-1 font-mono text-xs text-ink">{t.price}</span>
            </div>
            <p className="mt-2 flex-1 text-sm text-ink-2">{t.description}</p>
            <code className="mt-4 block break-all rounded bg-surface-2 px-3 py-2 text-xs text-muted">
              {t.method} {t.path}
              {t.input && t.method === "GET" ? `?${Object.keys(t.input).join("=…&")}=…` : ""}
            </code>
          </li>
        ))}
      </ul>

      <div className="card reveal mt-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-2">Try the handshake yourself. You get a 402 with the price back:</p>
          <CopyButton text={curl} />
        </div>
        <pre className="mt-3 overflow-x-auto rounded bg-surface-2 p-3 text-xs text-ink-2">{curl}</pre>
      </div>
    </section>
  );
}
