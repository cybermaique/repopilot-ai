FROM node:24.21.0-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build
USER node
CMD ["node", "services/backend/dist/main.js"]
