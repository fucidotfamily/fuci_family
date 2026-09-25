# Contributing

Thanks for helping grow the forest.

1. Fork the repo and create a branch.
2. `npm install`, then `cp .env.example .env.local` (all values are optional for local work).
3. Make your change. Keep pull requests small and focused on one thing.
4. Before opening a PR, run:

   ```bash
   npm run lint
   npm run typecheck
   npm run build
   ```

5. Open a pull request that says what changed and why.

**Rules**

- Never commit keys, `.env` files or wallet secrets.
- Show only real on-chain data. No fake or sample numbers.
- Keep the wording in the UI simple English.

Security problems go through [SECURITY.md](SECURITY.md), not public issues.
