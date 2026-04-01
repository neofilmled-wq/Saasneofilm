FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate
WORKDIR /app

COPY . .

# Install all dependencies
RUN pnpm install --no-frozen-lockfile

# Build shared packages
RUN pnpm --filter @neofilm/shared build || true
RUN pnpm --filter @neofilm/config build || true

# Generate Prisma client (use project's version via pnpm exec)
RUN pnpm --filter @neofilm/database exec prisma generate

# Build API
RUN pnpm --filter @neofilm/api exec nest build || \
    (cd /app/packages/api && pnpm exec tsc --skipLibCheck --outDir dist && echo "Built with tsc fallback")

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "packages/api/dist/main.js"]
