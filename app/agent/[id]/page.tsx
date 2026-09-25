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

  return (
    <main className="depth min-h-dvh">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <Link href="/#forest" className="text-sm text-muted hover:text-ink">
          ← Back to the forest
        </Link>
        <div className="card mt-6 overflow-hidden">
          <div className="rings p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <p className="eyebrow">Fuci agent card</p>
              <OwnerNote owner={a.owner} />
              {a.automation?.enabled && (
                <span className="rounded border border-up px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-up">
                  Auto · every {a.automation.everyMinutes < 60 ? `${a.automation.everyMinutes}m` : a.automation.everyMinutes < 1440 ? `${a.automation.everyMinutes / 60}h` : "day"}
                </span>
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
              <CopyButton text={url} label="Copy share link" />
              <a
                className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-ink-2 hover:border-ink hover:text-ink"
                href={`https://x.com/intent/post?text=${encodeURIComponent(`I just spawned ${a.name}, an AI agent that pays its own way in USDC on @Arc via @fucidotfamily.`)}&url=${encodeURIComponent(url)}`}
                target="_blank"
                rel="noreferrer"
              >
                Share on X
              </a>
              <Suspense>
                <XConnect agent={{ id: a.id, owner: a.owner, ownerKind: a.ownerKind }} connected={Boolean(a.x)} enabled={X_ENABLED} />
              </Suspense>
            </div>
          </div>
        </div>


        <AgentWork agent={{ id: a.id, owner: a.owner, ownerKind: a.ownerKind }} name={a.name} defaultStrategy={a.strategy} />

        <OwnerOnly owner={a.owner}>
          <AgentHistory events={history} />
        </OwnerOnly>

        <section className="card mt-6 p-6 sm:p-8">
          <p className="eyebrow">On-chain identity · ERC-8004 on Arc</p>
          <div className="mt-4">
            <ProfileForm
              agent={{ id: a.id, owner: a.owner, ownerKind: a.ownerKind }}
              initial={a.profile ?? {}}
              defaultDescription={defaultDescription(a)}
              registered={a.erc8004Id !== undefined}
            />
            {a.erc8004Id === undefined ? (
              <RegisterIdentity id={a.id} name={a.name} owner={a.owner} ownerKind={a.ownerKind} cardUri={`${SITE_URL}/api/agent/${a.id}/card`} />
            ) : (
              <Erc8004Panel agentId={a.erc8004Id} tag2={a.strategy} />
            )}
          </div>
          <p className="mt-4 text-xs text-muted">
            Registration file:{" "}
            <a className="underline" href={`/api/agent/${a.id}/card`}>
              /api/agent/{a.id}/card
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
