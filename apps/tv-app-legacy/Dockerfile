FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/tv-app-legacy/package.json apps/tv-app-legacy/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
COPY packages/billing/package.json packages/billing/
COPY packages/api/package.json packages/api/

RUN pnpm install --frozen-lockfile --shamefully-hoist

COPY . .

RUN pnpm --filter @neofilm/shared build || true
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_BASE_PATH=/tv-legacy
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

RUN cd apps/tv-app-legacy && /app/node_modules/.bin/next build

RUN cp -r apps/tv-app-legacy/.next/static apps/tv-app-legacy/.next/standalone/apps/tv-app-legacy/.next/static
RUN cp -r apps/tv-app-legacy/public apps/tv-app-legacy/.next/standalone/apps/tv-app-legacy/public 2>/dev/null || true

ENV NODE_ENV=production
EXPOSE 3005
CMD ["node", "apps/tv-app-legacy/.next/standalone/apps/tv-app-legacy/server.js"]
