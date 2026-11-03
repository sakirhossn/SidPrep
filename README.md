# SidPrep 2.0 Monorepo

Welcome to the **SidPrep 2.0** repository. This monorepo hosts the complete competitive exam preparation ecosystem:

- **Prompt 1 (`apps/mobile`):** SidPrep 2.0 Student Mobile Application (React Native + Expo SDK 52, Android-first, iOS-ready).
- **Prompt 2 (`apps/web`, `apps/api`):** SidPrep 2.0 Public Student Website + Admin Panel + Shared Fastify API (implemented in the companion conversation).
- **Shared Packages:**
  - `packages/contracts`: OpenAPI 3.1 contract, Zod schemas, and TypeScript models for all `/v1/...` namespaces.
  - `packages/design-tokens`: SidPrep signature Indigo `#3B4CCA`, WCAG AA accessible light/dark tokens, Manrope and Inter typography scales, and 48dp touch targets.
- **Tools:**
  - `tools/mock-backend`: Fastify local test and development mock server conforming to the OpenAPI contract.

## Environment Configuration
See `.env.example` for environment variable templates. Never commit real secrets.
