FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/beyu-health-web ./apps/beyu-health-web
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @beyu/health-types build && pnpm --filter @beyu/health-web build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/beyu-health-web/.next ./apps/beyu-health-web/.next
COPY --from=builder /app/apps/beyu-health-web/package.json ./apps/beyu-health-web/
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3001
CMD ["pnpm", "--filter", "@beyu/health-web", "start"]
