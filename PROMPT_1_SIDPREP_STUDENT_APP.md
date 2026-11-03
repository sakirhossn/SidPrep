# PROMPT 1 — SIDPREP 2.0 STUDENT MOBILE APPLICATION (GREENFIELD BUILD)

## Your role
Act as a Principal React Native/Expo Architect, Senior Mobile Product Designer, Competitive-Exam Learning Specialist (SSC, RRB, WBPSC, IBPS), Mobile Accessibility Engineer, Offline-First Systems Engineer, and Production QA Lead. You are implementing a REAL, production-capable student mobile app, not a mockup.

## Mission and project boundaries
Rebuild **SidPrep** from a clean starting point as a small, fast, high-quality Android-first student application, with iOS-ready code. It will connect to the shared backend/API being built by the separate Web + Admin + Backend workstream. Do NOT create a separate student backend or database. Do NOT silently clone old code or carry over known defects. Use the supplied historical documents (`SPEC.md`, `PRODUCT_ADDENDUM.md`, `UI_REFERENCE_AUDIT.md`, `openapi.yaml`, `PROJECT_HANDOVER.md`, `ORACLE_CLOUDFLARE_GUIDE.md`) as **business requirements**, not as a guarantee of what was previously implemented. Where documents conflict, follow this new brief, and record the conflict. The old app is a reference only.

**IMPORTANT REPOSITORY SAFETY:** Before any destructive operation, identify the current Git remote and uncommitted changes. Save a verified backup/tag/archive and retain migration files in a separate location. Work in a NEW directory/new branch/new repository structure. Never delete an existing repository, production database, bucket, DNS zone, or credentials automatically. Require explicit human approval for deletion and production deployment. Do not copy example secrets from old documentation.

Project domains:
- Student information and features: `https://sidprep.in`
- Student API: `https://api.sidprep.in/v1`
- Secured administration: `https://sidprep.in/admin`
- Email OTP: Brevo (backend-controlled, never directly from mobile).

### Technology decisions
- React Native + Expo SDK **latest stable mutually compatible versions at implementation time** + TypeScript strict.
- Expo Router or established navigation; select one and document why.
- `expo-font` for local font loading, secure store for auth tokens, SQLite for safe local offline data, and a lightweight typed state/query library when justified.
- Shared API client generated or validated from OpenAPI, with request timeouts, typed errors, retries only for safe/idempotent calls, token refresh, and connectivity awareness.
- Reuse a small `packages/contracts` and `packages/design-tokens` from the new monorepo. Do not import server-only code into the app.
- Native or Expo-supported PDF viewer; other attachments may be rendered using safe server-generated previews.
- Avoid unnecessary heavy animation, browser WebViews for core flows, unnecessary background network calls, analytics SDK bloat, and a large UI-component framework.

## Learner experience and language
Target SSC CGL/CHSL/MTS, RRB NTPC Graduate/Undergraduate & Group D, WBPSC Miscellaneous/Clerkship/Food SI, and IBPS PO/Clerk/RRB PO/RRB Clerk/SO. All exam bodies, stage rules, syllabus, subjects, marks, durations, cutoffs, and deadlines must be **admin-managed**; never invent or hardcode official rules. Preserve stage-specific and topic-specific exam weightings. Show source and verification date for official changes.

Students choose one or more exam targets, preferred language (English/Hindi/Bengali), daily study goal, and notification preferences. Multilingual app text uses genuine translations or a visible fallback—not silent machine-made claims of verified translations. A selected exam drives the content feed, study plan, mock recommendations, current-affairs categories, and reminder schedule.

## Design language
Build a polished, focused, lightweight EdTech interface (not a gaming app). Primary indigo `#3B4CCA`; light background `#F6F7FB`; white surface; text `#0F172A`; muted `#475569`; green/teal `#0F766E`; amber `#F59E0B`; red only for real errors. Support accessible dark mode with tokens.

- Manrope (English headings and metrics), Inter (English body), Noto Sans Devanagari and Noto Sans Bengali (script-specific fallbacks).
- A single icon family, preferably `lucide-react-native` if compatible.
- Bottom navigation: Home, Mocks, Affairs, Profile. The study plan and resources may be surfaced through Home and contextual navigation rather than extra permanent tabs.
- Correct Android/iOS safe areas, text scaling, accessible contrast, 48dp Android touch targets, skeletons, offline/error states, haptics only where helpful.
- Compact exam countdown, progress, streak, accuracy, daily target, last mock, and next recommended practice. All values must come from the server or clearly marked local pending state. No fabricated performance numbers.

## Implement these real screens and journeys
1. **Onboarding / exam selection**: welcome, app benefits, choose SSC/RRB/WBPSC/IBPS exams and stages, optional goals; editable later.
2. **Account / email OTP**: valid email required, phone optional; Brevo OTP generated/verified by the backend with expiration, send limits, enumeration-resistant messaging, session refresh and revocation. Do not send OTP email directly from mobile or expose Brevo keys. Avoid forcing repeated login.
3. **Home dashboard**: selected exam, verified exam date/status (or 'date not announced'), realistic countdown only when official date is present, coverage, streak, target minutes, accuracy, resume attempt, plan, and recommended activities.
4. **Exam hubs & syllabus**: exam stages, official patterns, sections, subject/topic tree, bookmarks, progress, official alerts, verified notices, and date of last verification.
5. **Mock catalogue**: full-length, sectional, topic-wise and PYQ tests; filters for exam/stage/subject/difficulty/language, free/locked availability, scheduled/open state, clear estimated duration and attempts.
6. **Mock runner**: fast question rendering including images and math; stable test timer; mark for review, question palette, clear response, next/previous, answer save, network interruption handling, accessible options, clear submission confirmation. Timers, negative marking and section-lock rules remain server-authoritative. Never expose answer keys before completed submission. Use monotonic client sequences and transactional idempotent answer synchronization; distinguish 'saved locally', 'synced', and 'not saved'. Never imply an offline test was formally submitted when server confirmation is absent.
7. **Results**: score, accuracy, time per question, sections, verified rank/percentile with sample size when available, correct/wrong/unattempted, solution review after submission, weak topics and next steps. Don't invent ranks or comparison groups.
8. **Daily current affairs**: show published exam-relevant news briefs with original short summaries, source link, publication date, category, state/exam tags, importance, verification label, language, bookmarked state and daily quiz. This must be fed by the approved backend publishing workflow, not by client-side scraping. Show corrections or withdrawals if issued.
9. **Study plan**: server-configured daily tasks, completion, daily goal, revision, missed tasks, weak-topic recommendations; keep a simple mobile editing experience.
10. **Resource library**: search and filter notes/PDFs/DOCX/images by exam, stage, language, subject, content type, topic and date. Allow **in-app preview** for approved files without automatically downloading full files. PDF display should support pagination, zoom and large-file progressive loading where feasible. DOCX should use a sanitized, backend-generated PDF/HTML preview; images should be zoomable and preserve aspect ratio. Show title, description, source, uploaded date, size and permission. The **Download** action must appear only when `downloadAllowed=true` AND the user is authorized. Use a short-lived authorized download URL; handle expiry and offline failures. Preview-only is NOT DRM; don't claim screenshots or file extraction can be fully prevented. File previews must not run active Office content/macros. Explicit offline caching only for permitted materials; expiration and logout should clear restricted files.
11. **Notifications**: official exam alerts, approved current-affairs digest, study reminders, test events, upload/resource updates. Allow opt-ins, quiet hours, and per-exam targeting; use an available free push route if it meets current restrictions. Do not require paid SMS.
12. **Profile/settings**: account details, linked email, optional phone, exams, language, text size, theme, notification choices, download history, active sessions, data export/deletion request, help/contact, app version.
13. **Error/empty/offline/update states**: retry, cached last known content with 'last synced' label, maintenance state, minimum-supported-app version; never display fictional data as live content.

## App logging and security
- Generate per-request correlation IDs and anonymized diagnostic events for app startup, API failure, sync conflict, crash, rendering failure, file-preview failure and notification delivery/open where consent permits.
- Send batched, rate-limited events to shared backend `/v1/telemetry`; queue offline only within capped storage. Do not store OTPs, JWTs, answer text, email addresses, raw phone numbers or sensitive file contents in app logs.
- Admin panel must later be able to filter mobile events by app version, OS, timestamp, event code, exam and anonymous user ID; respect user privacy and the retention policy.
- Store access tokens securely, not in AsyncStorage. Harden deep links, validate file URLs, and prohibit untrusted WebView navigation.
- Account deletion, underage safeguards, disclosures and retention must be reviewed against current applicable Indian law; do not claim automatic legal compliance.

## Performance and free-tier discipline
- Cache public catalogues with ETag/version and backoff; paginate all large lists; lazily load images and files; use data pagination instead of loading all questions or news at once.
- Bundle only required native packages/assets. Minimize startup IO and CPU-intensive screens. Cache user preferences offline.
- Do not poll for news every minute—use API feed pagination, conditional GET and push/refresh when appropriate.
- Provide a measured APK/AAB size, cold-start timing, memory use and low-end Android device test results; set budgets based on evidence rather than fake guarantees.
- The mobile app should not depend on paid AI APIs, Firebase paid services, phone OTP charges or expensive third-party observability. Free Expo build allowances are finite, and app-store publishing may have fees.

## API contract and coordination
Do not invent endpoints without coordinating with the backend workstream. Define/implement a versioned contract for `/v1/auth`, `/v1/me`, `/v1/catalog`, `/v1/home`, `/v1/exams`, `/v1/tests`, `/v1/attempts`, `/v1/sync/answers`, `/v1/current-affairs`, `/v1/quizzes`, `/v1/resources`, `/v1/downloads`, `/v1/notifications`, and `/v1/telemetry`. These are suggested namespaces, not claims about an existing implementation. Generate OpenAPI schemas and typed clients together with backend. Distinguish 401/403/404/429/5xx and offline.

## Build sequence — no big-bang implementation
A. Inspect historical docs and current repo; produce an architecture decision record and screen/API inventory. Identify any conflicts.
B. Create clean mobile project and shared typed tokens/API client; build font/icon themes.
C. Implement authentication, exam selection, home and exam catalogue against REAL local backend.
D. Implement mock runner + offline answer queue + result processing; test timer/section-lock edge cases.
E. Implement current affairs, study plan and resource preview/download-policy integration.
F. Add notifications, profile, telemetry and accessibility.
G. Complete Android real-device tests, iOS compatibility tests where available, error-state tests and release packaging.

## Required tests and launch acceptance
- Automated typed API integration checks, UI tests and at least one physical low-end Android smoke test.
- Verify email OTP throttling, secure refresh/logout, server-authoritative timer, offline sync with reconnection, duplicate submissions, correct scoring, filtered exam content, language fallback, file preview, download toggle, and event logging.
- No sample scores or official dates shown as verified/live; no exposure of answers before submit.
- Maintain a clear route to Android distribution; never promise Google Play/App Store publication for free.
- Output complete source code, architecture diagram, dependency/license report, `README`, environment variable template (NO SECRETS), local run commands, screenshots, build/test reports and an honest list of unresolved defects.
- Never state 'complete' unless the tests have actually passed; never deploy or delete old infrastructure without approval.

**Final instruction:** Build the leanest genuinely usable SidPrep student app, fully integrated with the new SidPrep backend and admin-managed educational content. Prioritize correctness of exams, clear learning workflows, reliable attempts, and genuine daily value over decorative features.
