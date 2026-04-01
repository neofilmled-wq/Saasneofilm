FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate
WORKDIR /app

# Copy workspace config first
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Create directories and copy package.json files
RUN mkdir -p packages/api packages/shared packages/config packages/database
COPY packages/api/package.json packages/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json

RUN pnpm install --frozen-lockfile --shamefully-hoist

COPY . .

RUN pnpm --filter @neofilm/shared build || true
RUN pnpm --filter @neofilm/config build || true
RUN /app/node_modules/.bin/prisma generate --schema=/app/packages/database/prisma/schema.prisma
RUN cd packages/api && /app/node_modules/.bin/nest build || \
    (cd /app/packages/api && npx tsc --skipLibCheck --outDir dist && echo "Built with tsc fallback")

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "packages/api/dist/main.js"]
