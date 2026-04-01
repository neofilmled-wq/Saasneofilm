# NeoFilm SaaS Platform

Digital signage / TV advertising SaaS platform.

## Tech Stack

- **Monorepo**: Turborepo + pnpm workspaces
- **Frontend**: Next.js 15 (App Router, Turbopack) + Tailwind CSS v4 + shadcn/ui
- **Backend**: NestJS 11 (REST + Socket.IO)
- **Database**: PostgreSQL 16 + Prisma 6
- **Auth**: JWT (access + refresh tokens) + bcrypt
- **Realtime**: Socket.IO (screen status heartbeat every 10s)

## Prerequisites

- Node.js 20+
- pnpm 10+ (`corepack enable && corepack prepare pnpm@10.30.2 --activate`)
- Docker & Docker Compose (for PostgreSQL + Redis)

## Quick Start (one-time setup)

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment file (already done if .env exists)
cp .env.example .env

# 3. Start PostgreSQL + Redis via Docker
pnpm db:up

# 4. Push Prisma schema to database
pnpm db:push

# 5. Generate Prisma client
pnpm db:generate

# 6. Seed demo data
pnpm db:seed

# 7. Start all apps + API
pnpm dev
```

## Daily Development

```bash
# Start infrastructure (if not running)
pnpm db:up

# Start all apps
pnpm dev
```

## Services & Ports

| Service           | URL                           |
|-------------------|-------------------------------|
| Admin Dashboard   | http://localhost:3000          |
| API (NestJS)      | http://localhost:3001/api/v1   |
| API Docs (Swagger)| http://localhost:3001/api/docs |
| Partner Dashboard | http://localhost:3002          |
| Advertiser Dashboard | http://localhost:3003       |
| PostgreSQL        | localhost:5432                 |
| Redis             | localhost:6379                 |

## Demo Accounts

Password for all accounts: `Password123!`

| Email               | Role         | Organization      |
|---------------------|--------------|-------------------|
| admin@neofilm.com   | SUPER_ADMIN  | Platform admin    |
| partner@demo.com    | PARTNER      | Cinemas Lumiere   |
| advertiser@demo.com | ADVERTISER   | FrenchTech Ads    |

## Available Scripts

| Command            | Description                                    |
|--------------------|------------------------------------------------|
| `pnpm dev`         | Start all apps + API in dev mode               |
| `pnpm build`       | Build all packages and apps                    |
| `pnpm lint`        | Lint all packages                              |
| `pnpm test`        | Run tests                                      |
| `pnpm db:up`       | Start PostgreSQL + Redis (Docker)              |
| `pnpm db:down`     | Stop Docker services                           |
| `pnpm db:push`     | Push Prisma schema to database                 |
| `pnpm db:migrate`  | Run Prisma migrations                          |
| `pnpm db:seed`     | Seed demo data                                 |
| `pnpm db:studio`   | Open Prisma Studio (DB browser)                |
| `pnpm db:reset`    | Push schema + re-seed data                     |
| `pnpm db:generate` | Regenerate Prisma client                       |
| `pnpm clean`       | Clean all build artifacts                      |

## Project Structure

```
neofilm-saas/
├── apps/
│   ├── web-admin/        # Admin dashboard (Next.js, port 3000)
│   ├── web-partner/      # Partner dashboard (Next.js, port 3002)
│   ├── web-advertiser/   # Advertiser dashboard (Next.js, port 3003)
│   └── tv-app/           # Android TV app (placeholder)
├── packages/
│   ├── api/              # NestJS API gateway (port 3001)
│   ├── database/         # Prisma schema, migrations, seed
│   ├── shared/           # Types, enums, DTOs, utils
│   ├── ui/               # Shared React component library
│   ├── auth/             # Auth helpers
│   ├── config/           # Zod config validation
│   └── billing/          # Stripe integration
├── docker-compose.yml    # PostgreSQL, Redis, MinIO, MQTT, Mailpit
├── turbo.json            # Turborepo config
└── pnpm-workspace.yaml   # Workspace definition
```

## Seed Data Summary

The seed creates:
- 1 platform admin + 2 partner orgs (5 screens, 5 devices) + 2 advertiser orgs
- 3 campaigns (2 active, 1 draft) with targeting and creatives
- 2 active bookings with screen assignments
- 1000 diffusion logs with HMAC signatures
- 200 analytics events, 50 device heartbeats
- Revenue rules, AI wallets, audit logs, notifications

## Realtime Features

The API broadcasts screen status updates via Socket.IO every 10 seconds on the `/screen-status` namespace. The admin and partner dashboards automatically connect and display live CPU/RAM metrics.
