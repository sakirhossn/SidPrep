# SidPrep 2.0 — Redesign & Implementation Changelog

**Version:** 2.0.0-rc1  
**Audit & Implementation Date:** 2026-11-04 / 2026-11-05  
**Governing Blueprints:** `01_Audit_And_Implementation_Blueprint.md`, `02_ANTIGRAVITY_MASTER_PROMPT.md`, `03_API_Contract_Reconciliation.csv`, `04_Design_Tokens.json`, `05_QA_Release_Checklist.md`, `06_Visual_Design_Rationale.md`

---

## Phase 0 — Audit and Baseline
- **Created:** `docs/redesign/BASELINE.md` documenting monorepo topology, P0 security/data inventory, full route reconciliation matrix, and initial test baselines.
- **Identified First Vertical Slice:** Student Home + Mock Catalogue + Admin-published mock data on secured/persistent API.

---

## Phase 1 — Trust, Security, and Backend Integrity (P0)

### 1.1 Admin Authentication & Server Authorization
- **Removed Client-Side Mock Gating:** Removed `mock_preauth_token` and `mock_admin_token` offline bypasses in `apps/web/src/app/admin/login/page.tsx`. Clean single fetch handler with honest API error display.
- **Removed Demo Credential Shortcuts:** Removed prefilled default passwords and `fillDefaultTotp` shortcut code from `apps/web/src/app/admin/login/page.tsx`.
- **Protected Layout Session Storage:** Refactored `apps/web/src/app/admin/layout.tsx` from raw `localStorage` string injection to verified `sessionStorage` session token lifecycle.
- **Centralized Administrative Authorization (`apps/api/src/lib/adminAuth.ts`):**
  - Added Fastify `requireAdminAuth(allowedRoles?: string[])` preHandler hook.
  - Enforces Bearer JWT verification, checks active account status in `db.adminUsers`, attaches `request.admin`, and validates role permissions.
  - Applied to `/v1/admin/overview`, `/v1/admin/questions`, `/v1/admin/team`, `/v1/admin/quotas`, `/v1/admin/news/drafts`, `/v1/admin/resources`.
- **Password Verification Hardening:** Stripped plaintext dev password fallbacks (`'admin'`, `'admin123'`) in `apps/api/src/modules/auth/index.ts`. All password checks strictly verify via PBKDF2 SHA-512.
- **Production Secret Guard:** Added Zod runtime refinement in `apps/api/src/config/index.ts` rejecting default dev signing keys when `NODE_ENV === 'production'`.

### 1.2 Route Reconciliation & Dual-Compatibility
- **Student OTP Challenge:** Mapped `POST /v1/auth/student/challenge` and canonical alias `POST /v1/auth/otp/request`.
- **Student OTP Verify:** Mapped `POST /v1/auth/student/verify` and canonical alias `POST /v1/auth/otp/verify`. Returns both root tokens and `{ tokens: { accessToken, refreshToken, expiresIn } }` envelope.
- **Token Refresh:** Added `POST /v1/auth/refresh` endpoint in `authRoutes`.
- **Attempt Start:** Added `POST /v1/tests/:id/start` route alias pointing to attempt initiation.
- **Attempt Results Retrieval:** Added `GET /v1/attempts/:id/result` endpoint returning full score, section breakdown, solutions, and explanations.
- **Study Plan Task Mutation:** Added `PATCH /v1/study-plan/tasks/:id` endpoint for cross-device task completion sync.
- **Resource Download Policy:** Added `POST /v1/resources/:id/download` ticket handler matching `GET /v1/resources/:id/download` with strict 403 Forbidden gating on preview-only files.
- **Student Privacy Requests:** Added `POST /v1/me/export` and `POST /v1/me/delete` with tracking ticket IDs and operational audit logs.

---

## Phase 2 — Mobile Design and Implementation (Ink & Moss v2)

### 2.1 Design Tokens Upgrade
- **Replaced Legacy Blue/Indigo:** Updated `packages/design-tokens/src/colors.ts` and `index.ts` to full **Ink & Moss v2** specification:
  - Primary Forest: `#28563F`
  - Charcoal Hero: `#1E3C2C`
  - Citrus Highlight: `#DFF19B`
  - Warm Paper Canvas: `#F7F7F2` (Mobile) / `#F4F3EE` (Web)
  - Near-Black Ink: `#20291F`
  - Subtle Border: `#E6E8DE`
  - Accessible Status: Success (`#24734E`), Warning (`#9B642D`), Error (`#B5483F`)
- **Semantic Radii:** Added `chip` (7dp), `input` (12dp), `action` (12dp), `card` (18dp), `hero` (19dp), `sheet` (24dp) while preserving scale radii (`sm`, `base`, `md`, `lg`, `xl`).

### 2.2 Mobile Screen Improvements
- **Exam Countdown Card (`ExamCountdownCard.tsx`):**
  - Replaced floor calculation `0 days remaining` with honest tri-state: `UPCOMING` (${days} Days Remaining), `COMPLETED` (Exam Completed), `UNANNOUNCED` (Date Not Announced).
  - Verified official badge requires both `lastVerifiedAt` AND valid official `verificationSourceUrl`.
- **Mock Test Overview (`mock/[id]/index.tsx`):**
  - Replaced first-item fallback with exact `api.getTestById(id)`.
  - Added dedicated `Test Not Found` error view with catalog return CTA.
- **Mock Result Review (`mock/[id]/result.tsx`):**
  - Added server fallback fetch to `api.getAttemptResult(attemptId)` when SQLite cache is empty.
- **Study Plan Sync (`study-plan.tsx`):**
  - Added optimistic local update with background server mutation via `api.updateStudyTask(taskId, isCompleted)`.
- **Student Profile Privacy (`profile.tsx`):**
  - Wired `handleDataExport` and `handleDeleteAccount` to `api.requestDataExport()` and `api.requestAccountDeletion()`, displaying real server ticket IDs (`exp_*`, `del_*`) and queued status.

---

## Verification & Ponytail Metrics
- **`/ponytail-audit`:** -128 lines identified and eliminated from demo shortcuts, plaintext backdoors, and over-engineered handlers.
- **Tests Passing:**
  - `@sidprep/api`: 7 / 7 passing.
  - `@sidprep/mobile`: 11 / 11 passing.
  - `@sidprep/mobile` Typecheck: `tsc --noEmit` exited code 0 with 0 errors.
