FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY services/beyu-health-api ./services/beyu-health-api
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @beyu/health-types build && pnpm --filter @beyu/health-api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/beyu-health-api/dist ./services/beyu-health-api/dist
COPY --from=builder /app/services/beyu-health-api/package.json ./services/beyu-health-api/
COPY --from=builder /app/services/beyu-health-api/prisma ./services/beyu-health-api/prisma
COPY --from=builder /app/services/beyu-health-api/migrations ./services/beyu-health-api/migrations
EXPOSE 4001
CMD ["node", "services/beyu-health-api/dist/main.js"]
