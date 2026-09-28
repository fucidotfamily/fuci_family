/**
 * Trading rules for an agent's autopilot. Shared by the browser (the owner signs these
 * settings) and the server (which checks them against the same normalized text), so this
 * file must stay free of server-only imports.
 */

export type TradeRule =
  /** Buy each new Argus launch once (skipping tokens whose buy tax is above `maxBuyTaxPct`). */
  | { id: string; kind: "snipe-new"; usdc: number; maxBuyTaxPct?: number }
  /** Buy each token once, right after it bonds (crosses Argus' bond tick). */
  | { id: string; kind: "buy-graduated"; usdc: number; maxBuyTaxPct?: number }
  /** Buy `token` once when its price is at or below `price` (USDC per token). */
  | { id: string; kind: "limit-buy"; token: string; price: number; usdc: number; done?: boolean }
  /** Sell `pct`% of the `token` position once when its price is at or above `price`. */
  | { id: string; kind: "limit-sell"; token: string; price: number; pct: number; done?: boolean }
  /** Sell `sellPct`% of any position once it is up `pct`%. */
  | { id: string; kind: "take-profit"; pct: number; sellPct: number }
  /** Sell a whole position once it is down `pct`%. */
  | { id: string; kind: "stop-loss"; pct: number }
  /** Sell a whole position when the token's dev sells. */
  | { id: string; kind: "dev-sell" }
  /**
   * Smart entry: watch new launches and/or fresh bondings, and buy only the ones that pass every
   * filter after they have traded for a while (see lib/tradeSignals.ts).
   */
  | ({ id: string; kind: "smart-buy"; usdc: number } & SmartFilters)
  /** Once a position has been in profit, sell it all if the price falls `pct`% from its peak. */
  | { id: string; kind: "trailing-stop"; pct: number }
  /** Sell a whole position held for `hours` that is not up at least `minGainPct`%. */
  | { id: string; kind: "time-exit"; hours: number; minGainPct: number }
  /**
   * DCA: buy `usdc` of `token` every `everyHours`, until `totalUsdc` has been spent (0 = no cap).
   * With `hold`, the automatic exits never sell this token.
   */
  | { id: string; kind: "dca"; token: string; usdc: number; everyHours: number; totalUsdc: number; hold: boolean };

export type SmartFilters = {
  /** Which tokens to watch. */
  source: "launches" | "bonded" | "both";
  /** Only consider a token between these ages (minutes since launch or bonding). */
  minAgeMin: number;
  maxAgeMin: number;
  /** Distinct wallets that bought. */
  minBuyers: number;
  /** USDC bought minus USDC sold. */
  minNetUsdc: number;
  /** Most of the supply the creator may hold (%). */
  maxDevPct: number;
  maxBuyTaxPct: number;
  maxSellTaxPct: number;
  /** Skip creators with more launches than this in the last 24 hours (serial launchers). */
  maxCreatorLaunches: number;
  /** Bonded tokens only: the lowest Fuci Risk grade to accept. */
  minGrade: "A" | "B" | "C" | "D";
  /** Real socials in the launch record (website, X account, Telegram). */
  minSocials: number;
  /** Most of the supply bought in the first ~5 seconds after launch (bundled snipes, the dev's included). */
  maxBundlePct: number;
  /** Organic volume: most of the volume one wallet may account for. */
  maxTopWalletPct: number;
  /** Organic volume: most of the volume from wallets that both bought and sold (wash trading). */
  maxRoundTripPct: number;
};

export const SMART_DEFAULTS: SmartFilters = {
  source: "both",
  minAgeMin: 10,
  maxAgeMin: 120,
  minBuyers: 8,
  minNetUsdc: 20,
  maxDevPct: 4,
  maxBuyTaxPct: 5,
  maxSellTaxPct: 5,
  maxCreatorLaunches: 3,
  minGrade: "C",
  minSocials: 1,
  maxBundlePct: 5,
  maxTopWalletPct: 30,
  maxRoundTripPct: 50,
};

export type TradeRuleKind = TradeRule["kind"];

export type Trading = {
  enabled: boolean;
  /** Most USDC a single buy may spend. */
  perTradeUsdc: number;
  /** Most USDC all buys together may spend per UTC day. Sells are never limited. */
  dailyUsdc: number;
  slippagePct: number;
  rules: TradeRule[];
  failures: number;
  lastRunAt?: number;
  /** What the last check found, in one line (shown on the agent page). */
  lastResult?: string;
  pausedReason?: string;
};

export type TradingSettings = Pick<Trading, "enabled" | "perTradeUsdc" | "dailyUsdc" | "slippagePct" | "rules">;

export const RULE_LABEL: Record<TradeRuleKind, string> = {
  "snipe-new": "Buy new Argus launches",
  "buy-graduated": "Buy when a token bonds",
  "limit-buy": "Limit buy",
  "limit-sell": "Limit sell",
  "take-profit": "Take profit",
  "stop-loss": "Stop loss",
  "dev-sell": "Sell when dev sells",
  "smart-buy": "Smart entry",
  "trailing-stop": "Trailing stop",
  "time-exit": "Time exit",
  dca: "DCA",
};

/** Argus launches set their own buy tax (up to 10%): by default, skip anything above this. */
export const DEFAULT_MAX_BUY_TAX_PCT = 5;

/** Fuci's cut of every trade, sent to the treasury. */
export const TRADE_FEE_PCT = 1;
export const MAX_RULES = 12;
export const MAX_TRADE_USDC = 100;

const num = (v: unknown, min: number, max: number, dp = 6) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};
const addr = (v: unknown) => (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v) ? v.toLowerCase() : null);

/** Clean up settings from the form; throws a readable error for anything out of range. */
export function normalizeTrading(s: Partial<TradingSettings>): TradingSettings {
  const perTradeUsdc = num(s.perTradeUsdc, 0.1, MAX_TRADE_USDC, 2);
  const dailyUsdc = num(s.dailyUsdc, 0.1, 1000, 2);
  const slippagePct = num(s.slippagePct, 0.5, 50, 1);
  if (perTradeUsdc === null) throw new Error(`Per trade must be 0.10–${MAX_TRADE_USDC} USDC`);
  if (dailyUsdc === null) throw new Error("Max per day must be 0.10–1000 USDC");
  if (slippagePct === null) throw new Error("Slippage must be 0.5–50%");
  const raw = Array.isArray(s.rules) ? s.rules.slice(0, MAX_RULES) : [];
  const rules: TradeRule[] = raw.map((r, i) => {
    const id = typeof r?.id === "string" && /^[a-z0-9]{1,12}$/.test(r.id) ? r.id : `r${i}`;
    const usdc = (v: unknown) => {
      const n = num(v, 0.1, perTradeUsdc, 2);
      if (n === null) throw new Error(`${RULE_LABEL[r.kind] ?? "Rule"}: amount must be 0.10–${perTradeUsdc} USDC (your per-trade max)`);
      return n;
    };
    const pct = (v: unknown, min: number, max: number) => {
      const n = num(v, min, max, 1);
      if (n === null) throw new Error(`${RULE_LABEL[r.kind] ?? "Rule"}: percent must be ${min}–${max}`);
      return n;
    };
    const token = (v: unknown) => {
      const a = addr(v);
      if (!a) throw new Error(`${RULE_LABEL[r.kind] ?? "Rule"}: paste the token's contract address`);
      return a;
    };
    const price = (v: unknown) => {
      const n = Number(v);
      if (!(Number.isFinite(n) && n > 0 && n < 1e6)) throw new Error(`${RULE_LABEL[r.kind] ?? "Rule"}: set a price in USDC`);
      return Number(n.toPrecision(6));
    };
    switch (r?.kind) {
      case "snipe-new":
      case "buy-graduated":
        return { id, kind: r.kind, usdc: usdc(r.usdc), maxBuyTaxPct: r.maxBuyTaxPct === undefined ? DEFAULT_MAX_BUY_TAX_PCT : pct(r.maxBuyTaxPct, 0, 10) };
      case "limit-buy":
        return { id, kind: r.kind, token: token(r.token), price: price(r.price), usdc: usdc(r.usdc), ...(r.done ? { done: true } : {}) };
      case "limit-sell":
        return { id, kind: r.kind, token: token(r.token), price: price(r.price), pct: pct(r.pct, 1, 100), ...(r.done ? { done: true } : {}) };
      case "take-profit":
        return { id, kind: r.kind, pct: pct(r.pct, 1, 10000), sellPct: pct(r.sellPct, 1, 100) };
      case "stop-loss":
        return { id, kind: r.kind, pct: pct(r.pct, 1, 99) };
      case "dev-sell":
        return { id, kind: r.kind };
      case "smart-buy": {
        const whole = (v: unknown, min: number, max: number, what: string) => {
          const n = num(v, min, max, 0);
          if (n === null) throw new Error(`Smart entry: ${what} must be ${min}–${max}`);
          return n;
        };
        const minAgeMin = whole(r.minAgeMin, 2, 720, "the earliest age (minutes)");
        const maxAgeMin = whole(r.maxAgeMin, 5, 1440, "the latest age (minutes)");
        if (maxAgeMin <= minAgeMin) throw new Error("Smart entry: the latest age must be after the earliest");
        const source = r.source === "launches" || r.source === "bonded" ? r.source : "both";
        const minGrade = (["A", "B", "C", "D"] as const).includes(r.minGrade as "A") ? r.minGrade : "C";
        return {
          id,
          kind: r.kind,
          usdc: usdc(r.usdc),
          source,
          minAgeMin,
          maxAgeMin,
          minBuyers: whole(r.minBuyers, 1, 500, "the minimum buyers"),
          minNetUsdc: whole(r.minNetUsdc, 0, 100000, "the minimum net buying (USDC)"),
          maxDevPct: pct(r.maxDevPct, 0, 100),
          maxBuyTaxPct: pct(r.maxBuyTaxPct, 0, 10),
          maxSellTaxPct: pct(r.maxSellTaxPct, 0, 10),
          maxCreatorLaunches: whole(r.maxCreatorLaunches, 1, 1000, "the creator launch limit"),
          minGrade,
          minSocials: whole(r.minSocials ?? SMART_DEFAULTS.minSocials, 0, 3, "the minimum socials"),
          maxBundlePct: pct(r.maxBundlePct ?? SMART_DEFAULTS.maxBundlePct, 0, 100),
          maxTopWalletPct: pct(r.maxTopWalletPct ?? SMART_DEFAULTS.maxTopWalletPct, 1, 100),
          maxRoundTripPct: pct(r.maxRoundTripPct ?? SMART_DEFAULTS.maxRoundTripPct, 0, 100),
        };
      }
      case "dca": {
        const everyHours = num(r.everyHours, 1, 720, 0);
        if (everyHours === null) throw new Error("DCA: buy every 1–720 hours");
        const totalUsdc = num(r.totalUsdc ?? 0, 0, 1_000_000, 2);
        if (totalUsdc === null) throw new Error("DCA: total budget must be 0 (no cap) or more");
        return { id, kind: r.kind, token: token(r.token), usdc: usdc(r.usdc), everyHours, totalUsdc, hold: r.hold !== false };
      }
      case "trailing-stop":
        return { id, kind: r.kind, pct: pct(r.pct, 2, 90) };
      case "time-exit":
        return { id, kind: r.kind, hours: num(r.hours, 1, 720, 0) ?? (() => { throw new Error("Time exit: hours must be 1–720"); })(), minGainPct: pct(r.minGainPct ?? 0, 0, 1000) };
      default:
        throw new Error("Unknown rule");
    }
  });
  return { enabled: Boolean(s.enabled), perTradeUsdc, dailyUsdc: Math.max(dailyUsdc, perTradeUsdc), slippagePct, rules };
}

/** The exact settings text the owner signs, so a signature can't be replayed for other settings. */
export const tradingDetail = (s: TradingSettings) => JSON.stringify(s);
