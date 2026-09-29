import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { resolveAgent } from "@/lib/store";

// One lookup per request: metadata and page share it, so an old link migrates once and redirects.
const loadAgent = cache(resolveAgent);
import { CopyButton } from "@/components/CopyButton";
import { SITE_URL } from "@/lib/config";
import { Erc8004Panel } from "@/components/Erc8004Panel";
import { AgentWalletLink } from "@/components/AgentWalletLink";
import { RegisterIdentity } from "@/components/RegisterIdentity";
import { ProfileForm } from "@/components/ProfileForm";
import { OwnerNote } from "@/components/OwnerNote";
import { EditableAvatar, XConnect } from "@/components/OwnerTools";
import { requestOrigin } from "@/lib/requestOrigin";
import { agentHistory } from "@/lib/history";
import { AgentHistory } from "@/components/AgentHistory";
import { OwnerOnly } from "@/components/OwnerOnly";
import { AgentWork } from "@/components/AgentWork";
import { X_ENABLED } from "@/lib/xAuth";
import { Suspense } from "react";
import { defaultDescription, strategyName } from "@/lib/strategy";
import { createdWithFuci } from "@/lib/forest";
import { totalsOf } from "@/lib/tradePnl";
import { OnchainPrompt } from "@/components/OnchainPrompt";
import { AgentTabs } from "@/components/AgentTabs";
import { EarnPanel } from "@/components/EarnPanel";

export const dynamic = "force-dynamic";


type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { agent: a, redirect } = await loadAgent(id);
  if (!a) return { title: "Frond not found" };
  if (redirect && redirect !== id) permanentRedirect(`/agent/${redirect}`);
  const origin = await requestOrigin();
  return {
    // Preview image and link on the domain that served this page (X fetches them from there).
    metadataBase: new URL(origin),
    alternates: { canonical: `${origin}/agent/${a.id}` },
    openGraph: { type: "profile", url: `${origin}/agent/${a.id}`, title: `${a.name}, a Fuci agent`, siteName: "Fuci" },
    twitter: { card: "summary_large_image", title: `${a.name}, a Fuci agent` },
    title: `${a.name}, a Fuci agent`,
    description: `${a.name} is a ${strategyName(a)} on Arc. It pays for its own data in USDC over x402.`,
  };
}

export default async function AgentPage({ params }: Props) {
  const { id } = await params;
  const { agent: a, redirect } = await loadAgent(id);
  if (!a) notFound();
  // Old links (name + random suffix) move to the clean name.
  if (redirect && redirect !== id) permanentRedirect(`/agent/${redirect}`);
  const url = `${await requestOrigin()}/agent/${a.id}`;
  const born = new Date(a.createdAt).toISOString().slice(0, 10);
  const history = await agentHistory(a);
  const withFuci = await createdWithFuci(a).catch(() => false);
  const onChain = a.erc8004Id !== undefined;
  const owner = { id: a.id, owner: a.owner, ownerKind: a.ownerKind };
  const traded = ((await totalsOf(a.id).catch(() => null))?.buys ?? 0) > 0;

  return (
    <main className="depth min-h-dvh">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Link href="/#forest" className="text-sm text-muted hover:text-ink">
          ← Back to the forest
        </Link>
        <AgentTabs
          owner={a.owner}
          header={
            <div className="flex items-center gap-3 px-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- our own generated avatar route */}
              <img src={`/api/agent/${a.id}/image?v=${a.image ?? a.x?.connectedAt ?? 0}`} alt="" width={40} height={40} className="h-10 w-10 rounded-full border border-line" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{a.name}</p>
                <p className="truncate text-xs text-muted">{strategyName(a)}</p>
              </div>
            </div>
          }
          footer={
            <div className="rounded-lg border border-line p-3 text-xs text-ink-2">
              <p className="flex items-center gap-2 font-medium text-ink">
                <span className="live-dot" /> Live · Arc mainnet
              </p>
              <p className="mt-1.5">Every number here is read from Arc or from settled payments.</p>
              {a.wallet && (
                <a className="mt-2 block truncate font-mono text-[11px] text-muted hover:text-ink" href={`https://explorer.arc.io/address/${a.wallet}`} target="_blank" rel="noreferrer">
                  wallet · {a.wallet.slice(0, 6)}…{a.wallet.slice(-4)}
                </a>
              )}
            </div>
          }
          tabs={[
            {
              id: "overview",
              label: "Overview",
              sub: "The agent's public card: what it is, what it has done, and where to share it.",
              icon: "overview",
              node: (
                <>
        <div className="card overflow-hidden">
          <div className="rings p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <p className="eyebrow">Fuci agent card</p>
              <OwnerNote owner={a.owner} />
              {a.automation?.enabled && (
                <span className="rounded border border-up px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-up">
                  Auto · every {a.automation.everyMinutes < 60 ? `${a.automation.everyMinutes}m` : a.automation.everyMinutes < 1440 ? `${a.automation.everyMinutes / 60}h` : "day"}
                </span>
              )}
              {a.trading?.enabled && (
                <span className="rounded border border-up px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-up">Autopilot on</span>
              )}
            </div>
            <div className="mt-4 flex items-center gap-4 sm:gap-6">
              <EditableAvatar
                agent={{ id: a.id, owner: a.owner, ownerKind: a.ownerKind }}
                src={`/api/agent/${a.id}/image?v=${a.image ?? a.x?.connectedAt ?? 0}`}
                alt={`${a.name} profile image`}
                hasImage={Boolean(a.image)}
              />
              <div className="min-w-0">
                <h1 className="font-display break-words text-4xl font-semibold tracking-tight sm:text-6xl">{a.name}</h1>
                <p className="mt-1 text-ink-2">
                  {strategyName(a)}
                  {withFuci && (
                    <Link href="/" className="ml-2 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-ink-2 hover:text-ink">
                      Created with Fuci
                    </Link>
                  )}
                </p>
                {a.mission && <p className="mt-2 max-w-xl text-sm text-ink-2">&ldquo;{a.mission}&rdquo;</p>}
                {a.x && (
                  <a
                    href={`https://x.com/${a.x.username}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-2 rounded border border-line px-2 py-1 text-sm hover:border-ink"
                    title="Verified by X login"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    <span className="font-medium">@{a.x.username}</span>
                    {a.x.verified && <span className="text-xs text-muted">verified</span>}
                  </a>
                )}
              </div>
            </div>
            <dl className="mt-8 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted">Daily limit</dt>
                <dd className="font-mono text-lg">{a.dailyLimitUsdc.toFixed(2)} USDC</dd>
              </div>
              <div>
                <dt className="text-muted">x402 calls</dt>
                <dd className="font-mono text-lg">{a.calls}</dd>
              </div>
              <div>
                <dt className="text-muted">Spent</dt>
                <dd className="font-mono text-lg">{a.spentUsdc.toFixed(3)} USDC</dd>
              </div>
              <div>
                <dt className="text-muted">Sprouted</dt>
                <dd className="font-mono text-lg">{born}</dd>
              </div>
            </dl>
            <p className="mt-6 break-all font-mono text-xs text-muted">holdfast: {a.owner}</p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              {a.wallet && (
                <Link className="btn btn-primary !px-3 !py-1.5 text-xs" href={`/escrow?agent=${a.id}`}>
                  Hire with escrow
                </Link>
              )}
              <CopyButton text={url} label="Copy share link" />
              <a
                className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-ink-2 hover:border-ink hover:text-ink"
                href={`https://x.com/intent/post?text=${encodeURIComponent(`I just spawned ${a.name}, an AI agent that pays its own way in USDC on @Arc via @fucidotfamily.`)}&url=${encodeURIComponent(url)}`}
                target="_blank"
                rel="noreferrer"
              >
                Share on X
              </a>
              {traded && (
                <Link className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-ink-2 hover:border-ink hover:text-ink" href={`/agent/${a.id}/pnl`}>
                  Autopilot PnL →
                </Link>
              )}
              <Suspense>
                <XConnect agent={{ id: a.id, owner: a.owner, ownerKind: a.ownerKind }} connected={Boolean(a.x)} enabled={X_ENABLED} />
              </Suspense>
            </div>
          </div>
        </div>
        {onChain && a.wallet && <AgentWalletLink agent={a.id} owner={a.owner} banner />}
        {!onChain && (
          <OwnerOnly owner={a.owner}>
            <OnchainPrompt agentId={a.id} createdAt={a.createdAt} fee="1 USDC once">
              <RegisterIdentity id={a.id} name={a.name} owner={a.owner} ownerKind={a.ownerKind} cardUri={`${SITE_URL}/api/agent/${a.id}/card`} />
            </OnchainPrompt>
          </OwnerOnly>
        )}

                  <AgentWork agent={owner} name={a.name} defaultStrategy={a.strategy} part="invite" />
                </>
              ),
            },
            { id: "ask", label: "Chat", sub: "Ask about Argus, paste a token to trade it, or tell your agent what to do: Earn, DCA, autopilot, buy, sell.", icon: "ask", ownerOnly: true, node: <AgentWork agent={owner} name={a.name} defaultStrategy={a.strategy} part="ask" /> },
            { id: "autopilot", label: "Autopilot", sub: "Trades on its own from the agent wallet every 5 minutes, within your limits.", icon: "autopilot", ownerOnly: true, node: <AgentWork agent={owner} name={a.name} defaultStrategy={a.strategy} part="autopilot" /> },
            { id: "earn", label: "Earn", sub: "Idle USDC or EURC earns yield in a lending vault on Arc until the agent needs it.", icon: "earn", ownerOnly: true, node: <EarnPanel agent={owner} /> },
            { id: "history", label: "History", sub: "Every payment, trade and deposit, with a link to its transaction.", icon: "history", ownerOnly: true, node: <AgentHistory events={history} agentId={a.id} /> },
            {
              id: "identity",
              label: "On-chain identity",
              sub: "Its ERC-8004 record on Arc: profile, reputation and validations anyone can check.",
              icon: "identity",
              node: (
        <section className="card p-6 sm:p-8">
          <p className="eyebrow">On-chain identity · ERC-8004 on Arc</p>
          <div className="mt-4">
            <ProfileForm
              agent={{ id: a.id, owner: a.owner, ownerKind: a.ownerKind }}
              initial={a.profile ?? {}}
              defaultDescription={defaultDescription(a)}
              registered={a.erc8004Id !== undefined}
            />
            {!onChain ? (
              <p className="mt-4 text-sm text-ink-2">Not on-chain yet. The owner can create its identity from the top of this page.</p>
            ) : (
              <>
                <Erc8004Panel agentId={a.erc8004Id} tag2={a.strategy} />
                {a.wallet && <AgentWalletLink agent={a.id} owner={a.owner} />}
              </>
            )}
          </div>
          <p className="mt-4 text-xs text-muted">
            Registration file:{" "}
            <a className="underline" href={`/api/agent/${a.id}/card`}>
              /api/agent/{a.id}/card
            </a>
          </p>
        </section>
              ),
            },
          ]}
        />
      </div>
    </main>
  );
}
