import crypto from "node:crypto";

/**
 * "Connect X" for agent cards: X OAuth 2.0 (authorization code + PKCE, confidential client).
 * Only the profile is read (users.read); no tokens are stored.
 * Needs an X developer app: X_CLIENT_ID and X_CLIENT_SECRET, with callback
 * URL https://www.fuci.family/api/x/callback (and any other origin you use).
 */
export const X_ENABLED = Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET);

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function pkce() {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge, state: b64url(crypto.randomBytes(24)) };
}

export function authorizeUrl(p: { state: string; challenge: string; redirectUri: string }) {
  const u = new URL("https://x.com/i/oauth2/authorize");
  u.search = new URLSearchParams({
    response_type: "code",
    client_id: process.env.X_CLIENT_ID!,
    redirect_uri: p.redirectUri,
    scope: "users.read tweet.read",
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
  }).toString();
  return u.toString();
}

const basic = () => `Basic ${Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString("base64")}`;

export type XProfile = { id: string; username: string; name: string; avatar: string | null; verified: boolean };

/** Exchange the code, read the user's profile, then revoke the token. */
export async function xProfile(code: string, verifier: string, redirectUri: string): Promise<XProfile> {
  const tokenRes = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: { Authorization: basic(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier, client_id: process.env.X_CLIENT_ID! }),
    signal: AbortSignal.timeout(10_000),
  });
  const token = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
  if (!token.access_token) throw new Error(`X login failed: ${token.error_description ?? token.error ?? tokenRes.status}`);
  try {
    const meRes = await fetch("https://api.x.com/2/users/me?user.fields=profile_image_url,verified,verified_type,name,username", {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const me = (await meRes.json().catch(() => ({}))) as { data?: { id: string; username: string; name: string; profile_image_url?: string; verified?: boolean; verified_type?: string } };
    if (!me.data) throw new Error(`Could not read your X profile (HTTP ${meRes.status})`);
    return {
      id: me.data.id,
      username: me.data.username,
      name: me.data.name,
      // X serves 48px "_normal" avatars by default; ask for the 400px one.
      avatar: me.data.profile_image_url?.replace("_normal.", "_400x400.") ?? null,
      verified: Boolean(me.data.verified || (me.data.verified_type && me.data.verified_type !== "none")),
    };
  } finally {
    await fetch("https://api.x.com/2/oauth2/revoke", {
      method: "POST",
      headers: { Authorization: basic(), "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: token.access_token, token_type_hint: "access_token", client_id: process.env.X_CLIENT_ID! }),
    }).catch(() => undefined);
  }
}
