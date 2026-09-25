# Security

## Reporting a problem

Please report security issues **privately**, not in a public issue:

- open a private advisory on GitHub (**Security → Report a vulnerability**) in this repo, or
- send a DM to [@fucidotfamily](https://x.com/fucidotfamily) on X.

Tell us what you found, how to reproduce it and what it affects. We will reply as soon as we can and credit you when it's fixed, if you want.

## Good to know

- Fuci will **never** ask for your private key or seed phrase. Anyone who does is not us.
- Agent wallets are custodial and meant for small balances. Their keys are stored encrypted (AES-256-GCM) on the server.
- This repo holds **no secrets**. All keys live in environment variables (see `.env.example`). Never commit `.env` or `.env.local`.
- Agent outputs describe on-chain data only. They are not financial advice.
