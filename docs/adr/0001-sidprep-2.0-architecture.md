# ADR 0001: SidPrep 2.0 Monorepo, Data Model, and Free-Tier Operational Architecture

- **Status:** Approved
- **Date:** 2026-11-03
- **Context:** SidPrep 2.0 Greenfield Rebuild (Prompt 2: Website + Admin Panel + Shared Backend)
- **Deciders:** Principal Full-Stack Architect, DevOps & Security Engineer

---

## 1. Context and Problem Statement
The legacy SidPrep system had disparate components, unclear boundaries, and unrealistic assumptions regarding infrastructure (e.g. assuming 4 OCPUs and 24 GB RAM for Oracle Always Free indefinitely, which in reality is 2 Ampere A1 OCPUs / 12 GB RAM / 200 GB block storage under current tenancy rules). 

We need to build a clean, unified, production-ready system consisting of:
1. **Public Student Website** (`sidprep.in`) for student education, discovery, SEO, and app distribution.
2. **Secure Admin CMS** (`sidprep.in/admin`) with role-based access control, dual-admin approval for official exam patterns, automated Current Affairs curation, media asset management with strict download policy enforcement, and audit logs.
3. **Shared REST API** (`api.sidprep.in/v1`) powering both the website and the companion React Native/Expo mobile app (Prompt 1).
4. **Self-hosted Background Worker** for RSS news fetching, scheduled publishing, telemetry rollups, and quota tracking.

---

## 2. Decision Matrix and Technology Choices

### 2.1 Workspace Structure
- **Choice:** pnpm Monorepo.
- **Rationale:** Strict dependency isolation, shared type definitions (`packages/contracts`), design tokens (`packages/design-tokens`), and shared configs (`packages/config`).
- **Layout:**
  - `apps/web`: Next.js 14+ App Router (SSG for marketing pages, dynamic SSR for admin CMS, Tailwind CSS, Lucide icons).
  - `apps/api`: Fastify + TypeScript (lightweight, minimal memory footprint ~45MB RSS vs NestJS/Express, fast startup on ARM64).
  - `apps/mobile`: Companion React Native/Expo app placeholder & contract consumer documentation.
  - `packages/contracts`: OpenAPI 3.1 specification, Zod validation schemas, typed API models.
  - `packages/design-tokens`: Colors (`#3B4CCA` primary, `#F6F7FB` background), typography (Manrope + Inter), spacing, radii.
  - `packages/ui`: Shared UI utilities.

### 2.2 Database and Queue
- **Choice:** PostgreSQL 16+ as sole database and job queue store.
- **Rationale:**
  - Avoids introducing Redis / BullMQ / Kafka into an Oracle Always Free VM (12 GB RAM) where memory must be guarded.
  - Job worker uses PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` for reliable, transactional job claims, retry counts, leases, and dead-letter handling.
  - Dual-mode data access layer: Prisma/SQL schema with an in-memory/embedded fallback repository for instant test suite execution and offline development.

### 2.3 Authentication and Security
- **Student Auth:** Brevo transactional email OTP with 10-minute expiry, send rate limiting (3 requests/hour per email/IP), constant-time verification, session tokens. No direct mobile Brevo access.
- **Admin Auth:** Admin email + password (salted Argon2/bcrypt) + TOTP 2FA (RFC 6238, Google Authenticator / Authy compatible). Device session tracking, brute-force protection, step-up verification for critical actions.
- **Critical Policy Dual-Approval:** Creator cannot approve their own exam pattern change or auto-publish rule. Requires a second admin review.

### 2.4 Current Affairs Pipeline (Asia/Kolkata)
- **Workflow:**
  1. Scheduler / "Run Fetch Now" executes at configured time (e.g. 05:30 IST).
  2. SSRF-protected fetcher pulls allowlisted feeds (PIB, official government press releases, certified educational feeds).
  3. Conditional GET (`If-Modified-Since` / ETag), rate limiting, content hashing (`SHA-256`) for strict deduplication.
  4. Classification into categories: Polity, Economy, Banking, Government Schemes, Science/Tech, Environment, Geography, History/Culture, Sports, Awards, International, Railways, West Bengal, National.
  5. Exam relevance scoring (SSC, RRB, WBPSC, IBPS).
  6. Concise ORIGINAL factual summary generation with primary source attribution.
  7. Editorial state machine: `FETCHED` -> `NORMALIZED` -> `DRAFT` -> `IN_REVIEW` -> `APPROVED` -> `SCHEDULED` -> `PUBLISHED`.
  8. Default mode is `MANUAL_APPROVAL`. Optional `CONDITIONAL_AUTO_PUBLISH` can only be activated by Super Admin with strict guardrails and audit logging.

### 2.5 Media & File Previews
- **MIME & Magic-Byte Validation:** PDF, DOCX, PNG, JPEG, WebP. Blocks macros, scripts, executable files.
- **Preview vs Download Policy:**
  - `previewAllowed=true`: Provides sandboxed, non-downloadable preview (in-browser PDF.js or server-sanitized text/HTML preview for DOCX).
  - `downloadAllowed=true`: Only if explicitly authorized; issues short-lived (5-minute) signed download URL. If false, download endpoints reject with 403 and UI hides download button.

### 2.6 Logging Architecture
- **Layer 1: Immutable Audit Log:** Append-only database table tracking admin identity, action, module, target, previous/new values diff, IP, user-agent, timestamp.
- **Layer 2: Operational Log:** Structured JSON logs for API requests, latency, cron runs, Brevo quota counters, R2 storage metrics.
- **Layer 3: Student App Telemetry:** `/v1/telemetry` endpoint for crash reports, sync errors, and rendering issues. Anonymized, batched, rate-limited, strictly redacting passwords, tokens, OTPs, or PII.

### 2.7 Free-Tier Reality & Quota Guardrails
- **Oracle Cloud Always Free:** 2 Ampere A1 OCPUs, 12 GB RAM, 200 GB storage.
- **Brevo Free:** 300 emails/day cap. Quota tracker alerts at 250 sends and throttles non-essential notifications to preserve OTP delivery.
- **Cloudflare Free & R2:** Strict CDN cache bypassing for `/admin` and `/v1/` authenticated routes; private R2 storage with monthly operation counters.

---

## 3. Consequences and Verifications
- Zero vendor lock-in; runs anywhere Docker Compose is supported.
- Predictable memory footprint (~350MB total container suite).
- All student mobile API contracts in `packages/contracts` provide the exact specification needed for Prompt 1 (Student Mobile App).
