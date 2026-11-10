# Multi-stage Dockerfile for SidPrep Fastify API
# Architectures: linux/arm64 (Oracle Cloud Always Free), linux/amd64

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY pnpm-lock.yaml* pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @sidprep/contracts build
RUN pnpm --filter @sidprep/design-tokens build
RUN pnpm --filter @sidprep/api build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Security: Non-root execution
USER node

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/src/db/schema.sql ./apps/api/src/db/schema.sql
COPY --from=builder /app/apps/api/migrations ./apps/api/migrations

EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
