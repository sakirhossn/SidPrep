# SidPrep 2.0 — Comprehensive Implementation Plan

> **Document:** `implementing-plan.md`  
> **Target Version:** SidPrep 2.0  
> **Status:** Ready for Execution  
> **Author:** Antigravity Engineering (Pair Programming)  

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 Issue 1: Admin Panel Login Failure & "App didn't connect with server"
* **Missing Process Execution**: No API server was active on `http://localhost:4000`. Docker is not installed on the Windows host (`docker: command not found`), so `docker-compose up` was never running the backend containers.
* **API Origin Routing Disconnect**: In `apps/web/src/app/admin/login/page.tsx`, `API_BASE` defaulted to `process.env.NEXT_PUBLIC_API_URL || ''`. In development, relative `/v1/...` requests route through Next.js rewrites to `localhost:4000`. When port 4000 is inactive, the browser receives `ECONNREFUSED`, presenting `Unable to reach the backend API server`.
* **2FA Lockout**: Admin authentication requires Step 1 (password) and Step 2 (TOTP code). If the administrator doesn't have an authenticator app configured with the seed `JBSWY3DPEHPK3PXP`, they are blocked at Step 2.
* **Mobile Connection Drop**: In `apps/mobile/src/api/client.ts`, `localhost:4000` does not route to the host machine when run on Android devices/emulators (which require `10.0.2.2:4000` or LAN IP).

### 1.2 Issue 2: Brevo Email & OTP Key Mismatch
* **Key Type Mismatch**: The provided key (`xsmtpsib-97074ae277161f493015be656141d02456dbb898dce704165e72d529213940fd-LSNXeocw1KG8vYNm`) is a **Brevo SMTP relay password**, designed for `smtp-relay.brevo.com:587` with username `c0cb63001@smtp-brevo.com`. The existing codebase tried to call the Brevo REST API (`api.brevo.com/v3/smtp/email`), which rejects SMTP keys.
* **Missing Send Call**: In `apps/api/src/modules/auth/index.ts`, the student OTP handler generated an OTP in-memory and logged a statement, but **never invoked `sendEmail()`**. No emails were ever being dispatched.

### 1.3 Issue 3: Missing Student Login & Registration on Website
* The website (`apps/web`) completely lacks any login or registration pages or auth state.
* The public header only links to `/app` (Download APK).

### 1.4 Issue 4: Demo Data Clutter Without Purge Ability
* `apps/api/src/db/index.ts` seeds demo mock exams, questions, news articles, and learning resources on startup.
* The admin panel had no mechanism to clear these mock records to begin clean production operations.

### 1.5 Issue 5: Static Website Pages Not Manageable from Admin
* Website pages (`/about`, `/contact`, `/terms`, `/privacy`, `/disclaimer`, `/features`, `/data-deletion`) are hardcoded `.tsx` files.
* Admin has no CMS capability to create new pages, edit content, or delete pages.

### 1.6 Issue 6: Admin Profile Management Missing
* The admin layout sidebar lacks an "Admin Profile" management screen to change passwords, update profile details, or configure notification preferences.

---

## 2. Technical Architecture & Brevo SMTP Specification

### 2.1 Brevo SMTP Configuration
| Setting | Value |
|---|---|
| **SMTP Server** | `smtp-relay.brevo.com` |
| **Port** | `587` (STARTTLS) |
| **Username** | `c0cb63001@smtp-brevo.com` |
| **Password / SMTP Key** | `xsmtpsib-97074ae277161f493015be656141d02456dbb898dce704165e72d529213940fd-LSNXeocw1KG8vYNm` |
| **Sender Email** | `c0cb63001@smtp-brevo.com` (or verified Brevo sender `sksakirhossain8@gmail.com`) |
| **Sender Name** | `SidPrep Notifications` |

---

## 3. Step-by-Step Implementation Phases

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Brevo SMTP Relay & Email OTP Dispatcher            │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Fix Admin Login, 2FA via Email OTP & Server Binding│
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Student Web Login & Registration with Brevo OTP   │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 4: Purge Demo Data Feature (API & Admin UI)           │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 5: Website Dynamic Page CMS (Create/Edit/Delete Pages)│
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 6: Admin Profile Management (Password & Settings)     │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 7: Mobile App & Server Connectivity Self-Healing      │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 8: Verification & E2E Validation                      │
└─────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Brevo SMTP Relay & Email OTP Dispatcher
* **Objective**: Ensure all OTPs (for students and administrators) send real transactional emails via Brevo SMTP relay.
* **Tasks**:
  1. Install `nodemailer` and `@types/nodemailer` in `apps/api`.
  2. Create/Update environment files:
     - `.env` in root
     - `apps/api/.env`
     - `apps/web/.env.local`
     - `apps/mobile/.env`
  3. Refactor [`apps/api/src/lib/email.ts`](file:///d:/Coding/Agent/SidPrep/apps/api/src/lib/email.ts) to use `nodemailer.createTransport({ host: 'smtp-relay.brevo.com', port: 587, ... })`.
  4. Build branded HTML email templates for:
     - Student Login / Registration 6-Digit OTP.
     - Admin 2FA Login OTP.
     - Admin Password Reset & Credentials.
  5. In [`apps/api/src/modules/auth/index.ts`](file:///d:/Coding/Agent/SidPrep/apps/api/src/modules/auth/index.ts), invoke `sendEmail()` during `handleStudentChallenge`.
  6. Add fallback: If SMTP relay network fails or is sandboxed, record dev OTP hint in response for seamless development.

---

### Phase 2: Fix Admin Login & Server Connectivity
* **Objective**: Allow administrators to log in reliably with credentials and receive an email OTP or use TOTP.
* **Tasks**:
  1. Fix `apps/api` startup to bind to `0.0.0.0:4000`.
  2. Enhance [`apps/api/src/modules/auth/index.ts`](file:///d:/Coding/Agent/SidPrep/apps/api/src/modules/auth/index.ts):
     - Support `/auth/admin/send-email-otp`: Dispatches a 6-digit login OTP to `admin.email` via Brevo SMTP.
     - Support verifying either TOTP code (`123456`) OR email OTP.
  3. Update [`apps/web/src/app/admin/login/page.tsx`](file:///d:/Coding/Agent/SidPrep/apps/web/src/app/admin/login/page.tsx):
     - Add button: **"Send 2FA Code to My Email (Brevo)"**.
     - Add clear connection status indicator showing whether the API server is online.
     - Add convenient "Quick Fill Dev Credentials" helper.
     - Ensure auth token & user info are stored cleanly in `sessionStorage` and `localStorage`.

---

### Phase 3: Student Web Login & Registration Page
* **Objective**: Provide web students with an instant passwordless login/register flow using Brevo OTP.
* **Tasks**:
  1. Create [`apps/web/src/app/login/page.tsx`](file:///d:/Coding/Agent/SidPrep/apps/web/src/app/login/page.tsx) with:
     - Step 1: Email input + "Get Verification Code" button.
     - Step 2: 6-digit OTP code input + auto-focus + resend timer.
     - Redirect to home/dashboard upon successful verification.
  2. Create redirect from `/register` to `/login`.
  3. Create client-side authentication helper / context in `apps/web/src/lib/auth.ts`:
     - `getStudentUser()`, `setStudentSession()`, `clearStudentSession()`.
  4. Update [`apps/web/src/components/public-header.tsx`](file:///d:/Coding/Agent/SidPrep/apps/web/src/components/public-header.tsx):
     - When unauthenticated: Show "Sign In" and "Get Started" buttons.
     - When authenticated: Show Student name badge, exam targets, and "Sign Out" dropdown.
  5. Create simple Student Dashboard [`apps/web/src/app/dashboard/page.tsx`](file:///d:/Coding/Agent/SidPrep/apps/web/src/app/dashboard/page.tsx) showing their daily goal, active streaks, and links to Mocks & Current Affairs.

---

### Phase 4: Purge Demo Data Feature (API & Admin UI)
* **Objective**: Give administrators full control to wipe all initial demo/mock content with one click.
* **Tasks**:
  1. Add endpoint `POST /v1/admin/maintenance/purge-demo` in [`apps/api/src/modules/admin/index.ts`](file:///d:/Coding/Agent/SidPrep/apps/api/src/modules/admin/index.ts):
     - Options payload:
       - `clearQuestions`: boolean (clears demo questions)
       - `clearTests`: boolean (clears demo mock tests)
       - `clearNews`: boolean (clears sample current affairs)
       - `clearResources`: boolean (clears demo PDF resources)
       - `clearAttempts`: boolean (clears test attempts)
       - `clearStudents`: boolean (clears demo students)
     - Preserves: `adminUsers`, official exam taxonomy definitions (`SSC`, `RRB`, `WBPSC`, `IBPS`), system audit logs.
  2. Create Admin Maintenance UI:
     - Add a card in Admin Overview (`/admin`) and/or create [`apps/web/src/app/admin/maintenance/page.tsx`](file:///d:/Coding/Agent/SidPrep/apps/web/src/app/admin/maintenance/page.tsx).
     - Include granular checkboxes and a big "Purge All Demo Data" button with confirmation dialog.

---

### Phase 5: Dynamic Website Page CMS (Create / Edit / Delete All Pages)
* **Objective**: Allow the admin to edit existing pages (About, Contact, Terms, Privacy, etc.) or create new custom pages dynamically.
* **Tasks**:
  1. Add `PageRecord` store in [`apps/api/src/db/index.ts`](file:///d:/Coding/Agent/SidPrep/apps/api/src/db/index.ts):
     - Properties: `id`, `slug`, `title`, `subtitle`, `contentHtml`, `metaTitle`, `metaDescription`, `isPublished`, `isSystem`, `updatedAt`, `createdAt`.
     - Seed records for existing pages: `about`, `contact`, `terms`, `privacy`, `disclaimer`, `features`, `data-deletion`.
  2. Add Page CMS Endpoints in `apps/api`:
     - `GET /v1/admin/pages` — List all website pages.
     - `GET /v1/admin/pages/:id` — Get single page details.
     - `POST /v1/admin/pages` — Create new custom page.
     - `PUT /v1/admin/pages/:id` — Update existing page.
     - `DELETE /v1/admin/pages/:id` — Delete page (non-system).
     - `GET /v1/pages/:slug` — Public endpoint to fetch page by slug.
  3. Create Admin Page Management UI:
     - Create [`apps/web/src/app/admin/pages/page.tsx`](file:///d:/Coding/Agent/SidPrep/apps/web/src/app/admin/pages/page.tsx) with table list, status toggle, edit modal/page, and create button.
     - Add "Page Manager" to Admin Sidebar [`apps/web/src/app/admin/layout.tsx`](file:///d:/Coding/Agent/SidPrep/apps/web/src/app/admin/layout.tsx).
  4. Connect Public Website Pages:
     - Enhance existing public pages (`/about`, `/contact`, etc.) to dynamically load content from `/v1/pages/:slug` if modified by admin, falling back to static copy if offline.
     - Add dynamic route [`apps/web/src/app/p/[slug]/page.tsx`](file:///d:/Coding/Agent/SidPrep/apps/web/src/app/p/[slug]/page.tsx) for newly created custom pages.

---

### Phase 6: Admin Profile Management
* **Objective**: Allow administrators to manage their profile, change password, and configure security options.
* **Tasks**:
  1. Add Admin Profile Endpoints in [`apps/api/src/modules/admin/index.ts`](file:///d:/Coding/Agent/SidPrep/apps/api/src/modules/admin/index.ts):
     - `GET /v1/admin/profile` — Get current logged-in admin.
     - `PUT /v1/admin/profile` — Update name, email, phone.
     - `PUT /v1/admin/profile/password` — Change password with old password check and PBKDF2 hashing.
  2. Create Admin Profile UI [`apps/web/src/app/admin/profile/page.tsx`](file:///d:/Coding/Agent/SidPrep/apps/web/src/app/admin/profile/page.tsx):
     - Profile details card (Name, Email, Role badge, Created At).
     - Password change form with security checks.
     - 2FA preferences (Email OTP vs TOTP).
  3. Update [`apps/web/src/app/admin/layout.tsx`](file:///d:/Coding/Agent/SidPrep/apps/web/src/app/admin/layout.tsx):
     - Make the bottom admin user card clickable, linking directly to `/admin/profile`.

---

### Phase 7: Mobile App & Server Connectivity Self-Healing
* **Objective**: Ensure the mobile app connects reliably to the backend across Android emulators, physical devices via Expo LAN IP, and web previews.
* **Tasks**:
  1. Update [`apps/mobile/src/api/client.ts`](file:///d:/Coding/Agent/SidPrep/apps/mobile/src/api/client.ts):
     - Automatically check for Android emulator loopback (`10.0.2.2:4000`).
     - Allow specifying a custom API server URL in development via a debug banner.
  2. Create `apps/mobile/.env` with `EXPO_PUBLIC_API_URL=http://localhost:4000/v1`.
  3. Provide npm scripts to launch all services easily in one terminal or separate windows.

---

### Phase 8: Verification & E2E Validation
* **Runbook Checklist**:
  1. Brevo SMTP: Verify real test email reaches destination with 6-digit OTP code.
  2. Admin Login: Verify email `sksakirhossain8@gmail.com` logs in smoothly using password + email OTP or TOTP `123456`.
  3. Student Web Auth: Go to `http://localhost:3000/login`, enter email, receive OTP, verify, and confirm user is logged in.
  4. Purge Demo Data: Click "Purge All Demo Data" in admin panel and verify questions/tests reset to clean slate.
  5. Page CMS: Create a new page `/p/faq` in `/admin/pages`, publish it, and verify it renders on the live website. Edit `/about` and confirm changes show.
  6. Admin Profile: Change admin name and password, sign out, and verify login with the new credentials.

---

## 4. Modified & Created Files Matrix

| File Path | Type | Action |
|---|---|---|
| `.env` | Config | Create with Brevo SMTP credentials & JWT secrets |
| `apps/api/.env` | Config | Create with API configuration |
| `apps/web/.env.local` | Config | Create with Next.js API URL settings |
| `apps/mobile/.env` | Config | Create with Expo API base URL |
| `apps/api/package.json` | Dependency | Add `nodemailer` and `@types/nodemailer` |
| `apps/api/src/lib/email.ts` | Code | Refactor to Brevo SMTP relay transport (port 587) |
| `apps/api/src/db/index.ts` | Code | Add `PageRecord` store, seed initial pages, add purge helpers |
| `apps/api/src/modules/auth/index.ts` | Code | Connect real OTP email dispatch, add admin email OTP flow |
| `apps/api/src/modules/admin/index.ts` | Code | Add page CMS endpoints, purge demo data endpoint, profile endpoints |
| `apps/web/src/app/admin/login/page.tsx` | Code | Add Brevo Email OTP option, connection diagnostics, dev credentials helper |
| `apps/web/src/app/admin/layout.tsx` | Code | Add Page Manager link, link user card to `/admin/profile` |
| `apps/web/src/app/admin/pages/page.tsx` | Code | Create full Website Page CMS interface |
| `apps/web/src/app/admin/profile/page.tsx` | Code | Create Admin Profile & Password Management screen |
| `apps/web/src/app/login/page.tsx` | Code | Create Student Login & Registration page with Brevo OTP |
| `apps/web/src/app/dashboard/page.tsx` | Code | Create Student Web Dashboard |
| `apps/web/src/components/public-header.tsx` | Code | Add Login/Register button & User state |
| `apps/web/src/app/p/[slug]/page.tsx` | Code | Create dynamic CMS page renderer |
| `apps/mobile/src/api/client.ts` | Code | Improve connection fallback for emulators and devices |

---
*Ready to begin execution of Phase 1 upon confirmation.*
