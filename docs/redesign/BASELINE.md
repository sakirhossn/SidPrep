# SidPrep 2.0 — Architecture, Security & Implementation Baseline

**Document Version:** 2.0.0-baseline  
**Audit Timestamp:** 2026-11-04T18:30:00Z  
**Auditor Role:** Principal Systems Architect & Security QA Lead  
**Reference Directives:** `01_Audit_And_Implementation_Blueprint.md`, `02_ANTIGRAVITY_MASTER_PROMPT.md`, `03_API_Contract_Reconciliation.csv`, `04_Design_Tokens.json`, `05_QA_Release_Checklist.md`, `06_Visual_Design_Rationale.md`

---

## 1. Executive Summary & Monorepo State

SidPrep is a government examination preparation platform (SSC CGL, RRB NTPC, Banking, State PSCs) providing exam blueprints, official syllabus trees, mock tests with negative marking, daily study plans, fact-checked current affairs, and resource libraries.

The repository is structured as a pnpm monorepo:
- `apps/mobile`: Expo SDK 52 / React Native 0.76 / Expo Router v4 / TypeScript strict. Android-first, iOS-capable.
- `apps/web`: Next.js 14 App Router / Tailwind CSS. Houses public landing and the staff administration console (`/admin`).
- `apps/api`: Fastify v4 / TypeScript server providing `/v1/*` endpoints, RBAC, logging, Brevo email quota tracking, and scoring engine.
- `packages/contracts`: Shared TypeScript types, Zod schemas, and OpenAPI 3.1 contract specification (`openapi.yaml`).
- `packages/design-tokens`: Shared design tokens (typography, colors, spacing, radii, elevations).
- `packages/config` & `packages/ui`: Shared build presets and UI helpers.
- `tools/mock-backend`: Local standalone test server.

---

## 2. P0 Security, Trust & Architectural Risk Inventory

| Finding ID | Severity | File Reference | Vulnerability / Issue Description | Remediation Plan |
|---|---|---|---|---|
| **SEC-01** | **P0 (Critical)** | `apps/web/src/app/admin/login/page.tsx` | Prefilled default credentials (`admin@sidprep.in`, `AdminSecurePass123!`), default 2FA shortcut (`123456`), and client-side offline bypass creating `mock_preauth_token` and `mock_admin_token` on network failure. | Remove all hardcoded dev credentials, mock tokens, and network error bypasses. Enforce server-side authenticated sessions. |
| **SEC-02** | **P0 (Critical)** | `apps/web/src/app/admin/layout.tsx` | Client-only access gate using `localStorage.getItem('sidprep_admin_user')`. Unauthenticated browser users could inject a JSON string into localStorage to view admin panels. | Implement server-side session validation and middleware verification. Reject unauthorized clients at the API. |
| **SEC-03** | **P0 (Critical)** | `apps/api/src/modules/admin/index.ts`, `apps/api/src/modules/quotas/index.ts` | Endpoints `GET /v1/admin/overview`, `GET /v1/admin/questions`, `GET /v1/admin/team`, and `GET /v1/admin/quotas` lacked authorization pre-handlers. Any anonymous network client could view system telemetry and admin directory. | Implement centralized Fastify `preHandler` hook on all `/v1/admin/*` routes that checks JWT, admin status, and RBAC permissions. |
| **SEC-04** | **P0 (High)** | `apps/api/src/config/index.ts`, `apps/api/src/db/index.ts` | Default development signing keys (`sidprep_development_secret_...`) and seeded test admin credentials without runtime protection in production mode. | Add Zod runtime validation that refuses startup in production if default secrets are used or if `DATABASE_URL` is missing. Separate local fixtures from production store. |
| **DATA-01** | **P0 (High)** | `apps/api/src/db/index.ts` | In-memory JavaScript `Map` and `Array` objects are used as primary database state. Restarting the API server wipes out student attempts, created questions, and published exams. | Maintain Postgres schema (`apps/api/src/db/schema.sql`) and ensure persistence layer survives server restarts, separating test seed fixtures from production data. |
| **API-01** | **P0 (High)** | `apps/mobile/src/api/client.ts` vs `apps/api/src/modules/` | Route inconsistencies: Mobile requested `/auth/otp/request` and `/auth/otp/verify`, whereas backend declared `/auth/student/challenge` and `/auth/student/verify`. Attempt start requested `POST /tests/:id/start`, backend had `POST /attempts`. | Support canonical `/v1` endpoints with seamless dual-compatibility in API and mobile client. Fully reconcile OpenAPI 3.1 specification. |
| **DSGN-01** | **P0 (High)** | `packages/design-tokens/src/colors.ts` & `index.ts` | Design tokens contained legacy Indigo (`#3B4CCA`) and slate themes instead of the mandatory **SidPrep Ink & Moss v2** specification (`#28563F`, `#1E3C2C`, `#DFF19B`, `#F7F7F2`, `#20291F`). | Update `@sidprep/design-tokens` to full Ink & Moss v2 tokens from `04_Design_Tokens.json`. |

---

## 3. Route Matrix & Contract Alignment

| Client / Consumer Path | Fastify Backend Route | OpenAPI Status | Status / Action Required |
|---|---|---|---|
| `POST /v1/auth/otp/request` | `POST /v1/auth/student/challenge` | Documented as challenge | Provide alias in `authRoutes` to ensure zero-friction client calls. |
| `POST /v1/auth/otp/verify` | `POST /v1/auth/student/verify` | Documented as verify | Standardize payload & session response envelope. |
| `POST /v1/auth/refresh` | `POST /v1/auth/refresh` | Missing in parts | Implement JWT refresh rotation. |
| `GET /v1/home` | `GET /v1/home` | Exists | Reconcile dynamic stats (real user streak & attempt accuracy vs hardcoded fallback). |
| `GET /v1/exams` | `GET /v1/exams` | Exists | Ensure normalized `ExamSummary` shape with `lastVerifiedAt` and `sourceUrl`. |
| `GET /v1/exams/:id` | `GET /v1/exams/:id` | Exists | Map stage details, negative marking ratio, and official syllabus tree. |
| `GET /v1/tests` | `GET /v1/tests` | Exists | Filter by `examId` and canonical enum (`FULL_LENGTH`, `SECTIONAL`, `TOPIC_PRACTICE`, `PYQ`). |
| `GET /v1/tests/:id` | `GET /v1/tests/:id` | Exists | Prevent client fallback to first test when ID not found (return explicit 404). |
| `POST /v1/tests/:id/start` | `POST /v1/attempts` | Exists under `/attempts` | Support route alias `POST /v1/tests/:id/start` pointing to attempt creation. |
| `POST /v1/sync/answers` | `POST /v1/sync/answers` | Exists | Monotonic sequence validation, user ownership verification, conflict resolution. |
| `POST /v1/attempts/:id/submit` | `POST /v1/attempts/:id/submit` | Exists | Server-authoritative scoring with SSC CGL (+2.0 / -0.5) rules. |
| `GET /v1/attempts/:id/result` | Missing / local cache only | Missing | Add server route to retrieve submitted attempt results and solutions after app restart. |
| `GET /v1/study-plan` | `GET /v1/study-plan` | Exists | Returns daily tasks and goal tracking. |
| `PATCH /v1/study-plan/tasks/:id` | Missing | Missing | Add server endpoint to persist task completion status across student devices. |
| `GET /v1/current-affairs` | `GET /v1/current-affairs` | Exists | Return published articles only, with verified source URLs and dates. |
| `GET /v1/resources` | `GET /v1/resources` | Exists | Returns document library with preview/download permission flags. |
| `POST /v1/resources/:id/download` | `GET /v1/resources/:id/download` | Method mismatch | Support both POST download ticket and GET download redirect with 403 enforcement. |

---

## 4. Current Test Baseline

Executed via `pnpm test` (root runner):
- `@sidprep/api`: **7 / 7 tests passed** (Health check, Quotas, Student OTP, Dual-admin verification invariant, Resource permission gating, Test scoring & negative marking, Immutable audit logging).
- `@sidprep/mobile`: **11 / 11 tests passed** (Auth & token handling, Official exams fetch, Test runner sync & grading, Download gating, AnswerSyncEngine sequence tracking, SQLite persistence, SSC CGL scoring invariants, Telemetry correlation & sanitization).

---

## 5. Smallest Complete First Vertical Slice

To satisfy Phase 0 and begin immediate phased delivery:
1. **Design Tokens & Palette Upgrade**: Deploy Ink & Moss v2 (`#28563F`, `#1E3C2C`, `#DFF19B`, `#F7F7F2`, `#20291F`, Manrope font architecture) across `@sidprep/design-tokens`.
2. **API P0 Security & Route Reconciliation**:
   - Secure all `/v1/admin/*` endpoints behind server-side authentication & RBAC.
   - Enforce environment secret safety.
   - Add aliases and endpoints (`POST /v1/auth/otp/request`, `POST /v1/auth/otp/verify`, `POST /v1/tests/:id/start`, `GET /v1/attempts/:id/result`, `PATCH /v1/study-plan/tasks/:id`).
   - Remove mock login tokens and dev bypasses in `apps/web/src/app/admin/login/page.tsx` and `layout.tsx`.
3. **Student Mobile Slice**:
   - Update `app/(tabs)/index.tsx` (Home) with Ink & Moss dark hero card, accurate date handling (`Exam completed`, `Date not announced`), daily goal progress, and resume learning.
   - Update `app/(tabs)/mocks.tsx` with searchable, filterable catalogue.
   - Update `app/mock/[id]/runner.tsx` and `result.tsx` with server-authoritative timer, question palette, and result retrieval.
4. **Admin Console Slice**:
   - Protect layout with server session verification.
   - Wire mock builder & questions to authenticated endpoints.
