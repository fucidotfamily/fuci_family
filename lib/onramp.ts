import "server-only";
import { createOnrampServerKit, type OnrampServerKit } from "@circle-fin/onramp-kit/server";

/**
 * Circle Onramp Kit (server side): buy USDC on Arc with a debit card, Apple Pay or Google Pay
 * without leaving Fuci. The kit key stays here; the browser only gets a short-lived session.
 *
 * ONRAMP_API_KEY enables it (Circle Console → kit keys). Leaving both base URLs unset means
 * production (api.circle.com / onramp.arc.io, real money on Arc mainnet); set both to Circle's
 * sandbox endpoints to test on Arc testnet. Setting only one is refused.
 */
const API_KEY = process.env.ONRAMP_API_KEY?.trim() || "";
const API_BASE = process.env.ONRAMP_API_BASE_URL?.trim() || undefined;
const WIDGET_BASE = process.env.NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL?.trim() || undefined;

export const ONRAMP_READY = Boolean(API_KEY) && Boolean(API_BASE) === Boolean(WIDGET_BASE);

/** Only USDC on Arc: that's what agents and the factory use. */
export const ONRAMP_ASSETS = { pairs: [{ token: "USDC", chain: "arc" }] };

let kit: OnrampServerKit | null = null;

export function onrampServer(): OnrampServerKit {
  if (!API_KEY) throw new Error("Onramp not set up: add ONRAMP_API_KEY (see /setup)");
  if (Boolean(API_BASE) !== Boolean(WIDGET_BASE)) throw new Error("Set both ONRAMP_API_BASE_URL and NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL, or neither");
  kit ??= createOnrampServerKit({
    apiKey: API_KEY,
    baseUrl: API_BASE,
    widgetBaseUrl: WIDGET_BASE,
    // Lets the card provider's inner frame accept our page when the widget is embedded (iframe fallback).
    referrerDomain: process.env.ONRAMP_REFERRER_DOMAIN?.trim() || "www.fuci.family",
  });
  return kit;
}
