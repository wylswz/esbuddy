# ---------- build stage: build sdk + web + server ----------
FROM node:22-slim AS build
WORKDIR /app

# pnpm handles platform-specific optional deps correctly (no npm#4828).
RUN npm install -g pnpm@10.33.0

# Install dependencies first (cache layer), matching the workspace layout.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/sdk/package.json packages/sdk/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile

# Build everything (frontend in remote/fullstack mode so it talks to the backend).
COPY . .
RUN pnpm build:fullstack

# ---------- runtime stage ----------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Dependencies (better-sqlite3 prebuilds are bundled in the package).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/drizzle ./apps/server/drizzle
COPY --from=build /app/apps/web/dist ./apps/web/dist

EXPOSE 8787
CMD ["node", "apps/server/dist/index.js"]
