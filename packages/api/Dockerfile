FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/

# NOTE: plain `pnpm install` (no BuildKit `--mount=type=cache`). The Synology
# NAS uses the legacy Docker builder which doesn't support --mount, so the
# BuildKit cache syntax made the build fail at this step. Slower (re-downloads
# deps each build) but works everywhere. Re-add the cache mount only if the
# build host has BuildKit/buildx enabled.
RUN pnpm install --frozen-lockfile --shamefully-hoist

COPY . .

# NO `|| true` here: @neofilm/shared carries the Zod DTOs (e.g. billing.dto). If
# its build fails silently, the API ships against a STALE dist and validation
# rules (like the TV-count range) revert to old values. Fail the image build
# loudly instead so a broken/stale shared can never be deployed.
RUN pnpm --filter @neofilm/shared build
RUN pnpm --filter @neofilm/config build || true
RUN /app/node_modules/.bin/prisma generate --schema=/app/packages/database/prisma/schema.prisma
RUN cd packages/api && /app/node_modules/.bin/nest build || \
    (cd /app/packages/api && find src -type d -name __tests__ -exec rm -rf {} + 2>/dev/null; /app/node_modules/.bin/tsc --skipLibCheck --outDir dist && echo "Built with tsc fallback")

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "packages/api/dist/main.js"]
