FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate
WORKDIR /app

COPY . .

# Debug: what is in /app?
RUN ls -la /app/
RUN ls -la /app/packages/ || echo "NO PACKAGES DIR"
RUN cat /app/pnpm-workspace.yaml || echo "NO WORKSPACE YAML"

CMD ["echo", "debug done"]
