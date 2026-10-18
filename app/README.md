# payrail-web

Landing page and merchant registration for Payrail, the non-custodial Solana payment gateway in
[`swastikkakran/solana-payrail`](https://github.com/swastikkakran/solana-payrail). React 19 + TypeScript + Vite,
with wallet connection through Wallet Standard and transactions built with `@solana/kit`.

Scope: the two pages only (`/` and `/register`). The dashboard, payments and settings screens from the PRD are not built.

## Run it

```bash
npm install
cp .env.example .env        # point VITE_PAYRAIL_API_URL at the backend, VITE_SOLANA_RPC_URL at a devnet RPC
npm run dev                 # http://localhost:5173
npm run build               # typecheck + production build into dist/
node scripts/verify-discriminators.mjs   # checks the hand-encoded Anchor discriminators
```

The backend (`npm run dev` in the Payrail repo) must be reachable at `VITE_PAYRAIL_API_URL` for the last
registration step. It already enables CORS for all origins. Use a Helius or QuickNode devnet URL for demos; the
public `api.devnet.solana.com` endpoint rate-limits.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_PAYRAIL_API_URL` | `http://localhost:3000/api/v1` | Backend base URL (`POST /auth/register`) |
| `VITE_SOLANA_CLUSTER` | `devnet` | `devnet` · `testnet` · `mainnet` |
| `VITE_SOLANA_RPC_URL` | public endpoint for the cluster | Reads the merchant account and submits signed transactions |
| `VITE_MERCHANT_REGISTRY_PROGRAM_ID` | `8v5vhk23…mZb38b` (Anchor.toml, devnet) | `merchant_registry` program |
| `VITE_DOCS_URL` | repo README `#api-reference` | API reference links |
| `VITE_ROUTER` | unset | `hash` for static hosts without SPA rewrites |
| `VITE_DEMO` | unset | `always` locks the build into demo mode (for a hosted preview) |

Without `VITE_ROUTER=hash`, the host must serve `index.html` for `/register` (Vercel/Netlify do this with one rewrite rule).

## Before deploying

- Set absolute URLs for the share image in `index.html` (`og:image` → `https://<your-domain>/og.png`).
- Without `VITE_ROUTER=hash`, add one SPA rewrite so `/register` serves `index.html`.

## Demo mode

Add `?demo` to any URL (`http://localhost:5173/register?demo`). The pages and the transaction code are the
real ones; three things are simulated inside the browser tab:

- **Demo Wallet**, a Wallet Standard wallet with an in-memory Ed25519 key. It shows an approval popup for
  connect and for every transaction, and signs for real.
- **The Devnet network**, as a Kit RPC transport that applies the merchant_registry rules (initialize charges
  rent, `update` flips `is_active` and only the payout wallet may sign it) and confirms after ~1.6 s.
- **Payrail's API**, returning `pk_demo_…` credentials.

A banner and a "Demo" marker in the header stay on screen the whole time. Explorer links to simulated
addresses show a notice instead of opening an empty page. State lasts for the browser tab; the banner has
Reset and Exit. Nothing is sent to Solana or the backend in demo mode.

## Demo day checklist

1. Use a dedicated Devnet RPC (Helius or QuickNode) in `VITE_SOLANA_RPC_URL`. The public endpoint rate-limits.
2. Run the backend and register once beforehand with a throwaway email. Each email can register only once, so
   keep a fresh one for the stage.
3. Prepare two Phantom accounts on Devnet: one **unregistered** with at least 0.01 SOL for the live
   registration, one **already registered** to show the active/inactive switch if time is short.
4. Open `/register` and zoom the browser to 110–125% for the projector.
5. If Wi-Fi or Devnet fails, switch to `/register?demo` and say it's the simulated mode. The banner says so too.

## Landing page sections

A "Live on Devnet" strip under the hero reads the cluster directly: program deployed, merchant accounts
(`getProgramAccounts` with dataSize 42 + discriminator memcmp, zero-length data slice; active ones add a memcmp
on `is_active` at offset 40), and the current slot with RPC latency, polled every 2.5 s while the tab is
visible. It hides itself if the RPC can't be reached, and in demo mode. Some RPC providers disable
`getProgramAccounts`; the merchant count is then left out.

Hero with a live example checkout (a real, scannable Solana Pay QR for Devnet USDC, synced with the rail
animation below it) · payment schematic · $25 order compared with Stripe US standard pricing · custody table
· Solana primitives · developer integration · roadmap from the repo history · closing CTA.
Sources for the comparison figures are linked on the page: Stripe pricing, Stripe payouts (US T+2 settlement),
Solana fee docs (5,000 lamports per signature) and Solana's reduced slot times (200 ms on mainnet since
October 9, 2026). The roadmap uses tags `v2.0.0`/`v2.0.1`, the `migration/v3` branch and the README roadmap.

## How registration works

```
connect wallet ─► read merchant PDA from Solana
                    ├─ none   ─► details form ─► simulate initialize ─► wallet signs ─► submit ─► poll until confirmed
                    │                                      ─► re-read PDA ─► POST /auth/register ─► show credentials once
                    └─ exists ─► status: active / inactive ─► wallet signs `update` to switch ─► re-read PDA
```

- **The wallet signs everything.** The page builds `initialize` / `update` in the browser, the connected wallet
  signs, and the page submits to the RPC. The backend never sees a transaction or a key. Wallets that only
  support `signAndSendTransaction` submit it themselves.
- **On-chain step first.** It is the step that proves control of the wallet, and its result is detectable
  (the PDA exists), so a failed backend save is retried on its own without another signature
  ("Finish your Payrail setup" form).
- **Simulation before the wallet opens.** Missing SOL or an existing account fail before the user sees a
  wallet prompt, with a faucet link on devnet.
- **`update` flips `is_active` instead of setting it**, so the page re-reads the account right before signing and
  refuses to send if the on-chain state no longer matches what the user saw.
- **Status comes from chain, not from the page.** After every transaction the page re-reads the merchant
  account; it never marks itself registered or active.
- **Credentials** are held only in component memory, masked by default, downloadable as `payrail.env`, and the
  page warns before unload until the user confirms they stored them.

Errors map to the PRD §25 copy: wallet rejected, insufficient SOL, already registered, wrong cluster, expired /
timed-out confirmation (with an Explorer link), RPC unreachable, backend unreachable, email taken (409), rate
limited (429). Program logs are available behind a disclosure.

## Files

```
src/
  pages/landing/       Landing.tsx, HeroCheckout.tsx, RailSchematic.tsx, Compare.tsx, Roadmap.tsx,
                       example.ts (shared example payment + animation timeline)
  demo/                mode.ts (?demo flag), wallet.ts (Demo Wallet), chain.ts (simulated RPC transport),
                       wire.ts (transaction decoder), approval.ts + DemoUi.tsx (popup, banner, Explorer guard)
  lib/vendor/          qrcodegen.ts (Nayuki QR Code generator, MIT)
  pages/register/      Register.tsx (state machine + layout), MerchantForm, Manifest (transaction preview /
                       account inspector), ProgressLog, Credentials, MerchantStatusPanel, ErrorPanel,
                       useMerchantStatus (chain reads)
  solana/              merchantRegistry.ts (PDA, decoder, instructions), sendWalletTransaction.ts, rpc.ts
  wallet/              WalletProvider (Wallet Standard discovery, silent reconnect, account-change toast),
                       ConnectWalletDialog, WalletButton (copy / Explorer / disconnect menu)
  lib/                 api.ts (backend client), errors.ts (user-facing error mapping), router, format
  styles/              base.css (tokens), components.css, landing.css, register.css
public/fonts/          Archivo + Martian Mono variable fonts (OFL, licences alongside)
```

`merchantRegistry.ts` encodes the two merchant instructions by hand because the Codama client in the backend
is git-ignored and needs `anchor build`. Function names match Codama's output, so it can be swapped for the
generated client without touching the UI.

## What was verified, and what wasn't

Verified in the build sandbox (npm was unavailable there, so the app was bundled with esbuild against
`@solana/kit` 6.10.0 and Wallet Standard built from source):

- `tsc` with the project's strict settings: no errors in `src/`.
- Chromium end-to-end run with a scripted Wallet Standard wallet that signs with a real Ed25519 key, against a
  mocked devnet RPC and backend: connect, validation, registration, credentials, deactivate, activate, the
  stale-state guard, wallet rejection, no-SOL, email-taken recovery, wrong cluster, returning merchant.
- The submitted `initialize` transaction, decoded byte by byte: v0 message, one instruction, program
  `8v5vhk23…`, data = `initialize` discriminator, accounts `[wallet (writable signer, fee payer), PDA (writable),
  system program (readonly)]`, valid wallet signature. `update` checked the same way.
- The merchant PDA derived by the page matches an independent derivation (sha256 + Ed25519 off-curve check)
  of `seeds = [b"merchant", wallet]`.
- Demo mode end to end with no mocks: connect, register, credentials, deactivate, rejected activation,
  reload, navigation, reset, exit. No requests left the page.
- The hero QR decodes (OpenCV) to the exact Solana Pay URL in `example.ts`.
- No horizontal overflow at 390, 834 and 1440 px.

Not verified: a real wallet extension against the real devnet program (the sandbox could not reach Solana RPC
endpoints), and `npm install` / `vite build` with the exact registry versions in `package.json`.
Run `npm run build` and one registration on devnet with Phantom before presenting.

## Backend gaps found while building this

1. **No `GET /merchant/status`** (PRD §20). The page reads the merchant PDA directly from Solana instead, which is
   authoritative. `useMerchantStatus.ts` is the one place to change when the endpoint exists.
2. **`name` is not in the register schema.** The page sends it, and zod's default object parsing drops it.
   Add `name` to `registerMerchantSchema` and the Merchant model to keep it.
3. **`POST /auth/register` does not check wallet ownership.** Anyone can register any `payoutWallet` and receive
   its webhooks. Require a wallet-signed message (Sign In With Solana) or check the on-chain merchant account,
   which only that wallet can create, before issuing credentials.
4. **`is_active` is not enforced.** Neither `create_payment` nor the backend checks it, so "inactive" is advisory
   today. The UI says payments "may be rejected", following the PRD wording.
5. **`update` toggles rather than sets.** A `set_active(bool)` instruction would remove the read-before-sign
   race the frontend currently guards against.
