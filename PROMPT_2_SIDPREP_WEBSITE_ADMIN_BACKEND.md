# PROMPT 2 — SIDPREP 2.0 PUBLIC WEBSITE + ADMIN PANEL + SHARED BACKEND (GREENFIELD BUILD)

## Your role
Act as a Principal Full-Stack Architect, Senior SaaS Product Director, EdTech CMS Architect, Data Security Engineer, News-Source Verification Specialist, SEO Technical Lead, DevOps Engineer, and Senior QA Lead. You must produce implementation-ready code, not mockups or a long unexecuted proposal. Make clear, justified tradeoffs for a small self-hosted production stack.

## Mission
Rebuild the existing SidPrep web/admin/backend system as a fresh, integrated **public student website + secure admin CMS + shared mobile REST API**. Use earlier SidPrep specifications and the uploaded admin/QuizBot screenshots as workflow/design references, not existing code to patch. The companion student app is built by Prompt 1 against the SAME OpenAPI schema. No duplicate business logic or separate content databases.

**Do not erase anything automatically.** Inspect existing Git/deployment state and create a verifiable source/config/database/media backup. Build in a clean workspace/branch/repository structure. Explicit human authorization required for destructive cleanup, Git force-push, domain DNS changes or production deployment. Do not import old passwords or example credentials. Never expose secrets in prompts, source, build logs or client code.

## Domains and hosting
- Public student website: `https://sidprep.in/`
- Secure admin: `https://sidprep.in/admin` (all admin paths protected)
- REST API: `https://api.sidprep.in/v1`
- Brevo transactional email for email OTP and essential student communications.
- Oracle Cloud Always Free VM and Cloudflare Free are already provisioned; inspect their CURRENT configuration before modifying any infra. Do not repeat initial account/domain setup without need.

**Cost reality:** Oracle's current official Always Free page describes 1,500 A1 OCPU-hours + 9,000 GB-hours per month, equivalent to roughly 2 A1 OCPUs and 12 GB RAM for an Always Free tenancy; 200 GB of combined block volumes. The older project guide's 4 OCPU/24 GB assumption must be independently verified against actual account/quotas. Never label a deployment 'free forever' without checking thresholds, metering and available capacity. Brevo Free's 300 emails/day, Cloudflare R2 Standard free storage/operation allowances, Expo cloud quotas and app-store fees are constraints. Add usage alerts and refusal/fallback modes before crossing quotas. R2 may require enabling billing and charge for overage. Only the owner can authorize billable features.

## Architecture — prefer lightweight over complexity
- One TypeScript monorepo: `apps/web` (Next.js student website AND admin panel), `apps/api` (Fastify TypeScript API), `apps/mobile` (companion app), `packages/contracts`, `packages/design-tokens`, `packages/ui` (web UI only), and `packages/config`.
- Public pages are statically generated/cached wherever possible; admin pages are dynamic and auth-protected. Next.js App Router + Tailwind CSS + shadcn/ui + accessible table/editor components; version-pin compatible stable packages and minimize client-side JS.
- Fastify API with validation (Zod or equivalent), typed OpenAPI, least-privilege sessions, request IDs, and consistent errors. Choose a maintained SQL/ORM layer (Drizzle or Prisma) after benchmarking simplicity and resource footprint. PostgreSQL is the sole data store at launch.
- Self-hosted scheduler/worker using systemd timer/cron or a small worker process backed by PostgreSQL `FOR UPDATE SKIP LOCKED` claims, retry counts, leases, dead-letter states and unique/idempotency keys. **Do not require Redis/BullMQ/Kafka/Kubernetes** for beta. Add only with measured workload need.
- One Docker Compose environment on the existing Oracle VM (web, API, PostgreSQL, scheduled worker, reverse proxy). Reserve CPU/RAM for database; use health checks, log rotation, safe restarts, non-root containers and DB backups. Support ARM64. Use HTTPS end-to-end with correct Cloudflare origin TLS; keep Postgres and worker internal-only.
- Cloudflare for DNS/proxy/caching/WAF where available on Free. Never cache `/admin`, private resources, authentication responses or user API responses in public CDN. Strong CSP, CSRF/session protections, secure cookies and rate limiting.
- Cloudflare R2 private Standard bucket for learning files and generated preview PDFs if it fits free quotas; record monthly storage and requests. Evaluate available storage before committing. Backup sensitive data to an independent, owner-approved location; a backup on the same VM alone is not disaster recovery.

## PUBLIC STUDENT WEBSITE: `sidprep.in`
Design a student-friendly, mobile-first, fast, accessible marketing/information website, distinct from the admin UI. Its job is to explain SidPrep and drive real app installs and learning engagement—not to publish invented app features.

Required public routes/pages:
- `/`: clear value proposition, professional hero, app screenshot previews, exam-family selector, benefits, CTA to Android download/store (use real link or 'coming soon'), testimonials only if genuine, FAQs, privacy links.
- `/features`: mock tests, PYQs, progress analytics, topic practice, current affairs, personalized study plans, alerts, resource previews, multilingual support, offline answer reliability (describe accurately).
- `/exams/ssc`, `/exams/rrb`, `/exams/wbpsc`, `/exams/ibps`: exam-specific landing pages with administratively verified subexams/stages/syllabi. Include dates/patterns/cutoffs only when verified and dated; official source links. No fabricated exam schedules.
- `/current-affairs`: SEO-friendly index of approved published current-affairs briefs, category/state/exam filters, date archive, credible attribution, link to source, corrections and unique canonical articles. Only publish content from CMS-approved workflow.
- `/resources`: searchable public resource catalogue; anonymous preview only if approved; downloads only when admin public policy allows. Protect private/student-only resources.
- `/app`: downloads, genuine screenshots, minimum versions and installation instructions. Never imply app is published before it is.
- `/about`, `/contact`, `/help`, `/privacy`, `/terms`, `/disclaimer`, `/data-deletion`.

Design: SidPrep's indigo `#3B4CCA`, light canvas `#F6F7FB`; Manrope + Inter; consistent Lucide iconography; WCAG AA contrast, compact sections, clean search and filters, polished but no decorative bloat. Optimize semantic HTML, responsive grids and keyboard/screen-reader accessibility.

SEO: sensible page metadata, robots/canonicals, XML sitemap, feed, Open Graph, responsive images, alt text, breadcrumb navigation, and legitimate `SoftwareApplication` structured data if eligible. Index only public approved articles. Do NOT index `/admin`, authentication, drafts, resource private URLs or user accounts. No fabricated testimonials, awards, ratings or search schema. Establish manageable editorial templates and accurate page status for unlaunched features.

## ADMIN PANEL: `sidprep.in/admin`
Rebuild the management UI using the provided SidPrep screenshots and QuizBot Admin screenshot as functional references. Do NOT copy QuizBot brand/assets or create a lookalike. Provide a clean compact desktop-first console with responsive tablet support, collapsed sidebar, command search, breadcrumbs, alerts, user menu and real API health.

Use reusable accessible cards, filters, bulk-action tables, drawers, wizard-style forms, confirmation dialogs, saved filters where useful, and responsive skeleton/error states. Reduce giant cards and visual dead space. Never hardcode counts, 'API active', source-verified badges or metrics; show actual data or an explicit unknown/error state.

Core administration modules:
1. **Overview:** total/active students, registrations, OTP success/fail, daily active learners, tests attempted/submitted, answer-sync errors, content awaiting review, current-affairs ingest/publish status, top exam targets, background queue, API/resource health, cost quotas.
2. **Exam catalogue & patterns:** SSC/RRB/WBPSC/IBPS, exams/stages/sections, marks, negative marking, duration/section lock, syllabus topic weights, source URL and date; versioned verified data. Dual-admin verification for official pattern changes—creator cannot approve own change. Archive the authoritative official notice where rights allow. No invented numbers.
3. **Shared taxonomy:** subject > topic > subtopic hierarchy, weights and mappings per exam/stage, duplicate merge review, import/export, revision history.
4. **Question bank:** item editor, MCQ answer/options, multilingual en/hi/bn, images/LaTeX, PYQ year/shift/source, difficulty, tags, duplicate detection, review/translation workflow, bulk CSV/XLSX/DOCX imports with staging and error reports. Never auto-publish unreviewed imported questions.
5. **Test builder:** create full/section/topic/PYQ tests from verified patterns; blueprint builder, server-scored rules, preview, publish scheduling, scheduling limits and availability. Source of truth for mobile API.
6. **Daily quiz, study plans, flashcards and badges:** content, per-exam plans and milestones, notification rules, scheduling.
7. **Current affairs automation and CMS:** see mandatory detailed pipeline below.
8. **Official alerts and cutoffs:** attach verified source URLs and documents, tagged by exam; prevent any 'official' badge when source is missing or a placeholder. Version history and admin approval for sensitive alerts.
9. **Resource/document library:** see mandatory media policy below.
10. **Student user management:** see detailed controls below.
11. **Notifications & transactional email:** event templates, announcements, exam-targeted segmentation, queue, quiet hours, Brevo send quota, delivery failures, no spam or unauthorized marketing.
12. **Analytics & reports:** exams/content/attempt quality, question error flags, completion funnel; aggregate/de-identify by default.
13. **Admin team, roles, audit logs, system health, quotas and settings:** see detailed controls below.
14. **Optional external ingestion connectors (including prior QuizBot API):** keep DISABLED by default until owner provides authorized credentials and confirms source contract. Dry-run previews, rate limits, duplicate detection, schema validation, draft-only import, no unpublished content in mobile app. Never expose platform API secrets to browsers.

## MANDATORY: AUTOMATED CURRENT AFFAIRS FETCH → APPROVE → PUBLISH
The user wants relevant news to appear at a scheduled time, with admin approval available AND a separately configurable automatic publishing option.

**Source quality and copyright:** Maintain an admin-controlled allowlist of legitimate official/public, licensed RSS/Atom/API sources, including suitable government/PIB feeds and other sources that explicitly permit the intended use. Verify feed URLs and permissions before enabling; respect robots/ToS/rate limits. Do not scrape paywalled sites, evade blocks or copy full copyrighted news articles/passages. Create ORIGINAL concise fact-based summaries with title, source, URL, published date, fetch time and relevant attribution. Prefer links to official primary sources. No expensive proprietary LLM dependency is allowed; use deterministic rules/templates and editorial review; optional self-hosted NLP only if resource benchmarks justify it. Never fabricate dates, quotes, statistics, schemes, cutoffs or exam implications. If unverified, mark pending and do not publish automatically.

**Admin controls per source and globally:** Enable/disable; source URL/license status; categories; covered exam bodies/stages; priority/quality; fetch interval; number of items; max summarization length; permitted language; local timezone; approval mode; auto-publish threshold; publish time; dedupe rules; quiet/blacklist keywords; manual pause; review owner; error escalation.

**Workflow (Asia/Kolkata):**
1. Scheduler fetches allowed RSS/API feeds at admin-set time (example 05:30 IST; do not hardcode this as the only option).
2. Fetch `If-Modified-Since`/ETag, timeouts, rate limits and retry/backoff. Record `sourceId`, URL, source publication time, fetched time, content hash, canonical URL, raw metadata and license flag.
3. Normalize titles/data, discard malformed/duplicate/too-old/off-topic items, detect aliases and syndicated duplicates.
4. Classify using configurable categories: Polity, Economy, Banking, Government Schemes, Science/Tech, Environment, Geography, History/Culture, Sports, Awards, International, Railways, West Bengal, National, Static GK links. Score relevance separately for SSC/RRB/WBPSC/IBPS; only include explicitly justified tags. Official exam notifications go into Alerts rather than misleading general news.
5. Create a fact-checked editorial **draft** containing a short ORIGINAL summary, key facts, source attribution, date, approved image only when license permits, exam relevance, 1–3 suggested revision pointers and an optional question proposal. Draft translations must remain pending until checked by an approved reviewer.
6. Apply confidence and policy checks; reject forbidden sources, missing attribution, unsupported claims, probable copied text, or missing date. Queue flagged drafts for review.
7. **Default mode: MANUAL_APPROVAL.** Editor views the source beside the proposed summary; edits, rejects, requests correction, or approves. Content status flow `FETCHED -> NORMALIZED -> DRAFT -> IN_REVIEW -> APPROVED -> SCHEDULED -> PUBLISHED`, with `REJECTED`, `FAILED`, `RETRACTED` states; publish time example 07:00 IST.
8. **Optional mode: CONDITIONAL_AUTO_PUBLISH**, off by default. A Super Admin can enable it only for specifically approved trustworthy sources/categories and strict guardrails (exact source allowlist, extractive verifiable facts, no unsupported figures, clear source link, age limits, duplicate threshold, language verified, no sensitive official exam-pattern change). Log the rule version and automatic decision. Sensitive or ambiguous items ALWAYS require human review. Allow per-item manual override, rollback, correction and emergency pause. If approval/quality threshold is unmet at publish time, leave content unpublished—do not backfill with fictional stories.
9. Once published, emit content version for app `/v1/current-affairs` and website `/current-affairs`; invalidate public cache, issue exam-targeted digest notification only if enabled and in quota.
10. Store a complete activity trail: fetch run, feed health, draft revision, who approved, who published, if auto-published the rule ID and evidence, later corrections, removals and deliveries.

Provide scheduling UI, 'Run Fetch Now' (safe idempotent), dry-run preview, review queue, batch approve with authorization, publish calendar, status widgets, per-source errors, unprocessed count, and failure notifications. Build tests for duplicates, outages, incorrect source, wrong timezone, double publish, RSS poison, copyright policy, inaccurate tags and auto-publish disabled.

## MANDATORY: RESOURCE LIBRARY AND BUILT-IN FILE VIEWER
Admin can upload PDF, DOCX and common image formats, with metadata: title, description, exam/stage/subject/topic/language, license/source, status, version, owner, audience, visibility, `previewAllowed`, `downloadAllowed`, `offlineAllowed`, publication date and expiry.

Features:
- Upload with type magic-byte validation, bounded size, antivirus/sandbox scanning when available, malicious file blocking, quota and file count limits, SHA-256 dedupe and object version tracking.
- Generate safe preview: browser PDF.js/viewer for PDF; sanitized PDF or HTML preview for DOCX using a sandboxed **server-side conversion** once at upload time (avoid running conversion on each view); protected thumbnail/image previews; never execute macros or allow active embedded content. Keep originals private.
- Support browser preview on web and app preview APIs; previews should be fast, paged and served with short-lived access control. Large docs may require per-page previews/thumbnails.
- **Critical policy:** preview permission and download permission are distinct. `downloadAllowed=false` hides download UI AND denies any direct authenticated download endpoint. `downloadAllowed=true` allows only authorized audience with short-lived signed URL or streamed response with correct content disposition and audit event. No public bucket exposure of student-private originals. A preview-only file cannot be made screenshot-proof; do not market it as DRM.
- Admin can update/expire/revoke permissions instantly, preview student experience, see views and permitted downloads (privacy-conscious aggregate analytics), see storage quotas, and restore authorized prior versions.
- Optional downloadable handouts on website only when their audience and download permissions allow it.

## MANDATORY: USER MANAGEMENT
Student directory: indexed search, filters (exam target, signup cohort, language, last active, status), accurate user timeline, masked PII by default, email verified state, optional phone, notification choices, attempts and subscriptions only if actually implemented. Support support tickets, data export/deletion request, consent/preferences, notification opt-out, session revocation, disable/reactivate with reason, duplicate-account investigation under access control, suspicious login monitoring, impersonation PROHIBITED (use explicit supervised support view). No reset of score/streak without audited reason. Bulk operation guards and dry-run. Avoid unrequested paid plan/payment complexity in the zero-cost MVP.

Admin roles: SUPER_ADMIN, CONTENT_MANAGER, EXAM_EDITOR, REVIEWER, CA_EDITOR, TRANSLATOR, SUPPORT, ANALYST, AUDITOR/SECURITY. Implement granular server-enforced permissions and least privilege, not just hidden buttons. Require admin password + authenticator TOTP (no Brevo email for each admin login), secure session cookies, device/session list, 2FA recovery codes, brute-force limits, trusted origin, timeouts and step-up authentication on destructive/high-risk actions. Two-person approval for official pattern changes and sensitive auto-publish settings; creator cannot self-approve. Require reason on sensitive account actions.

## MANDATORY: BOTH APP AND ADMIN LOG MANAGEMENT
Implement three distinct layers with a single searchable control center:
1. **Immutable append-only audit log**: admin logins, failed attempts, roles/permissions, create/edit/delete/version/publish, exam approval, current-affairs fetch and auto rules, files/download-policy changes, student-account actions, consent/export/deletion, external imports, system setting changes, and actor/target/time/IP risk metadata. Prevent ordinary admin editing or deletion.
2. **Operational logs**: API failures, latency, retry exhaustion, cron runs, feed errors, storage errors, email delivery/error codes, service health, scheduled jobs, database backup outcomes. Keep sanitized structured JSON and rotate/compress; avoid huge logs or storing secrets.
3. **Student app telemetry**: crashes, sync conflicts, API failures, app versions, OS, anonymously scoped user IDs, view/download errors; sampled/batched/capped with privacy controls. No OTPs, passwords, JWTs, answer content or raw PII in logs.

Admin logs UI: searchable table and details drawer, date/time, UTC/IST display, module, actor, role, target, action, outcome, request/correlation ID, device/IP where authorized, change summary with sensitive fields redacted, export restricted to security roles, retained per documented policy, alert rules for suspicious actions, storage-cap metrics. Partition/prune operational logs on schedule; immutable audit retention requires reviewed retention policy. Do not call a DB table tamper-proof without independent controls. Log access to logs themselves.

## COST CONTROLS AND FREE-FIRST RULES
- Implement a quota dashboard for Oracle CPU/memory/disk/backup, Cloudflare R2 bytes/requests, Brevo daily send count and queues, API usage and content fetches.
- Default to small RSS schedules, aggressive response caching, single-source canonical content, compressed previews, pagination and conservative retry.
- Warn/disable nonessential uploads, newsletters, mass email and optional background work BEFORE service limits are exceeded; do NOT silently enable paid billing.
- Essential account email is prioritized over marketing email. Preserve honest delivery status and alternatives when daily Brevo limit is reached (e.g., retry later; do not bypass anti-abuse controls).
- No subscriptions to paid AI services, paid scraping tools, managed databases or premium monitoring. Domain renewal and app-store account fees are not free.
- Zero-cost capacity is a **pilot/beta target**, not a promise of 20,000 concurrent attempts or uninterrupted production availability.

## Security, quality and compliance
Enforce server-side permissions on every admin and file API action, CSRF for cookie-backed actions, strong CSP, CORS origin allowlist, parameterized queries, input sanitization, secure upload handling, SSRF protection for feed fetching (block internal/private addresses and redirects), rate limiting, idempotency, HTTP security headers and encrypted secrets. Protect OTP endpoints against spam and enumeration. Follow OWASP web/API guidance. Keep private resources out of public cache and search indexes. Account privacy/deletion and minors' protections need current legal review, not a blanket '100% DPDP compliant' claim.

## Delivery sequence
**Phase 0 — Preserve:** Audit old docs/repo, export verified backups, confirm live Oracle/Cloudflare quotas and architecture decision record; don't delete live project.
**Phase 1 — Foundation:** Clean monorepo, contracts/OpenAPI, DB schema/migrations/seeds, auth/RBAC, health endpoints, logging foundations, Docker Compose local development and non-production staging.
**Phase 2 — Public site:** Build high-quality SEO-friendly student website and CMS-driven exam pages; live honest marketing content.
**Phase 3 — Admin:** Shared design system, dashboard, exams/taxonomy/question bank/test builder, approvals and audit trails.
**Phase 4 — News:** RSS source registry, scheduled fetch, dedupe/classification, manual editorial approval, scheduled publish, optional guarded auto-publish, current-affairs website/app APIs.
**Phase 5 — Files/users:** Safe file upload, PDF/DOCX/image preview, download permission enforcement, user/support/consent tools, OTP and app telemetry.
**Phase 6 — Integration:** Connect student app contract, content delivery, QA, staging and security review.
**Phase 7 — Deployment:** Owner-approved rollout to Oracle + Cloudflare with rollback, backups, health monitoring, runbooks and documented free-tier usage.

## Data model (minimum conceptual entities)
`Student`, `StudentSession`, `EmailOtpChallenge`, `Consent`, `ExamBody`, `Exam`, `ExamStage`, `ExamPatternVersion`, `PatternVerification`, `SyllabusTopic`, `ExamTopicWeight`, `Question`, `QuestionTranslation`, `QuestionReview`, `Test`, `TestSection`, `TestQuestion`, `Attempt`, `AttemptAnswer`, `StudyPlan`, `CurrentAffairsSource`, `NewsFetchRun`, `NewsCandidate`, `NewsDraft`, `NewsRevision`, `NewsApproval`, `NewsPublishRule`, `PublishedCurrentAffairs`, `DailyQuiz`, `Resource`, `ResourceVersion`, `ResourceAccessPolicy`, `ResourceAccessEvent`, `Notification`, `AdminUser`, `AdminRole`, `AuditEvent`, `OperationalEvent`, `AppTelemetry`, `JobRun`, `SystemSettings`, `ServiceQuotaSnapshot`. Normalize and reduce entities where appropriate, but preserve key invariants, source provenance, versioning and admin access controls.

## Tests and handoff acceptance
Build real unit/integration/e2e checks:
- Public website routes/SEO, admin authentication and 2FA, no admin exposure from public cache.
- RBAC and dual-approval abuse cases; reviewer cannot approve own version.
- News ingestion correctness, source allowlist, no full copyrighted article reproduction, dedupe, editor approvals, guarded opt-in auto-publish, scheduling in Asia/Kolkata, rollback and corrections.
- Media file validation, DOCX preview generation, PDF/image preview, no unauthorized original downloads, expired/revoked signed URL behavior, storage usage.
- User search masking and role restrictions, consent/export/deletion handling, complete logs and secret redaction.
- OTP send-limit handling, malformed inputs, rate limiting, API contract compatibility with mobile app, backup and restore exercise, ARM64 container viability, no accidental billable resource creation.

Handoff: produce the runnable source repository, directory map, data model/migrations, OpenAPI spec, environment template with placeholder values, local/staging/production runbooks, screenshots for the public site and admin console, test/build evidence, current free-tier usage assumptions and limitations, plus a prioritized unresolved-issues report. Use real source content and real API data, never invented exam counts or 'verified' statuses. Do not deploy or destroy old services without an owner approval gate.

**Final instruction:** Deliver a credible, lean, student-focused SidPrep 2.0 service—with a genuinely useful public website, manageable admin panel, controlled current-affairs automation, safe file previews, precise download permission, strong user operations and complete auditability—inside verified free-tier limits where feasible, without overstating capacity, automation accuracy or legal compliance.
