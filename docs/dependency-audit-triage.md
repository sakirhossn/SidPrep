# Dependency Audit & Advisory Triage (F33)

This document provides the mandatory advisory-by-advisory applicability assessment required by **Finding F33**.
Every advisory reported by `pnpm audit` is evaluated against SidPrep's actual runtime execution environment, container deployment topology, and enabled framework features.

---

## 1. Executive Summary & Toolchain Specifications

- **Package Manager**: `pnpm` (Workspace Monorepo)
- **Node.js Target**: `20.x` LTS (`node:20-alpine` in production Docker containers)
- **Production Host Platform**: Oracle Cloud Infrastructure (OCI) Ampere A1 (ARM64 Ubuntu Linux)
- **Audit Date**: 2026-11-10
- **Policy**: No unassessed high or critical vulnerability in runtime-reachable code. No forced blind lockfile upgrades that violate framework semantic versioning or break production SSR/API contracts.

---

## 2. Advisory-by-Advisory Triage Matrix

| Advisory ID | Package | Severity | Title / Vulnerability | Runtime Applicability to SidPrep | Evaluated Mitigation / Resolution |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GHSA-p293-qw3h-jr36** | `next` | Critical | Next.js: Unauthenticated RCE on Windows-hosted servers | **Not Applicable in Production**.<br/>Vulnerability specifically requires Next.js running directly on a Windows host OS where file path separators and cmd.exe parsing can be abused. SidPrep production runs exclusively in Linux containers (`node:20-alpine` on Linux kernel). | Deployments are strictly containerized on Linux (`apps/web/Dockerfile`). Windows is used only as an offline developer client machine without public exposure. |
| **GHSA-9jgg-9xmf-4v28** | `next` | Critical | Next.js Image Optimization API memory corruption with AVIF files | **Mitigated / Inapplicable**.<br/>Requires Next.js image optimization pipeline processing arbitrary untrusted external AVIF images via `/_next/image`. | SidPrep uses Cloudflare R2 / CDN directly for media delivery (`cdn.sidprep.in`) and does not proxy or transform arbitrary external AVIF images via Next.js image optimization. In addition, `next.config.mjs` configures strict image domains and CSP rules. |
| **GHSA-3g8h-86w9-wvmq** | `next` | High | DoS via unhandled exception in Server Actions / App Router | **Mitigated**.<br/>Requires public exposure of unauthenticated Server Actions endpoints with malformed action IDs. | SidPrep web application uses Next.js primarily for static page generation (SSG) and authenticated client-side data fetching via Fastify API (`apps/api`). Server Actions are not exposed for state mutation; all mutations route directly to Fastify `/v1` endpoints with Zod schema validation. |
| **GHSA-vfv6-92ff-j949** | `next` | Low | Cache poisoning via collisions in React Server Component cache-busting | **Mitigated**.<br/>Applies to CDN-cached RSC payload collisions. | Server-rendered pages (`about`, `p/[slug]`) are dynamically rendered or statically exported; public caching headers are configured with strict `must-revalidate` policies. |
| **GHSA-66x3-6cw3-v5gj** | `tar` / transitive | Moderate | Arbitrary File Creation/Overwrite via symlink traversal | **Mitigated**.<br/>Transitive build-time toolchain dependency used during package installations. | Packages are installed in sandboxed CI environments with frozen lockfiles (`--frozen-lockfile`). No tar archives are unpacked from untrusted end-user uploads at runtime. |
| **GHSA-72xf-g2v4-qvf3** | `tough-cookie` | Moderate | Prototype Pollution in cookie jar | **Mitigated**.<br/>Transitive dependency within test runners / SDKs. | Production API uses Fastify's native cookie handling and stateless JWT bearer tokens, completely independent of `tough-cookie`. |
| **GHSA-c2qf-rxjj-qqgw** | `semver` | Moderate | ReDoS in semver ranges | **Mitigated**.<br/>Build-time dependency used by Metro/Expo bundler during APK generation. | Not reachable by end-user HTTP payloads or client requests in production. |

---

## 3. Toolchain & Lockfile Invariants

1. **Frozen Lockfile Enforcement**:
   - Monorepo installs are gated on `pnpm install --frozen-lockfile`.
   - Workspace packages (`@sidprep/contracts`, `@sidprep/design-tokens`, `@sidprep/ui`, `@sidprep/mock-backend`) resolve via `workspace:*` references, ensuring strict local contract alignment.
2. **Container Security**:
   - Production Docker images run as non-root `node` users (`USER node`).
   - Read-only container root filesystems are supported; persistent uploads are mounted to dedicated `/app/uploads` volumes.
3. **Continuous Secret & Advisory Scanning**:
   - `node scripts/scan-secrets.mjs` runs in pre-commit and CI workflows.
   - Advisory matrix is reviewed on every minor/major framework release.
