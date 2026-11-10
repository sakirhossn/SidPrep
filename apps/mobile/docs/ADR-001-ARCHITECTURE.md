# ADR-001: Architecture Decisions & Screen/API Inventory

## Status
Accepted

## Context
SidPrep 2.0 is a complete greenfield rebuild of the student competitive-exam preparation mobile application (targeting SSC, RRB, WBPSC, IBPS). Previous iterations suffered from fragile state management, hardcoded exam data, unverified live badges, client-side answer verification leakage, and over-engineered serverless architectures. 

This ADR establishes the core technical boundaries for Prompt 1 (Student Mobile App) and documents reconciliation with Prompt 2 (Shared Backend & Admin).

## Decisions

### 1. Framework: React Native + Expo SDK 52 (TypeScript Strict)
- **Rationale:** Best-in-class cross-platform performance, unified maintenance, OTA updates capability, and access to native SQLite and SecureStore without bespoke native bridge modules.
- **Alternatives Considered:** Bare React Native (higher maintenance burden, native toolchain fragility), Flutter (requires separate Dart codebase diverging from TypeScript contracts).

### 2. Navigation: Expo Router v4
- **Rationale:** File-based routing maps directly to deep linking (`sidprep://mock/[id]`), minimizes navigation boilerplate, provides native tab bars with zero configuration overhead, and ensures typed routes across all screens.

### 3. Local Storage & Security Isolation
- **Tokens:** `expo-secure-store` used strictly for authentication JWT tokens (access token and refresh token). Never store auth tokens in plain AsyncStorage or unencrypted storage.
- **Offline Data & Queues:** `expo-sqlite` used for:
  1. Offline answer synchronization queue (ordered with monotonic sequence IDs).
  2. Cached exam catalogue, syllabus trees, and published current affairs briefs.
  3. Capped telemetry buffer.
  4. Local user preferences and bookmarked items.
- **File Previews:** Download action strictly gated on `downloadAllowed === true`. In-app previews use short-lived signed URLs.

### 4. Mock Runner Invariants
- **Authoritative Server Timer:** Client timer displays high-precision countdown, but all test start times, end times, negative marking, and grading calculations are server-authoritative.
- **Answer Key Protection:** Answer keys and explanations are NEVER delivered to the client during an ongoing attempt; only returned upon verified submission.
- **Answer Sync Protocol:** Every user selection generates a locally recorded record in SQLite with a monotonic integer sequence (`clientSequence`). A background synchronization worker flushes these to `/v1/sync/answers`. UI clearly distinguishes:
  - `Saved Locally` (persisted in SQLite, pending network sync)
  - `Synced` (acknowledged by server `/v1/sync/answers`)
  - `Offline` (device currently has no network connectivity)
- **Submission Guarantee:** The app will never claim a test is formally submitted without receiving HTTP 200 from `/v1/attempts/[id]/submit`. If offline, the user is warned and guided to reconnect.

### 5. Exam Data & Verification Truth
- No exam dates, stages, or syllabus rules are hardcoded. If official dates are unannounced, the UI explicitly displays **"Date not announced"**. 
- Official notices display source URL, verification timestamp, and official verification badges.
- Rank and percentile are only displayed if the server verifies that the minimum participant sample size has been met.

## Screen & API Inventory

| Screen | Route | Key API Endpoints | Offline Capability |
| :--- | :--- | :--- | :--- |
| Onboarding | `/onboarding` | `/v1/exams` | Cached available exams |
| Email OTP Login | `/login` | `/v1/auth/otp/request`, `/v1/auth/otp/verify` | Network required |
| Home Dashboard | `/(tabs)` | `/v1/home`, `/v1/me` | Last synced cache |
| Mock Catalogue | `/(tabs)/mocks` | `/v1/tests` | Cached catalogue |
| Daily Current Affairs | `/(tabs)/affairs` | `/v1/current-affairs` | Full offline reading & bookmarks |
| Profile & Settings | `/(tabs)/profile` | `/v1/me`, `/v1/auth/refresh` | Local preferences |
| Exam Hub & Syllabus | `/exam/[id]` | `/v1/exams/[id]` | Cached syllabus tree |
| Mock Overview | `/mock/[id]` | `/v1/tests/[id]` | Cached metadata |
| Mock Runner | `/mock/[id]/runner` | `/v1/tests/[id]/start`, `/v1/sync/answers`, `/v1/attempts/[id]/submit` | Full offline test taking with local SQLite queue |
| Results & Solutions | `/mock/[id]/result` | `/v1/attempts/[id]/results` | Cached after first fetch |
| Daily Quiz | `/quiz/[id]` | `/v1/quizzes/[id]` | Full offline capability |
| Study Plan | `/study-plan` | `/v1/study-plan` | Cached daily checklist |
| Resource Library | `/resources` | `/v1/resources` | Cached catalogue |
| In-App File Viewer | `/resources/[id]` | `/v1/resources/[id]/preview`, `/v1/resources/[id]/download` | Gated download policy |
| Notifications | `/notifications` | `/v1/notifications` | Local notification history |

## Conflict Resolution with Historical Documents
1. **Brevo Email OTP vs. Phone SMS:** Historical notes proposed SMS OTP. Brevo Free tier (300 emails/day) allows zero-cost email OTP. Phone number is optional on registration. Mobile app never calls Brevo directly; calls `/v1/auth/otp/*`.
2. **Offline Grading Claims:** Previous documents claimed offline auto-grading. This build strictly prevents client-side answer exposure; grading happens server-side, with full offline answer queuing during the test.
3. **DRM Claims on Document Previews:** Previews are rendered natively in-app with signed URLs; we do not make false claims about uncircumventable screenshot protection or DRM.
