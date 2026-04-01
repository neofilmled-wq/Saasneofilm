FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate
WORKDIR /app

COPY . .

# Override workspace to only include packages (not apps)
RUN echo "packages:" > pnpm-workspace.yaml && echo '  - "packages/*"' >> pnpm-workspace.yaml && cat pnpm-workspace.yaml

# Install dependencies
RUN pnpm install --no-frozen-lockfile --shamefully-hoist

# Build shared packages
RUN pnpm --filter @neofilm/shared build || true
RUN pnpm --filter @neofilm/config build || true

# Generate Prisma client
RUN /app/node_modules/.bin/prisma generate --schema=/app/packages/database/prisma/schema.prisma

# Build API
RUN cd packages/api && /app/node_modules/.bin/nest build || \
    (cd /app/packages/api && npx tsc --skipLibCheck --outDir dist && echo "Built with tsc fallback")

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "packages/api/dist/main.js"]
