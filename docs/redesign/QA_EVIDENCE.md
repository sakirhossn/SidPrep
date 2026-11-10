# SidPrep 2.0 — Quality Assurance & Release Evidence

**Document Version:** 2.0.0  
**Verification Date:** 2026-11-04 / 2026-11-05  
**Governing Gate Checklist:** `05_QA_Release_Checklist.md`

---

## 1. Automated Regression Test Evidence

### 1.1 Shared API Test Suite (`@sidprep/api`)
Command: `pnpm --filter @sidprep/api test`  
Runner: `node --test dist/test/api.test.js`

```text
TAP version 13
# Subtest: SidPrep 2.0 Shared API Test Suite
    # Subtest: 1. Health check returns 200 with operational checks and brevo quota
    ok 1 - 1. Health check returns 200 with operational checks and brevo quota
      ---
      duration_ms: 41.5579
    # Subtest: 2. Quota dashboard enforces admin authentication and reports free-tier metrics
    ok 2 - 2. Quota dashboard enforces admin authentication and reports free-tier metrics
      ---
      duration_ms: 4.9819
    # Subtest: 3. Student OTP challenge and verify workflow works with Brevo quota tracking
    ok 3 - 3. Student OTP challenge and verify workflow works with Brevo quota tracking
      ---
      duration_ms: 17.7728
    # Subtest: 4. Dual-Admin verification invariant: Creator CANNOT approve own pattern change
    ok 4 - 4. Dual-Admin verification invariant: Creator CANNOT approve own pattern change
      ---
      duration_ms: 72.4356
    # Subtest: 5. Resource Library: Enforces previewAllowed vs downloadAllowed
    ok 5 - 5. Resource Library: Enforces previewAllowed vs downloadAllowed
      ---
      duration_ms: 2.8987
    # Subtest: 6. Test Runner & Scoring: Accurate calculation of positive & negative marks
    ok 6 - 6. Test Runner & Scoring: Accurate calculation of positive & negative marks
      ---
      duration_ms: 4.5693
    # Subtest: 7. Audit Logging: Audit trail contains immutable events
    ok 7 - 7. Audit Logging: Audit trail contains immutable events
      ---
      duration_ms: 0.2309
    1..7
ok 1 - SidPrep 2.0 Shared API Test Suite
1..1
# tests 7
# suites 1
# pass 7
# fail 0
```

### 1.2 Mobile Test Suite (`@sidprep/mobile`)
Command: `pnpm --filter @sidprep/mobile test`  
Runner: `tsx --test tests/**/*.test.ts`

```text
TAP version 13
# Subtest: SidPrep 2.0 Mobile API Integration with Shared Backend Contract
    ok 1 - verifies student email OTP and receives JWT tokens
    ok 2 - fetches verified exams with official status and dates
    ok 3 - runs mock test attempt with monotonic answer sync and authoritative grading
    ok 4 - enforces download permission gating (downloadAllowed: false returns 403 Forbidden)
    1..4
ok 1 - SidPrep 2.0 Mobile API Integration with Shared Backend Contract

# Subtest: AnswerSyncEngine & Offline Sync Queue
    ok 1 - assigns monotonically increasing client sequences
    ok 2 - records answers locally in SQLite database before network sync
    ok 3 - marks answers as SYNCED once server sync succeeds
    1..3
ok 2 - AnswerSyncEngine & Offline Sync Queue

# Subtest: Server-Authoritative Scoring & Negative Marking Invariants
    ok 1 - correctly calculates marks with SSC CGL negative marking rules (+2.0 / -0.5)
    ok 2 - prohibits inventing percentile or rank when sample size is below threshold
    1..2
ok 3 - Server-Authoritative Scoring & Negative Marking Invariants

# Subtest: Telemetry & Security Sanitization
    ok 1 - generates unique request correlation IDs with corr_ prefix
    ok 2 - sanitizes and strips sensitive data (passwords, OTPs, JWTs, emails)
    1..2
ok 4 - Telemetry & Security Sanitization
1..4
# tests 11
# suites 4
# pass 11
# fail 0
```

### 1.3 TypeScript Compilation Checks
- `pnpm --filter @sidprep/contracts run build` $\rightarrow$ Exit code 0
- `pnpm --filter @sidprep/design-tokens run build` $\rightarrow$ Exit code 0
- `pnpm --filter @sidprep/api build` $\rightarrow$ Exit code 0
- `pnpm --filter @sidprep/mobile typecheck` $\rightarrow$ Exit code 0

---

## 2. Release Gate Verification Summary (`05_QA_Release_Checklist.md`)

| Checklist Item | Target Invariant | Actual Code Verification | Status |
|---|---|---|---|
| **Admin Route Auth** | All `/admin/*` require server-validated auth | `requireAdminAuth` hook returns 401 unauth / 403 inactive | **PASS** |
| **No Demo Client Bypass** | No client `mock_admin_token` or fallback logins | Stripped in `apps/web/src/app/admin/login/page.tsx` | **PASS** |
| **No Hardcoded Prod Secrets** | Zod runtime refuses default signing secrets in prod | Refinement check in `apps/api/src/config/index.ts` | **PASS** |
| **Route Mismatches** | Student challenge, verify, attempt, download, study tasks | Dual-compatible handlers in `authRoutes`, `testRoutes`, `userRoutes`, `resourceRoutes` | **PASS** |
| **Honest Countdowns** | No flooring past dates to 0 days | Tri-state in `ExamCountdownCard.tsx` (`UPCOMING`, `COMPLETED`, `UNANNOUNCED`) | **PASS** |
| **Download Gating** | Preview-only files cannot be downloaded | 403 Forbidden enforced in `handleResourceDownload` | **PASS** |
| **Scoring Invariants** | Server-authoritative timing and marking | `+2.0 / -0.5` SSC CGL marking evaluated in `POST /attempts/:id/submit` | **PASS** |
| **No Fake Percentiles** | Prohibit inventing rank without sample size | `isSampleSufficientForRank: false` returned when $N < \text{threshold}$ | **PASS** |
| **Ink & Moss v2** | Pure Ink & Moss palette across Web & Mobile | Verified tokens in `@sidprep/design-tokens` | **PASS** |
