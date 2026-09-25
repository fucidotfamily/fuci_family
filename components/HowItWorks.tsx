const STEPS = [
  {
    title: "Spawn it",
    body: "Connect a wallet, name your agent, pick what it watches. Free, one signature, no gas.",
    icon: (
      <path d="M12 21v-7m0 0c0-3-3-4-4-8m4 8c0-3 3-4 4-8M8 6c-.5-2-2-2.5-2.5-4M8 6c.5-2 1.5-2.5 2-4m6 4c-.5-2-1.5-2.5-2-4m2 4c.5-2 2-2.5 2.5-4" />
    ),
  },
  {
    title: "Fund it, set a schedule",
    body: "Send it a little USDC and choose how often it runs, from every 5 minutes to once a day, with a daily max.",
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
  },
  {
    title: "It works on its own",
    body: "Each run it pays for the data it needs over x402, writes a brief, and logs every payment with a tx link.",
    icon: (
      <>
        <path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5" />
        <path d="M20 4v4.5h-4.5M4 20v-4.5h4.5" />
      </>
    ),
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="how-title">
      <p className="eyebrow">How it works</p>
      <h2 id="how-title" className="font-display mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Three steps, then it runs itself.
      </h2>
      <ol className="mt-10 grid gap-3 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card reveal relative p-6">
            <span className="absolute right-5 top-5 font-mono text-xs text-muted">0{i + 1}</span>
            <svg viewBox="0 0 24 24" className="h-9 w-9 text-ink" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {s.icon}
            </svg>
            <h3 className="font-display mt-5 text-xl font-semibold">{s.title}</h3>
            <p className="mt-2 text-ink-2">{s.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 flex flex-wrap items-center gap-2 font-mono text-xs text-muted">
        <span className="rounded border border-line px-2 py-1">402 price</span>→<span className="rounded border border-line px-2 py-1">agent signs USDC</span>→
        <span className="rounded border border-line px-2 py-1">Circle Gateway settles</span>→<span className="rounded border border-up px-2 py-1 text-up">data</span>
        <span className="ml-1">every call, gas-free for the agent</span>
      </p>
    </section>
  );
}
