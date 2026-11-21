# toops

Bitcoin Cash betting platform built for **BCH BLAZE 2026**. Four provably fair PvP games staked in **PUSD** (a BCH CashToken), backed by a custodial HD wallet with on-chain deposits, withdrawals, and CashScript escrow. Development targets **chipnet**.

One Next.js 16 app — UI, API routes, and game engines in a single project. There is no separate backend server.

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router, Turbopack) · React 19 · TypeScript |
| Styling | Tailwind CSS v4 (PostCSS plugin) |
| Database | Postgres on Supabase · Prisma 6 |
| Auth | Telegram Login Widget + WizardConnect challenge transaction (no Reown project ID) |
| Custody | HD platform wallets (`m/44'/145'/0'/0/<index>`); xpriv in env, xpub + addresses in the DB |
| Contracts | CashScript 0.14 → `PlatformTreasury`, `MatchEscrow` |
| BCH | `@bitauth/libauth`, `@xo-cash/*` (XO Stack), `@mr-zwets/cauldron-swap-sdk` |
| Tests | Vitest · Testing Library · happy-dom |
| Lint / format | oxlint · Prettier |
| Hosting | Vercel |

## Games

| Game | Route | Format |
| --- | --- | --- |
| Pocket Dice | `/originals/pocket-dice` | Shared pot, pooled table |
| Roulette | `/originals/roulette` | Shared pool, 15 slots (7 red / 7 black / 1 green) |
| Mines Duel | `/originals/mines` | Real-time 1v1, shared 35-tile board |
| Crash (Dual) | `/originals/crash` | Real-time 1v1 multiplier race |
| Rando | `/originals/rando` | Coming-soon placeholder |

Catalogue pages are `/multiplayer` (Pocket Dice, Roulette) and `/dual` (Mines, Crash). `/play` drops a player back into whatever they already have in flight — a queued ticket or an open match — and otherwise lands on `/multiplayer`.

Stakes are **0.20 – 1,000.00 PUSD** across every game. Mines and Crash withhold a **1% platform fee**; payouts are credited in the same Postgres transaction that writes the ledger entry.

## Requirements

- Node.js 20.9+ (tested on 22)
- pnpm (`packageManager` pins `pnpm@12.18.0`)

## Getting started

```bash
pnpm install                 # postinstall runs `prisma generate`
cp .env.example .env.local   # Windows: copy .env.example .env.local
pnpm db:deploy:local         # apply migrations to your Supabase database
pnpm dev
```

App: http://localhost:3000 · health: `GET /api/health`

## Environment variables

`.env.local` is gitignored; `.env.example` is the template. Only `NEXT_PUBLIC_*` values reach the browser.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_BCH_NETWORK` | Network shown to the browser (`chipnet` / `mainnet`) |
| `NEXT_PUBLIC_APP_NAME` | Brand name |
| `NEXT_PUBLIC_EMBER2026_ADDRESS` | CashTokens address in the top banner for EMBER2026 votes |
| `BCH_NETWORK` | Server-side network switch |
| `ELECTRUM_WSS_URL` | Electrum WebSocket endpoint |
| `DATABASE_URL` | Supabase **transaction pooler** (`:6543`, `?pgbouncer=true&connect_timeout=15`) |
| `DIRECT_URL` | Supabase **session pooler** (`:5432`); Prisma migrations use this |
| `TELEGRAM_BOT_TOKEN` | BotFather token; also verifies Login Widget payloads |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Widget bot username, without `@` |
| `PLATFORM_WALLET_XPRIV` | HD master or account key. Secret manager only |
| `PLATFORM_WALLET_XPUB` | Optional; derived from the xpriv when unset |
| `WITHDRAWAL_FEE_SATS` | BCH network fee withheld from the balance |
| `PUSD_TOKEN_ID` | CashToken category; per-network default when unset |
| `PUSD_DECIMALS` · `PUSD_DUST_SATS` | Token precision (`2`) and dust per output |
| `PARYON_API_URL` | Paryon oracle/stats API for the BCH/USD peg and swaps |
| `BCH_USD_PRICE` | Offline fallback price |
| `MIN_WITHDRAWAL_PUSD` | Minimum withdrawal |
| `CRON_SECRET` | Shared secret for the cron routes (`Authorization: Bearer`, or `x-cron-secret`) |
| `PLATFORM_TREASURY_{PRIVATE_KEY,PUBLIC_KEY,LOCKING_BYTECODE}` | PlatformTreasury admin key material |
| `REDIS_URL` | Optional. Ephemeral match state + SSE pub/sub bus |

Use the transaction pooler for `DATABASE_URL` and the session pooler for `DIRECT_URL`. The longer connect timeout absorbs transient `P1001` errors while Supabase resumes a pooled connection. Apply migrations before adding users: wallet creation needs the `platform_wallet_index_seq` sequence the HD migration creates.

**Telegram sign-in:** create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`), set the token and username, then register the serving domain with `/setdomain` — the Login Widget refuses to embed elsewhere. Use a tunnel (ngrok) or the deployed URL for local testing.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next.js dev server (Turbopack) |
| `pnpm build` | `prisma generate` + production build |
| `pnpm start` | Serve the production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` · `pnpm format` · `pnpm format:check` | oxlint · Prettier write · Prettier check |
| `pnpm test` · `pnpm test:watch` · `pnpm test:coverage` | Vitest |
| `pnpm contracts:compile` | Compile both `.cash` sources into `src/contracts/*.json` |
| `pnpm db:generate` | Regenerate Prisma Client |
| `pnpm db:migrate` | Create/apply a dev migration against `.env.local` |
| `pnpm db:deploy` | Apply committed migrations using ambient env vars (Vercel) |
| `pnpm db:deploy:local` | Apply committed migrations using `.env.local` |
| `pnpm db:studio` | Prisma Studio |


Import from the source root with the `@` alias: `import { formatPusdUnits } from '@/lib/pusd'`.

## Architecture

**Server-authoritative games.** Each game is a `src/lib/<game>/` module — pure `rules.ts`, `fair.ts`, and a `'server-only'` `engine.ts` — behind `/api/<game>/*` route handlers. The client holds no game state; it polls or streams and re-renders. Matchmaking and settlement run inside `prisma.$transaction` guarded by `pg_advisory_xact_lock`, so concurrent requests across function instances cannot double-spend or double-match.

**Money.** `User.balancePusd` is the source of truth, in PUSD base units (2 decimals, 100 units per PUSD). Every movement appends a `LedgerEntry` with a `balanceAfterPusd` snapshot and an idempotency `ref`. Stakes are debited with a conditional decrement, so a request that cannot cover the stake fails rather than overdrawing. Unit helpers: `src/lib/pusd.ts` (client-safe), `src/lib/pusd-server.ts` (token config + oracle).

**Custody.** Three layers: `PLATFORM_WALLET_XPRIV` lives only in the deployment secret manager; the database stores just public addresses and derivation indexes; private keys are derived in memory inside `POST /api/wallet/withdraw` and dropped immediately. One deposit address per user, allocated atomically from a Postgres sequence.

**Deposits and withdrawals.** `POST /api/wallet/sync` scans the caller's address over Electrum, credits confirmed PUSD outputs 1:1, and swaps BCH through Cauldron (falling back to the oracle rate, retaining the BCH as payout reserve). `GET /api/cron/sync-deposits` scans a batch and is `CRON_SECRET`-protected. Withdrawals pay PUSD or BCH, only ever to `User.bchAddress`, and reserve the amount before broadcast, refunding if the broadcast fails.

**Contracts.** Mines and Crash pots are locked in the CashScript `MatchEscrow` contract, with the fee forced to `PlatformTreasury`; after 144 blocks either player can force a full refund. Settlement enforces the pre-published `serverSeedHash` on-chain, so the fairness commitment cannot be substituted after the fact.

**Provable fairness.** Every round publishes `sha256(serverSeed)` before betting closes, derives outcomes from HMAC-SHA256 over that seed, and reveals the seed at settlement. `/api/mines/verify` and `/api/dual/verify` replay a finished round from its seeds; Roulette re-draws independently on a void spin.

**Realtime.** Serverless functions cannot accept WebSocket upgrades, so live games use Server-Sent Events (`GET /api/mines/events`, `/api/chat/stream`) with throttled `POST`s for inputs, presence, and cursors. Timers are enforced lazily on state/pick routes and by a tick inside the stream, so a dropped connection cannot stall a match.

**Auth.** Sessions are 32-byte random tokens stored as SHA-256 hashes and sent as an httpOnly, SameSite=Lax cookie for 30 days; raw tokens are never persisted. Telegram payloads are verified server-side with HMAC-SHA256 (24-hour freshness). Wallet sign-in uses a single-use synthetic challenge transaction (10-minute TTL) verified with libauth, since WizardConnect exposes no message signing.

**Server vs client.** Wallet and XO engine libraries use `localStorage`, `WebSocket`, and IndexedDB — keep them in `'use client'` files, and load engine-touching components with `dynamic(() => import(...), { ssr: false })`. Server-only modules import `server-only` so an accidental client import fails the build.

## Deployment

1. Push the repo to GitHub and import it in Vercel; the preset is detected as Next.js. Keep the default build command — `postinstall` already runs `prisma generate`.
2. Add every `.env.example` variable under **Settings → Environment Variables**. Keep `PLATFORM_WALLET_XPRIV`, `PLATFORM_TREASURY_PRIVATE_KEY`, and `CRON_SECRET` in encrypted vars or a secret manager.
3. Apply migrations with `pnpm db:deploy` once from a machine that has the production `DATABASE_URL`/`DIRECT_URL`, or prefix the build command with it.
4. Register the deployment domain with BotFather (`/setdomain`).
5. Add Vercel Cron entries for `GET /api/cron/sync-deposits` and `GET /api/cron/dual` (dashboard or a `vercel.json`), each sending `CRON_SECRET`.

## Security

- **Custodial by design.** The deployment holds the master xpriv and signs user withdrawals — acceptable for a hackathon demo, not for production funds. Before mainnet: KMS/HSM or MPC custody, withdrawal limits, rate limiting, auditing.
- **Key separation.** A database leak exposes only public addresses and balances. The xpriv stays in the secret manager; the xpub can derive addresses but cannot spend.
- **Replay protection.** Wallet challenges are single-use and expire after 10 minutes; Telegram payloads are rejected after 24 hours.
- **Payout allowlist.** Withdrawals refuse any destination other than the linked `User.bchAddress`.
- **Mainnet.** Switching networks requires fresh `PLATFORM_WALLET_XPRIV`/`XPUB` keys and re-running migrations; the address prefix changes to `bitcoincash:`.

## BCH BLAZE 2026

- Baseline demo (work frozen at the fork point): https://toops1.vercel.app/
- Baseline code: [`nov-14-baseline`](https://github.com/ChijiokeDivine/toops/tree/nov-14-baseline) · active repo: https://github.com/ChijiokeDivine/toops-v2
- The project deck is served full-page at `/slide` and linked from the top banner as **Widget Factory Deck**.
- Submission details (banner links and the EMBER2026 payout address) live in [`src/lib/hackathon.ts`](src/lib/hackathon.ts).

## Notes

- `@xo-cash/engine` is pinned to the `next` release (`0.1.0-next.*`) because the stack is in active development; upgrade with `pnpm add @xo-cash/engine@next`. The other `@xo-cash/*` packages are pinned to the exact versions the engine expects — upgrade them together.
- `serverExternalPackages` in [`next.config.ts`](next.config.ts) keeps native XO storage modules (`better-sqlite3`, `sqlite3`, `canvas`), `@prisma/client`, and `ioredis` out of server bundles.
- Anything that needs a long-running process (a socket server, a background worker) does not fit Vercel Functions — keep that logic client-side or on-chain.
- Next.js 16 generates `AGENTS.md` and `next-env.d.ts`; both are safe to commit.
