# Solana Staking & Rewards Backend

Backend API for Solana staking and rewards protocol with NFT-based vesting.

## Features

- Wallet-based authentication with JWT
- Staking with configurable durations and tiers
- Pro-rata reward distribution with 0.21% weekly emission
- NFT vesting with 1-year lockup
- 7-day cooldown for early unstaking
- Admin controls for tier and pool management
- Background workers for automated distributions
- Blockchain event indexing
- Compliance system (allowlist/denylist)
- Protocol analytics and leaderboards

## Tech Stack

- Node.js 18+ / TypeScript
- NestJS
- PostgreSQL / Prisma
- Redis
- Solana / Anchor
- Docker

## Prerequisites

- Node.js >= 18.0.0
- PostgreSQL 14+
- Docker & Docker Compose

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment

```bash
cp .env.example .env
```

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/solana_staking
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=your_program_id
REWARD_TOKEN_MINT=your_token_mint
JWT_SECRET=your_jwt_secret
ADMIN_PRIVATE_KEY=your_admin_key
```

### 3. Start Services

```bash
docker-compose up -d
```

### 4. Run Migrations

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 5. Start Server

```bash
npm run start:dev
```

Access at `http://localhost:3000/api/v1`

## API Endpoints

See `http://localhost:3000/docs` for Swagger documentation.

**Auth**: `/api/v1/auth/*` - nonce, verify, logout  
**Staking**: `/api/v1/staking/*` - stake, unstake, finalize, positions  
**Rewards**: `/api/v1/rewards/*` - claim, vest, nfts  
**Admin**: `/api/v1/admin/*` - tiers, pause, unpause, state  
**Insights**: `/api/v1/insights/*` - epoch, power, stats, leaderboard  
**Health**: `/api/v1/health`, `/metrics`

## Authentication

1. Get nonce: `POST /auth/nonce`
2. Sign with wallet
3. Verify: `POST /auth/verify` → returns JWT
4. Use JWT in `Authorization: Bearer <token>` header

## Development

```bash
npm run start:dev        # Dev server
npm run build            # Build
npm run test             # Tests
npm run prisma:studio    # DB GUI
```

## Deployment

```bash
docker build -t solana-staking-backend .
docker run -p 3000:3000 solana-staking-backend
```

See `/k8s` for Kubernetes manifests.
