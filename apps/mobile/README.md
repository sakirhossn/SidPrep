# SidPrep 2.0 Student Mobile Application

Production-ready, lightweight Android-first student mobile application with iOS-ready architecture. Built for competitive exam preparation targeting **SSC (CGL/CHSL/MTS), RRB (NTPC/Group D), WBPSC (Clerkship/Misc/Food SI), and IBPS (PO/Clerk)**.

Connects to the shared backend (`https://api.sidprep.in/v1`) without separate databases or duplicate business logic.

---

## 1. Architecture Highlights

- **Framework:** React Native + Expo SDK 52 + TypeScript (strict).
- **Navigation:** Expo Router (file-based routing, deep links, clean bottom tabs).
- **Design Tokens:** `@sidprep/design-tokens` (Indigo `#3B4CCA`, Light background `#F6F7FB`, WCAG AA contrast, 48dp Android minimum touch targets).
- **Typography:** Manrope for headings and metrics, Inter for body copy, Noto Sans for Indian script fallbacks.
- **Security & Storage:** 
  - `expo-secure-store` strictly for auth JWTs.
  - `expo-sqlite` for local offline answer queue, cached syllabus, published current affairs, and telemetry buffer.
- **Offline Reliability:** 
  - Monotonic client sequence numbers for answer choices.
  - Distinguishes `Saved Locally`, `Synced`, and `Offline`.
  - Transactional idempotent sync to `/v1/sync/answers`.
- **Server-Authoritative Test Runner:**
  - High-precision local countdown timer with server start/end authoritative timestamps.
  - Negative marking calculated server-side (-0.5 / -0.33 / -0.25).
  - Question solutions and answer keys strictly withheld until verified submission.
- **Document Viewer & Permission Guard:**
  - In-app preview for PDF, sanitized DOCX, and images.
  - Download action strictly gated on `downloadAllowed === true`.
- **Zero-Cost Telemetry:**
  - Batched diagnostic events to `/v1/telemetry`.
  - Strips all sensitive fields (OTPs, passwords, tokens, emails, phone numbers).

---

## 2. Monorepo Structure

```
SidPrep/
├── packages/
│   ├── contracts/       # Shared OpenAPI 3.1 & TypeScript Zod contracts
│   └── design-tokens/   # SidPrep color, typography, and spacing tokens
├── apps/
│   └── mobile/          # Expo React Native Student App
│       ├── app/         # Expo Router screens (Tabs, Exam Hub, Mock Runner, Viewer)
│       ├── src/         # API client, SQLite database, telemetry, theme context
│       ├── tests/       # Unit & integration test suite
│       └── app.json     # Expo configuration & deep links
└── tools/
    └── mock-backend/    # Local Fastify dev/test server conforming to OpenAPI contract
```

---

## 3. Getting Started

### Prerequisites
- Node.js v20+ or v22+
- pnpm v9+ or v10+

### Step 1: Install Dependencies
```bash
pnpm install
```

### Step 2: Start the Local Mock Backend
In one terminal:
```bash
pnpm --filter @sidprep/mock-backend start
```
The mock server will start at `http://localhost:4000/v1` serving authentic exam data, question papers, Brevo OTP simulation, and answer sync.

### Step 3: Start the Mobile App
In another terminal:
```bash
cd apps/mobile
pnpm start
```
Press `a` for Android Emulator, `i` for iOS Simulator, or `w` for Web preview.

---

## 4. Running the Automated Test Suite

Run all unit, contract, and offline queue tests:
```bash
cd apps/mobile
pnpm test
```
Verifies:
1. Monotonic sequence answer queuing in SQLite.
2. SSC CGL scoring & negative marking calculation (+2.0 / -0.5).
3. Telemetry sanitization (stripping OTPs, passwords, and tokens).
4. Download permission gating (403 Forbidden when `downloadAllowed === false`).
5. Live end-to-end HTTP integration against the backend contract.

---

## 5. Building for Production

Build an internal Android APK:
```bash
cd apps/mobile
eas build --profile preview --platform android
```

Build a production Android App Bundle (AAB):
```bash
cd apps/mobile
eas build --profile production --platform android
```
