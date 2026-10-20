# Payrail

**A non-custodial payment gateway for Solana merchants.**
Customers pay the merchant's wallet directly. Payrail tags every order, verifies the payment on-chain, records it on Solana, and notifies the merchant with a signed webhook.

<!-- Add a demo video or GIF here -->

> Built as the final project for the Solana School Fall 2026 cohort's Demo Day. It is a working prototype and a portfolio piece, not production payments infrastructure. See [Scope and known limitations](#scope-and-known-limitations) for an honest list of what it does not do.

**Contents:** [The problem](#the-problem) · [What Payrail does](#what-payrail-does) · [How it works](#how-it-works) · [Core concepts](#core-concepts) · [Architecture](#architecture) · [On-chain program](#on-chain-program) · [Getting started](#getting-started) · [API reference](#api-reference) · [Webhooks](#webhooks) · [Security design](#security-design) · [Scope and known limitations](#scope-and-known-limitations)

---

## The problem

Accepting crypto payments sounds simple: the customer sends money to your wallet. In practice, three things get in the way.

1. **A transfer is not an order.** Two customers can send exactly 0.05 SOL to the same wallet. The chain only records "someone paid 0.05 SOL", not which order each payment belongs to.
2. **The plumbing is hard to get right.** A merchant has to watch the chain, check the amount, token and recipient of each transaction, survive dropped connections, and notify their own server. Each of these is a place for bugs.
3. **Custodial gateways hold the money.** Traditional processors sit between buyer and merchant, take custody of the funds, and pay out later.

## What Payrail does

Payrail is the layer in the middle. A merchant registers once and then creates payment requests through a REST API. For each request Payrail returns a [Solana Pay](https://docs.solanapay.com/) URL to show as a QR code or link.

- **Funds never touch Payrail.** The customer's wallet sends SOL or USDC straight to the merchant's payout wallet.
- **Every order gets a unique reference key**, so identical payments can still be told apart.
- **Payrail verifies, records and notifies.** It watches the chain, checks that reference, amount, token and recipient all match, writes the result to an on-chain Payment account, and sends the merchant a signed `payment.confirmed` webhook.
- **It recovers from outages.** If the server was offline when a payment landed, a recovery sweep finds it afterwards.

## Highlights

- Non-custodial: buyer → merchant, directly
- Solana Pay payment requests with one-time reference keys
- Live detection over WebSocket, plus a recovery sweep for missed events
- Four-field verification: reference, amount, token, recipient
- On-chain merchant registry and per-payment records (Anchor program)
- HMAC-SHA256 signed webhooks with automatic retries
- Wallet-based sign-in using single-use signed challenges
- React merchant app with a fully simulated demo mode

## How it works

```mermaid
sequenceDiagram
    participant M as Merchant server
    participant P as Payrail API
    participant C as Anchor program
    participant W as Customer wallet
    participant N as Solana RPC

    M->>P: POST /payments (amount, currency)
    P->>P: generate fresh reference keypair
    P->>C: create_payment (oracle-signed)
    P-->>M: solanaPayUrl + payment record
    M-->>W: show QR code or link
    W->>N: transfer to merchant wallet, including the reference
    N-->>P: log notification (WebSocket)
    P->>N: fetch the transaction
    P->>P: match reference, amount, token, recipient
    P->>C: mark_paid (oracle-signed)
    P-->>M: webhook payment.confirmed (HMAC-signed)
```

1. **Onboard.** The merchant connects a wallet and signs an `initialize` transaction that creates their on-chain Merchant account. They then register with the backend, which checks that this account exists and returns an API key, API secret and webhook secret (shown once).
2. **Create.** The merchant's server calls `POST /api/v1/payments`.
3. **Record.** Payrail generates a fresh reference keypair, builds the Solana Pay URL, creates a Payment PDA on-chain, and saves the pending payment in MongoDB. The request is valid for 15 minutes.
4. **Pay.** The customer scans the QR code or opens the link in a Solana Pay compatible wallet and approves the transfer. SOL or USDC goes directly to the merchant.
5. **Verify.** A per-merchant WebSocket subscription sees the transaction. Payrail fetches it and checks reference, amount, token and recipient.
6. **Confirm and notify.** The payment is marked confirmed, the Payment PDA is marked paid on-chain, and a signed webhook is sent to the merchant.

## Core concepts

### The reference key

For every payment request, Payrail generates a **fresh keypair and uses only its public key** as the reference. The reference is added to the Solana Pay transfer as a read-only, non-signer account. It never receives funds and never signs anything. Its only job is to tag the transaction, so that two orders with the same amount and the same recipient still produce different, matchable transactions.

### Four-field verification

A payment is confirmed only when the observed transaction matches the pending order on all four fields:

| Field | Meaning |
| --- | --- |
| **Reference** | Order identity: the fresh public key for this order |
| **Amount** | The exact quantity, compared in base units |
| **Token** | SOL, or the configured USDC mint |
| **Recipient** | The merchant's payout wallet |

An event on the chain is not proof of payment by itself. Only a full match confirms it.

### Payment lifecycle

`pending` → `confirmed`, `failed` or `expired`. A request expires 15 minutes after creation.

### Live detection and recovery

Payrail holds one `logsNotifications` WebSocket subscription per merchant payout wallet, with automatic reconnect. WebSocket events are transient, so on startup and on every re-subscription Payrail also runs a **recovery sweep**: it inspects the most recent 50 transactions for the merchant's wallet and runs them through the same verifier used for live detection.

## Architecture

```mermaid
flowchart LR
    MS["Merchant server"] -->|"REST + API key"| API["Payrail API<br/>Express 5, TypeScript"]
    APP["Merchant web app<br/>React, Vite"] -->|"wallet sign-in"| API
    API --> DB[("MongoDB<br/>merchants, payments, webhook deliveries")]
    API -->|"create_payment, mark_paid"| PRG["Anchor program<br/>Merchant + Payment PDAs"]
    WATCH["Watcher + verifier"] -->|"logsNotifications"| RPC["Solana RPC"]
    API --- WATCH
    CUST["Customer wallet"] -->|"SOL / USDC transfer"| MW["Merchant payout wallet"]
    WATCH -->|"signed webhook"| MS
```

Two paths run side by side:

- **Funds path:** customer wallet → merchant payout wallet. Direct, no custody.
- **Evidence path:** watcher → verifier → Payment PDA + MongoDB → webhook.

## On-chain program

`merchant_registry` is an Anchor program deployed on devnet at
`8v5vhk23UWumv3ReypP8hetreRsLFMcACDhrn2mZb38b`.

| Instruction | Signer | What it does |
| --- | --- | --- |
| `initialize` | Merchant wallet | Creates the Merchant PDA, seeded by the payout wallet |
| `update` | Merchant wallet | Toggles the merchant's active flag |
| `create_payment` | Payrail oracle | Creates a Payment PDA (seeded by merchant and reference hash) holding amount and mint |
| `mark_paid` | Payrail oracle | Marks a payment as paid |

The oracle's public key is hard-coded in the program as `ORACLE_AUTHORITY`, and the backend refuses to start if the loaded keypair does not match it. The TypeScript client is generated from the program's IDL with [Codama](https://github.com/codama-idl/codama).

## Tech stack

| Layer | Technology |
| --- | --- |
| Program | Rust 1.89, Anchor 1.x |
| Client generation | Codama |
| Backend | Node.js, Express 5, TypeScript, MongoDB (Mongoose), Zod, `@solana/kit`, `@solana/pay`, pino |
| Frontend | React 19, Vite, `@solana/kit`, wallet-standard |

## Repository layout

```
programs/merchant-registry/   Anchor program (Rust)
  src/instructions/           initialize, update, initialize_payment, mark_paid
  src/state/                  Merchant and Payment accounts
backend/                      API, watcher and verifier
  src/controllers, routes/    HTTP layer
  src/services/               auth, payments, Solana verification, webhooks
  src/watcher/                per-merchant subscription manager
  src/onchain/                typed wrappers over the generated client
  src/models/                 Mongoose models
app/                          React merchant app (landing, registration, dashboard)
tests/                        Anchor program tests (run against devnet)
codama.json                   Codama config for client generation
```

## Getting started

### Prerequisites

- Node.js 20+ and npm
- A MongoDB instance (local or Atlas)
- A Solana **devnet** RPC endpoint with a WebSocket URL. A provider such as Helius or QuickNode is recommended, because the public devnet endpoint rate-limits.
- A funded devnet keypair for the **oracle**. It must match `ORACLE_AUTHORITY` in the program, and it pays fees and rent for each payment record.
- Rust, the Solana CLI and Anchor, only if you want to rebuild or redeploy the program

### Install

```bash
git clone https://github.com/swastikkakran/solana-payrail.git
cd solana-payrail
npm install
(cd backend && npm install)
(cd app && npm install)
```

### Configure the backend

Create `backend/.env`:

```bash
MONGO_URI=mongodb://localhost:27017/payrail
SOLANA_RPC_URL=https://<your-devnet-rpc>
SOLANA_RPC_WSS_URL=wss://<your-devnet-rpc>
USDC_MINT_ADDRESS=<usdc mint to accept>
ORACLE_KEYPAIR_PATH=/path/to/oracle-keypair.json
ENCRYPTION_MASTER_KEY=<64 hex characters>   # openssl rand -hex 32
PAYRAIL_APP_URL=http://localhost:5173
PORT=3000
```

| Variable | Description |
| --- | --- |
| `MONGO_URI` | MongoDB connection string |
| `SOLANA_RPC_URL` / `SOLANA_RPC_WSS_URL` | Devnet HTTP and WebSocket endpoints |
| `USDC_MINT_ADDRESS` | The USDC mint Payrail accepts |
| `ORACLE_KEYPAIR_PATH` | Path to the oracle keypair JSON file |
| `ENCRYPTION_MASTER_KEY` | 32-byte key as 64 hex characters; encrypts webhook secrets |
| `PAYRAIL_APP_URL` | The single allowed CORS origin (default `http://localhost:5173`) |
| `PORT` | API port (default `3000`) |
| `LOG_LEVEL` | Optional pino log level |

### Run

```bash
# API and watcher  ->  http://localhost:3000
cd backend && npm run dev

# merchant app  ->  http://localhost:5173
cd app && npm run dev
```

### Demo mode

The merchant app can run entirely in the browser, with a simulated wallet, Solana network and Payrail API. Nothing leaves the page, so it works with no backend, wallet or RPC.

- Add `?demo` to the app URL to switch it on for the tab, or `?demo=off` to switch it off.
- Build with `VITE_DEMO=always` to lock the app into demo mode.

### Rebuild the program and client

```bash
anchor build        # builds the program and IDL
npm run codegen     # regenerates the TypeScript client from the IDL
```

### Tests

```bash
npm test
```

Runs the Anchor program tests with ts-mocha against **devnet**, using the wallet from `Anchor.toml` and the keypairs in `tests/fixtures/`. The tests cover creating a merchant, toggling its active state, creating a payment, marking it paid, and rejecting `mark_paid` from an unauthorized signer.

## API reference

Base path: `/api/v1`. Request bodies are limited to 16 KB and a global rate limit applies.

Payment endpoints authenticate with two headers:

```
x-api-key: <apiKey>
x-api-secret: <apiSecret>
```

### Auth

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | none | Register a merchant (`name`, `email`, `webhookUrl`, `payoutWallet`). Requires the on-chain Merchant account to exist. Returns `apiKey`, `apiSecret` and `webhookSecret` once. |
| `POST` | `/auth/rotate` | API key | Rotate API credentials. The previous pair stays valid for 24 hours. |
| `DELETE` | `/auth` | API key | Delete the merchant (blocked while payments are pending). |
| `POST` | `/auth/challenge` | none | Get a single-use sign-in message for a wallet. |
| `POST` | `/auth/verify` | none | Verify the wallet signature and start a cookie session. |
| `POST` | `/auth/logout` | session | End the session. |
| `GET` | `/auth/me` | session | Current merchant. |

### Payments

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/payments` | Create a payment request |
| `GET` | `/payments` | List payments, optionally filtered by status |
| `GET` | `/payments/:paymentId` | Get one payment |

```bash
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "x-api-key: $PAYRAIL_API_KEY" \
  -H "x-api-secret: $PAYRAIL_API_SECRET" \
  -d '{"amount": 0.5, "currency": "SOL", "label": "Coffee", "message": "Order #42"}'
```

| Field | Type | Notes |
| --- | --- | --- |
| `amount` | number | Greater than 0, at most 1,000,000 |
| `currency` | `"SOL"` or `"USDC"` | |
| `label` | string, optional | Up to 100 characters |
| `message` | string, optional | Up to 500 characters |

The response includes a `solanaPayUrl` (render it as a QR code or link) and the stored `paymentRequestData`.

## Webhooks

When a payment is confirmed, Payrail sends a `POST` to the merchant's `webhookUrl`:

```json
{
  "event": "payment.confirmed",
  "data": {
    "paymentId": "...",
    "reference": "<reference public key>",
    "amount": 0.5,
    "currency": "SOL",
    "transactionSignature": "...",
    "payerWallet": "...",
    "confirmedAt": "2026-10-19T10:00:00.000Z"
  }
}
```

The request carries an `x-webhook-signature` header: the hex HMAC-SHA256 of the **raw request body**, keyed with the merchant's `webhookSecret`. Verify it against the raw bytes, not re-serialized JSON:

```js
import crypto from "node:crypto";

function isValid(rawBody, signatureHeader, webhookSecret) {
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader ?? "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

Respond with any `2xx` to acknowledge. Failed deliveries are retried up to three times, after 1 minute, 5 minutes and 30 minutes.

## Security design

- **Webhook secrets** are encrypted at rest with AES-256-GCM, because the server needs to recover them to sign payloads.
- **API secrets** are stored only as bcrypt hashes, because the server only needs to compare them.
- **Sessions** use random tokens stored hashed, delivered in cookies.
- **Wallet sign-in** uses single-use, expiring challenges signed by the merchant's wallet.
- **Credential rotation** keeps the previous pair valid for 24 hours.
- **Input handling:** all request bodies are validated with Zod and size-limited, and CORS is restricted to one configured origin.
- **Non-custodial by design:** Payrail never holds funds or any key that can move them. The only key it holds is the oracle key, which can write payment records but not move merchant money.

## Scope and known limitations

Payrail is a demo-day prototype. This is what it deliberately does not cover.

**In scope:** SOL and USDC payments on devnet, reference-based matching, live detection with recovery, on-chain records, signed webhooks, wallet sign-in.

**Out of scope:** refunds, Token-2022 and other SPL tokens, recurring payments, and production-scale queueing or multi-instance orchestration.

**Known limitations**

- **Trust model.** On-chain payment records are written by a single oracle key that is hard-coded in the program. They are an audit trail of what Payrail attested, not independent or trustless settlement proof. `mark_paid` does not store a transaction signature or payer.
- **Dashboard.** Outside demo mode, the dashboard cannot list or create payments. The payment endpoints only accept API-key auth, and no session-authenticated payment route exists yet. The full payment flow works through the API.
- **Registration.** Registering checks that the on-chain Merchant account exists but does not require a wallet signature, so wallet ownership is not proven at registration.
- **Webhook hardening.** Merchant webhook URLs have no SSRF protection, deliveries have no request timeout, and signatures carry no timestamp, so there is no replay protection.
- **Oracle cost.** The oracle pays rent for every payment record, and there is no instruction to close and reclaim it.
- **USDC edge case.** Verification expects the merchant's USDC token account to exist before the payment.
- **Watcher robustness.** Pending payments only move to `expired` during a merchant's recovery sweep. A failed subscription is not retried, confirmation is not atomic (so a race can send duplicate webhooks), and a failed `mark_paid` is not retried. The recovery sweep covers only the latest 50 transactions per wallet.
- **Scale.** One log subscription per merchant, and the webhook retry timer runs inside the API process.
- **Testing.** The program tests run against devnet. There are no backend tests, including none for payment verification.

## License

MIT. See [LICENSE](./LICENSE).

---

Built by [Swastik Kakran](https://github.com/swastikkakran).