<div align="center">

# 🎯 SidPrep 2.0 Monorepo

**The Next-Generation, Offline-First Competitive Exam Preparation Ecosystem**  
*Built for high-stakes Indian exams (SSC, RRB, WBPSC, IBPS) with strict performance budgets, zero answer-key leakage, and free-tier operational excellence.*

---

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Expo SDK](https://img.shields.io/badge/Expo_SDK-58_(New_Arch)-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React_Native-0.88+-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactnative.dev/)
[![Next.js](https://img.shields.io/badge/Next.js-14_App_Router-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-v4-000000?style=for-the-badge&logo=fastify&logoColor=white)](https://fastify.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![pnpm](https://img.shields.io/badge/pnpm-12.16-F69220?style=for-the-badge&logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

[Key Features](#-key-features) •
[Architecture](#-system-architecture) •
[Monorepo Structure](#-monorepo-structure) •
[Quickstart](#-quickstart--local-development) •
[Target Exams](#-target-exam-ecosystem) •
[Security & Invariants](#-architectural--security-invariants) •
[Deployment](#-production-deployment)

</div>

---

## 🌟 Overview

**SidPrep 2.0** is an enterprise-grade, high-performance monorepo engineered to power the complete SidPrep student and administrative experience. Designed from the ground up to eliminate common EdTech anti-patterns—such as client-side answer verification leakage, hardcoded unverified exam dates, and memory-hogging serverless stacks—SidPrep 2.0 provides an offline-first mobile app, a public SEO-optimized discovery web portal, a secure admin CMS, and a shared lightweight REST API running reliably within Oracle Cloud Always Free constraints.

---

## ✨ Key Features

### 📱 Student Mobile Application (`apps/mobile`)
- **Modern Stack**: React Native + Expo SDK 58 with React Native New Architecture enabled and Expo Router v4 file-based routing.
- **Offline-First Mock Runner**: Local SQLite test execution with monotonic sequence-tagged answer synchronization (`/v1/sync/answers`), supporting seamless resumption during flaky network conditions.
- **Authoritative Grading**: Zero answer key or explanation leakage before server submission. Negative marking rules and test countdowns are strictly server-authoritative.
- **Security & Storage Isolation**: `expo-secure-store` for cryptographic JWT tokens; `expo-sqlite` for test queues, cached syllabus trees, and current affairs briefs.
- **Accessible Design System**: WCAG AA compliant with SidPrep Signature Indigo (`#3B4CCA`), Manrope and Inter typography, dark mode tokens, and 48dp Android touch targets.
- **Gated File Previews**: Full in-app document viewing with strict authorization checks; download actions are gated on `downloadAllowed === true`.

### 🌐 Public Student Website (`apps/web`)
- **Fast & SEO-Optimized**: Next.js 14 App Router with static generation (SSG) for high-performance marketing and discovery pages.
- **Exam Hubs**: Dynamically generated, verified exam portals (`/exams/ssc`, `/exams/rrb`, `/exams/wbpsc`, `/exams/ibps`) displaying authentic syllabus trees and official notice dates.
- **Public Current Affairs**: Canonical, indexed news briefs sourced directly from official press releases (PIB) with primary source attribution.
- **Resource Catalogue**: Searchable study notes and reference papers with sandboxed previews.

### 🛡️ Enterprise Admin CMS (`apps/web/admin`)
- **Role-Based Access Control**: Strict privilege tiering (Super Admin, Editor, Content Creator) with TOTP 2FA.
- **Dual-Admin Approval Workflow**: Enforced maker-checker policy; an admin cannot approve their own exam pattern change or automated publishing rule.
- **Automated Current Affairs Pipeline**: SSRF-protected ingest of official feeds, SHA-256 deduplication, intelligent category classification (Polity, Economy, Science, etc.), and editorial state machine (`FETCHED` → `DRAFT` → `APPROVED` → `PUBLISHED`).
- **Resource Governance**: Granular permissions per document controlling in-browser sandboxed preview vs. signed, time-limited download URL generation.
- **Tamper-Evident Audit Trail**: Immutable database audit log tracking administrator identity, action diffs, timestamps, IPs, and user agents.

### ⚡ Shared REST API & Worker (`apps/api`)
- **Ultra-Lightweight Core**: Built on Fastify v4 + TypeScript (~45MB RSS memory footprint vs ~300MB+ for NestJS/Express), running blazingly fast on ARM64.
- **OpenAPI 3.1 & Zod Validation**: End-to-end schema validation across all `/v1/...` routes with shared type definitions.
- **Brevo Quota Guardrails**: Transactional email OTP authentication with rate limiting and automated daily quota tracking (protecting the 300 emails/day free tier).
- **PostgreSQL 16 Job Queue**: Background workers use `SELECT ... FOR UPDATE SKIP LOCKED` for reliable, transactional job processing without requiring external Redis or Kafka instances.

---

## 🏛️ System Architecture

```mermaid
graph TD
    subgraph Clients ["Client Applications"]
        Mobile["📱 Student Mobile App<br/>(Expo SDK 58 / React Native)"]
        WebPublic["🌐 Student Web Portal<br/>(Next.js 14 SSG/SSR)"]
        WebAdmin["🛡️ Admin CMS<br/>(Next.js 14 / TOTP 2FA)"]
    end

    subgraph Gateway ["Reverse Proxy & Edge"]
        Cloudflare["☁️ Cloudflare CDN / WAF<br/>(Strict Cache Rules)"]
        Caddy["🔒 Caddy Reverse Proxy<br/>(Auto TLS / Rate Limiting)"]
    end

    subgraph CoreServices ["SidPrep Backend Suite"]
        FastifyAPI["⚡ Fastify REST API<br/>(Node.js / TypeScript / OpenAPI 3.1)"]
        Worker["⚙️ PostgreSQL Job Worker<br/>(SKIP LOCKED / RSS Ingest)"]
        DB[(🐘 PostgreSQL 16<br/>Data & Job Queue)]
    end

    subgraph External ["External Integrations"]
        Brevo["✉️ Brevo Transactional Email<br/>(Quota-Guarded OTP)"]
        R2["📦 Cloudflare R2 / Storage<br/>(Presigned Signed URLs)"]
        PIB["📰 Official Feeds<br/>(PIB / Gov Gazettes)"]
    end

    Mobile -->|HTTPS / REST| Cloudflare
    WebPublic -->|HTTPS| Cloudflare
    WebAdmin -->|HTTPS| Cloudflare

    Cloudflare --> Caddy
    Caddy --> FastifyAPI
    Caddy --> WebPublic

    FastifyAPI --> DB
    FastifyAPI --> Brevo
    FastifyAPI --> R2
    
    Worker --> DB
    Worker --> PIB
```

---

## 📁 Monorepo Structure

```
SidPrep/
├── apps/
│   ├── api/                   # Fastify shared REST API & background worker
│   │   ├── src/modules/       # Auth, Exams, Tests, News, Resources, Quotas, Logs
│   │   └── Dockerfile         # Production multi-stage ARM64 Dockerfile
│   ├── mobile/                # Student React Native mobile app (Expo SDK 58)
│   │   ├── app/               # Expo Router v4 file-based routes
│   │   ├── src/services/      # SQLite sync engine, secure token store, API client
│   │   └── tests/             # Offline queue, telemetry & scoring test suite
│   └── web/                   # Public student website & secure Admin CMS
│       ├── src/app/           # Next.js 14 App Router routes
│       └── Dockerfile         # Production standalone Next.js Dockerfile
├── packages/
│   ├── config/                # Shared TypeScript, ESLint & Tailwind configs
│   ├── contracts/             # OpenAPI 3.1 specs, Zod validation & type contracts
│   ├── design-tokens/         # SidPrep Indigo (#3B4CCA) tokens, typography, radii
│   └── ui/                    # Reusable web UI component primitives
├── tools/
│   └── mock-backend/          # Fastify mock API server for offline/UI testing
├── docs/
│   ├── adr/                   # Architecture Decision Records (ADR 0001)
│   └── deployment/            # Oracle Cloud & Cloudflare deployment guide
├── Caddyfile                  # Production Caddy reverse proxy configuration
├── docker-compose.yml         # Containerized production stack (API, Web, DB)
└── pnpm-workspace.yaml        # pnpm monorepo workspace definition
```

---

## 🎯 Target Exam Ecosystem

SidPrep 2.0 provides curated, verified syllabus trees, mock tests, and sectional drills across the four premier Indian competitive exam sectors:

| Category | Exams Supported | Features |
| :--- | :--- | :--- |
| **SSC** | CGL (Tier I & II), CHSL, MTS | Sectional timers, negative marking (+2.0 / -0.5), topic weightings |
| **RRB** | NTPC (Grad & Undergrad), Group D | General Science drills, CBT simulation, bilingual questions |
| **WBPSC** | Miscellaneous, Clerkship, Food SI | Regional Bengali script support, state-specific current affairs |
| **IBPS** | PO, Clerk, RRB PO, RRB Clerk, SO | Strict sectional time locks, high-level reasoning, banking awareness |

> [!IMPORTANT]
> **No Fabricated Exam Schedules:** Exam dates, official cutoffs, and syllabus parameters are strictly admin-managed with recorded verification timestamps. If an exam date has not been officially gazetted, the app displays **"Date not announced"**.

---

## 🔒 Architectural & Security Invariants

| Principle | Implementation |
| :--- | :--- |
| **Zero Answer Leakage** | Questions delivered during active tests contain only prompt and options. Answer keys, correct option IDs, and detailed solutions are strictly stripped until `/v1/attempts/[id]/submit` returns HTTP 200. |
| **Monotonic Answer Sync** | User responses are immediately persisted to local SQLite with monotonic integers (`clientSequence`). Flushed asynchronously to `/v1/sync/answers` with distinct UI statuses (`Saved Locally` vs. `Synced`). |
| **Dual-Admin Verification** | Critical modifications (official exam patterns, automated publishing triggers) require two distinct administrator approvals; an author cannot approve their own changes. |
| **Sandboxed File Previews** | Study materials default to `previewAllowed: true` and `downloadAllowed: false`. Non-downloadable documents are rendered via sandboxed viewers; download endpoints return HTTP 403 Forbidden unless explicitly authorized. |
| **Free-Tier Protection** | Active memory budget kept under 512MB RAM per container. Brevo email quotas are monitored with proactive throttle guardrails at 250 sends/day to preserve OTP capability. |

---

## 🚀 Quickstart & Local Development

### Prerequisites
- **Node.js**: `v20.x` or higher (LTS recommended)
- **Package Manager**: `pnpm` (`v9.x` or `v12.x`)
- **Docker & Docker Compose** (for running PostgreSQL locally)

### 1. Clone the Repository
```bash
git clone https://github.com/sakirhossn/SidPrep.git
cd SidPrep
```

### 2. Install Monorepo Dependencies
```bash
pnpm install
```

### 3. Build Shared Packages
```bash
pnpm build
```

### 4. Configure Environment Variables
Copy the template configuration:
```bash
cp .env.example .env
```
Key environment variables:
- `EXPO_PUBLIC_API_BASE_URL`: Base URL for the mobile app (`http://localhost:4000/v1` in local dev).
- `DATABASE_URL`: PostgreSQL connection string (`postgresql://sidprep_user:password@localhost:5432/sidprep_db`).
- `JWT_SECRET`: Cryptographic secret for signing auth tokens.
- `BREVO_API_KEY`: API key for Brevo transactional email (optional for local mock dev).

---

## 💻 Development Commands

The root `package.json` provides unified scripts to run any service across the monorepo:

| Command | Description |
| :--- | :--- |
| `pnpm dev:api` | Starts Fastify REST API in watch mode (`http://localhost:4000`) |
| `pnpm dev:web` | Starts Next.js student portal & Admin CMS (`http://localhost:3000`) |
| `pnpm dev:mobile` | Launches Expo development server for the mobile app |
| `pnpm dev:mobile:web` | Runs the mobile app in web browser preview mode |
| `pnpm dev:mock` | Runs the standalone Fastify mock backend conforming to OpenAPI 3.1 |
| `pnpm test` | Runs the entire monorepo automated test suite (`contracts`, `api`) |
| `pnpm --filter @sidprep/mobile test` | Runs the offline sync, scoring & telemetry mobile test suite |
| `pnpm lint` | Runs linter across all monorepo packages |
| `pnpm format` | Formats all code files using Prettier |

---

## 🧪 Automated Test Suite

SidPrep 2.0 includes automated end-to-end and unit tests verifying all core business logic and security invariants:

```bash
# Run shared contracts and API test suite
pnpm test

# Run mobile offline sync, scoring and telemetry tests
pnpm --filter @sidprep/mobile test
```

### Verified Test Assertions
- ✅ Health checks & operational diagnostics
- ✅ Brevo OTP request, verification, and quota monitoring
- ✅ Dual-Admin invariant: Creator cannot approve their own pattern change
- ✅ Resource permissions: Gating `downloadAllowed` vs `previewAllowed`
- ✅ Server-authoritative grading & SSC negative marking (+2.0 / -0.5)
- ✅ Monotonic client sequence generation in SQLite queue
- ✅ Prohibiting manufactured ranks/percentiles when sample size is insufficient
- ✅ Telemetry redaction of sensitive credentials, passwords, and tokens

---

## 🚢 Production Deployment

The repository includes a battle-tested `docker-compose.yml` and `Caddyfile` tailored for **Oracle Cloud Always Free (ARM64 Ampere A1)** instances:

```bash
# Start all production services in detached mode
docker compose up -d --build
```

### Container Resource Limits
- `postgres`: 0.80 CPU limit, 512MB RAM cap
- `api`: 0.60 CPU limit, 384MB RAM cap
- `web`: 0.60 CPU limit, 384MB RAM cap
- Total memory envelope: **< 1.5 GB RAM** (easily fits within 12 GB Always Free allocation)

---

## 📄 License & Credits

Copyright © 2026 SidPrep. All rights reserved.  
Architected and developed with ❤️ for competitive exam aspirants across India.
