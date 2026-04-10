# Hazina Data Escrow

> *Hazina* means **treasure** in Swahili.

A Web3 data marketplace where **sellers** list valuable on-chain intelligence (whale wallets, trading signals, DeFi yields) and **buyers** purchase access using micropayments on the Stellar blockchain. An AI agent (Claude) automatically summarizes every dataset purchase.

---

## Table of Contents

1. [What Is Hazina?](#what-is-hazina)
2. [Do You Need a Smart Contract?](#do-you-need-a-smart-contract)
3. [How the App Works — The Full Flow](#how-the-app-works)
4. [Tech Stack](#tech-stack)
5. [Project Structure](#project-structure)
6. [Getting Started](#getting-started)
7. [Pages & Features](#pages--features)
8. [API Reference](#api-reference)
9. [Payment Flow Deep Dive](#payment-flow-deep-dive)
10. [What to Do Next](#what-to-do-next)

---

## What Is Hazina?

Think of Hazina as a **data marketplace** — like Gumroad, but for crypto intelligence data and paid with blockchain micropayments.

- A **seller** (e.g. a DeFi researcher) uploads a dataset of whale wallet movements and sets a price (e.g. $0.05 per query).
- A **buyer** (e.g. a trader) browses the marketplace, finds the dataset, and pays $0.05 in USDC on the Stellar blockchain.
- The backend **verifies the payment** happened on-chain, then **releases the data** to the buyer along with an **AI-generated summary** from Claude.
- The seller automatically earns **95%** of every sale. The platform keeps **5%**.

No middlemen. No sign-ups with passwords. Just a blockchain payment and instant data delivery.

---

## Do You Need a Smart Contract?

**Short answer: No — not for this MVP.**

Here is the honest breakdown:

| Approach | What It Means | When To Use It |
|----------|--------------|----------------|
| **Current (what you have)** | Payments go on Stellar blockchain. Your backend server checks the blockchain to confirm payment, then releases data. | MVP, hackathon, early product. You control the server. |
| **With a Smart Contract** | The escrow logic lives on-chain. No server needed. Code enforces the rules trustlessly. | Production where you need full trustlessness — buyers don't have to trust your server. |

**Why you don't need one yet:**
- Stellar doesn't support smart contracts the same way Ethereum does (Stellar uses its own protocol).
- Your backend already does what a smart contract would do: hold the data, verify payment, release it.
- Adding Solidity/EVM smart contracts would mean switching blockchains (to Base, Ethereum, etc.) — a bigger project.

**When to add one:**
- If you move to an EVM chain (Ethereum, Base, Polygon) and want buyers to trust zero servers.
- If you want data access NFTs or token-gating.
- For now, ship what you have.

---

## How the App Works

Here is the complete flow from start to finish, in plain English:

### Step 1 — A Seller Lists Their Data

```
Seller visits /sell
  → Fills out a form (dataset name, description, price in USDC, their Stellar wallet address)
  → Uploads their data as JSON
  → Clicks "List Dataset"
  → Backend saves it to the database
  → Dataset appears on the marketplace
```

The seller's wallet address is stored so payments route to them automatically (95% of each sale).

---

### Step 2 — A Buyer Browses the Marketplace

```
Buyer visits /marketplace
  → Sees a grid of datasets (whale wallets, DeFi yields, NFT floors, etc.)
  → Can filter by type, sort by price or popularity, search by name
  → Clicks "Query Dataset" on any card
  → A modal (popup) opens with dataset details
```

---

### Step 3 — The x402 Payment Flow

This is the core of the app. The "x402" name comes from HTTP status code 402 (Payment Required).

```
┌─────────────┐                    ┌─────────────┐                ┌───────────────┐
│   Browser   │                    │   Backend   │                │  Stellar      │
│  (Buyer)    │                    │   Server    │                │  Blockchain   │
└──────┬──────┘                    └──────┬──────┘                └───────┬───────┘
       │                                  │                               │
       │  POST /api/query/:id             │                               │
       │ ─────────────────────────────►  │                               │
       │                                  │                               │
       │  ◄─────────────────────────────  │                               │
       │  402 Payment Required            │                               │
       │  { address, amount, memo }       │                               │
       │                                  │                               │
       │  (Buyer pays USDC on Stellar)    │                               │
       │ ─────────────────────────────────────────────────────────────►  │
       │                                  │                               │
       │  POST /api/verify/:id            │                               │
       │  { txHash }                      │                               │
       │ ─────────────────────────────►  │                               │
       │                                  │  Check txHash on Horizon API  │
       │                                  │ ─────────────────────────────►│
       │                                  │  ◄─────────────────────────── │
       │                                  │  Payment confirmed ✓           │
       │                                  │                               │
       │  ◄─────────────────────────────  │                               │
       │  200 OK { data, AI summary }     │                               │
       │                                  │                               │
```

**In plain English:**
1. Buyer clicks "Query" → backend says "Pay $0.05 to this Stellar address with memo ABC123"
2. Buyer sends USDC on Stellar testnet
3. Buyer submits the transaction hash to the backend
4. Backend calls Stellar's public API (Horizon) to confirm: "Did this transaction happen? Was the amount right? Was the memo correct?"
5. If yes → backend sends back the dataset + Claude AI summary
6. If no → rejected

**Why is this secure?**
- The memo ties the payment to a specific dataset query
- The backend checks the exact amount, address, and memo
- Each transaction hash can only be used once (replay attack prevention)
- Transactions expire after 5 minutes

---

### Step 4 — Data + AI Summary Delivered

```
Buyer receives:
  ✓ Raw dataset (JSON)
  ✓ AI-generated summary ("Here are the top 3 insights from this data...")
  ✓ Answer to any custom question they asked
```

The AI summary is generated by Claude (Anthropic's API) automatically when the payment clears.

---

### Step 5 — Seller Earns Automatically

```
Every verified payment:
  → 95% goes to the seller's Stellar wallet (automatically via Stellar transaction)
  → 5% stays in the platform escrow wallet
  → Seller can see their earnings on /dashboard
```

---

## Tech Stack

| Layer | Technology | What It Does |
|-------|-----------|--------------|
| **Frontend** | React 18 + Vite + TypeScript | The website/UI users see |
| **Styling** | TailwindCSS + Framer Motion | Luxury dark theme, animations |
| **Backend** | Node.js + Express + TypeScript | The API server that handles logic |
| **Blockchain** | Stellar SDK + x402 protocol | Payment verification on Stellar testnet |
| **AI** | Anthropic Claude API | Generates data summaries for buyers |
| **Storage** | JSON file (`data/datasets.json`) | Stores datasets and transaction history |
| **Charts** | Recharts | Earnings graphs on dashboard |

---

## Project Structure

```
Hazina-Escrow/
│
├── backend/                         ← Node.js API server (port 3001)
│   └── src/
│       ├── main.ts                  ← Express app setup, CORS, routes
│       ├── common/
│       │   └── storage.ts           ← Reads/writes data/datasets.json
│       ├── datasets/
│       │   └── datasets.router.ts   ← CRUD for datasets (list, create, get)
│       ├── payments/
│       │   ├── payments.router.ts   ← x402 flow: /query and /verify endpoints
│       │   └── stellar.service.ts   ← Calls Stellar Horizon API to verify payments
│       └── ai/
│           └── claude.service.ts    ← Calls Claude API to summarize data
│
├── frontend/                        ← React app (port 5173)
│   └── src/
│       ├── App.tsx                  ← Page routing
│       ├── pages/
│       │   ├── LandingPage.tsx      ← Home page with hero, stats, how-it-works
│       │   ├── MarketplacePage.tsx  ← Browse & search datasets
│       │   ├── SellPage.tsx         ← Upload data and create a listing
│       │   └── DashboardPage.tsx    ← Seller earnings & transaction history
│       ├── components/
│       │   ├── layout/Navbar.tsx    ← Top navigation bar
│       │   └── ui/
│       │       ├── DatasetCard.tsx  ← Each dataset card in marketplace
│       │       └── QueryModal.tsx   ← The payment popup modal
│       └── lib/
│           ├── api.ts               ← Typed functions to call the backend
│           └── utils.ts             ← Helper functions (formatting, etc.)
│
├── data/
│   └── datasets.json                ← Database: 6 seeded datasets + transactions
│
├── package.json                     ← Root workspace (runs both servers together)
└── .gitignore
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- An Anthropic API key → get one at console.anthropic.com
- (Optional) A Stellar testnet wallet → get one at laboratory.stellar.org

### 1. Install dependencies

```bash
npm run install:all
```

This installs packages for both the backend and frontend in one command.

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```bash
PORT=3001
FRONTEND_URL=http://localhost:5173

# Required — get from console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-...

# Optional — use the defaults for local testnet testing
ESCROW_WALLET=GBVNKDPGVZGFKGRHDUBSZ5V7PXY6PJRFYF5RYVBKAHV3BUXHQWCFXBZ
ESCROW_SECRET=your_escrow_wallet_secret_here

# Platform fee percentage (0.05 = 5%)
PLATFORM_FEE=0.05
```

### 3. Start the app

```bash
npm run dev
```

This starts:
- **Backend API** → http://localhost:3001
- **Frontend UI** → http://localhost:5173

### 4. Test without real payments

Every dataset has a **demo mode** — click "Try Demo" in the query modal to get AI analysis without sending a real Stellar payment. Perfect for testing.

---

## Pages & Features

### `/` — Landing Page
- Hero section with animated statistics (total datasets, queries, earnings)
- "How It Works" step-by-step explainer
- Featured datasets preview
- Links to marketplace and sell pages

### `/marketplace` — Browse Datasets
- Grid of all available datasets
- **Filter** by type (whale wallets, DeFi, NFT, sentiment, etc.)
- **Sort** by newest, price, or popularity
- **Search** by name or description
- Click any card → opens the payment modal

### `/sell` — List Your Data
- Form to upload a JSON dataset
- Set a name, description, type, and price (in USDC)
- Enter your Stellar wallet address (to receive 95% of sales)
- Preview your data before submitting
- Submit → dataset appears on marketplace immediately

### `/dashboard` — Seller Analytics
- 7-day earnings chart (area graph)
- Query volume chart (bar graph)
- Recent transactions list
- Total earnings breakdown (your cut vs platform fee)

---

## API Reference

All endpoints served from `http://localhost:3001`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/health` | Check if server is running |
| `GET`  | `/api/datasets` | List all datasets (no raw data exposed) |
| `GET`  | `/api/datasets/stats` | Platform-wide stats (totals) |
| `GET`  | `/api/datasets/:id` | Get one dataset's metadata |
| `POST` | `/api/datasets` | Create a new dataset listing |
| `GET`  | `/api/datasets/:id/transactions` | Get transaction history for a dataset |
| `POST` | `/api/query/:id` | Initiate a query → returns 402 with payment instructions |
| `POST` | `/api/verify/:id` | Submit Stellar tx hash → verify payment → receive data |
| `POST` | `/api/verify/:id/demo` | Demo mode — skip payment, get AI summary directly |

### Example: Initiate a query

**Request:**
```bash
POST /api/query/ds-001-whale-wallets
```

**Response (402 Payment Required):**
```json
{
  "paymentAddress": "GBVNKDPGVZGFKGRHDUBSZ5V7PXY6PJRFYF5RYVBKAHV3BUXHQWCFXBZ",
  "amount": "0.05",
  "currency": "USDC",
  "memo": "hazina-ds-001-abc123",
  "expiresIn": 300
}
```

### Example: Verify payment

**Request:**
```bash
POST /api/verify/ds-001-whale-wallets
Content-Type: application/json

{
  "txHash": "abc123...",
  "buyerQuestion": "Which wallets moved the most ETH?"
}
```

**Response (200 OK):**
```json
{
  "data": { "...raw dataset..." },
  "ai": {
    "summary": "This dataset contains movements from 100 top whale wallets...",
    "answer": "Wallet 0xAbC... moved 15,000 ETH in the last 24 hours..."
  },
  "transaction": {
    "id": "txn-xyz",
    "amount": "0.05",
    "sellerEarnings": "0.0475",
    "platformFee": "0.0025"
  }
}
```

---

## Payment Flow Deep Dive

### What is x402?

x402 is an open protocol that uses HTTP's `402 Payment Required` status code to create a standard request-pay-receive flow for any API. Instead of subscriptions or API keys, you just pay per request in cryptocurrency.

### Why Stellar?

- **Fast**: Transactions settle in 3–5 seconds
- **Cheap**: Fees are fractions of a cent
- **USDC support**: Native stablecoin support (no price volatility)
- **Testnet**: Free fake money for development at testnet.stellar.org

### Payment Verification Steps (in the backend)

When a buyer submits a transaction hash, the backend does all of this:

```
1. Look up the transaction on Stellar's public Horizon API
2. Check the transaction EXISTS and is SUCCESSFUL
3. Check the payment went to the CORRECT escrow wallet address
4. Check the payment amount is EXACTLY right (not less)
5. Check the memo matches this specific query (prevents payment reuse)
6. Check the transaction isn't older than 5 minutes (expiry)
7. Check this txHash hasn't been used before (prevents replay attacks)

All checks pass → release data
Any check fails → reject with error message
```

---

## What to Do Next

Here is a prioritized roadmap from MVP to production:

### Immediate (to finish the MVP)

- [ ] **Add your Anthropic API key** to `backend/.env` — required for AI summaries
- [ ] **Test the demo flow** — open the app, go to marketplace, click any dataset, try demo mode
- [ ] **Test real payment flow** — get testnet XLM from friendbot.stellar.org, buy a dataset
- [ ] **List your own dataset** — go to /sell and upload real data

### Short Term (make it real)

- [ ] **Real wallet connect** — integrate a Stellar wallet (e.g. Lobstr, Freighter) so buyers sign transactions from their own wallet in-browser instead of manually
- [ ] **Replace JSON storage** — swap `data/datasets.json` for PostgreSQL or MongoDB so data survives restarts and scales
- [ ] **Deploy** — put backend on Railway/Render and frontend on Vercel; point to Stellar mainnet instead of testnet

### Medium Term (grow the product)

- [ ] **User accounts** — let sellers track their own datasets with a login
- [ ] **Data encryption** — encrypt raw data at rest so it's only decrypted after payment
- [ ] **Subscription model** — let buyers pay a monthly fee for unlimited queries
- [ ] **Webhooks** — notify sellers in real-time when their data sells

### Long Term (if you want true decentralization)

- [ ] **Smart contracts** — if you move to an EVM chain (Base, Polygon), write a Solidity escrow contract so the payment logic is fully on-chain and no server is needed
- [ ] **Data NFTs** — mint an NFT for each dataset purchase so buyers can resell access
- [ ] **DAO governance** — let HAZINA token holders vote on platform fees and curation

---

## Seeded Datasets (Ready to Query)

Six datasets are pre-loaded in `data/datasets.json` for testing:

| ID | Dataset | Price |
|----|---------|-------|
| ds-001 | Top 100 Whale Wallet Movements (ETH + Solana) | $0.05 |
| ds-002 | DEX Arbitrage Signals (Uniswap, Curve) | $0.10 |
| ds-003 | DeFi Protocol Yields (20+ protocols) | $0.02 |
| ds-004 | Wallet Risk Scores (500 DeFi wallets) | $0.03 |
| ds-005 | NFT Floor Price Movements | $0.02 |
| ds-006 | Crypto Social Sentiment Analysis | $0.04 |

---

## Design System

The UI uses a luxury Afrofuturist aesthetic:

| Token | Value | Use |
|-------|-------|-----|
| Background | `#0A0A0F` | Page background (void black) |
| Gold | `#C9A84C` | Buttons, accents, highlights |
| Heading font | Playfair Display | Elegant serif for titles |
| Body font | DM Sans | Clean sans-serif for text |
| Cards | Glass morphism | Frosted glass effect with gold borders |
| Pattern | Kente-inspired SVG | African geometric backgrounds |

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | API port (default: 3001) |
| `FRONTEND_URL` | No | CORS origin (default: http://localhost:5173) |
| `ANTHROPIC_API_KEY` | Yes | Your Claude API key |
| `ESCROW_WALLET` | No | Stellar wallet address to receive payments |
| `ESCROW_SECRET` | No | Stellar wallet secret key (for signing transactions) |
| `PLATFORM_FEE` | No | Platform cut as decimal (default: 0.05 = 5%) |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | No | Backend URL (default: http://localhost:3001) |
