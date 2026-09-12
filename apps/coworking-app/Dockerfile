FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/coworking-app/package.json apps/coworking-app/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
COPY packages/billing/package.json packages/billing/
COPY packages/api/package.json packages/api/

# Plain `pnpm install` (no BuildKit cache mount) so it works on the Synology
# legacy Docker builder. See packages/api/Dockerfile.
RUN pnpm install --frozen-lockfile --shamefully-hoist

COPY . .

RUN pnpm --filter @neofilm/shared build || true
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_BASE_PATH=/coworking
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

RUN cd apps/coworking-app && /app/node_modules/.bin/next build

RUN cp -r apps/coworking-app/.next/static apps/coworking-app/.next/standalone/apps/coworking-app/.next/static
# Public folder (dupplex.mp4, etc.) — copy CONTENTS with the trailing /. so we
# never end up with a nested public/public/ and never silently miss files.
RUN mkdir -p apps/coworking-app/.next/standalone/apps/coworking-app/public && \
    cp -r apps/coworking-app/public/. apps/coworking-app/.next/standalone/apps/coworking-app/public/ && \
    ls -la apps/coworking-app/.next/standalone/apps/coworking-app/public/

ENV NODE_ENV=production
EXPOSE 3006
CMD ["node", "apps/coworking-app/.next/standalone/apps/coworking-app/server.js"]
