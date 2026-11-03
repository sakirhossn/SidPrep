# Multi-stage Dockerfile for Next.js Web Application
# Architectures: linux/arm64, linux/amd64

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY pnpm-lock.yaml* pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @sidprep/contracts build
RUN pnpm --filter @sidprep/design-tokens build
RUN pnpm --filter @sidprep/ui build
RUN pnpm --filter @sidprep/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

USER node

COPY --from=builder /app/apps/web/package.json ./
COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["pnpm", "start"]
