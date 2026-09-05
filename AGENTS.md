# AGENTS.md

Developer + contributor guide for Esbuddy. The README is user-facing; this file
covers how the code is organised and how to work on it. To avoid drift, it
references the authoritative source rather than repeating it:

- Scripts → root `package.json` and `apps/server/package.json` `scripts`.
- Env vars → `apps/server/.env.example` (documented) and the `Env` interface in
  `apps/server/src/env.ts`.
- Docker → `Dockerfile` + `docker-compose.yml`.
- Cloudflare config/deploy → `apps/server/wrangler.jsonc` (has setup comments)
  and `.github/workflows/deploy-cloudflare.yml`.
- PR checks → `.github/workflows/ci.yml`.

## Monorepo layout

pnpm workspace (`pnpm-workspace.yaml`), ESM + `nodenext` throughout.

```
packages/sdk      @esbuddy/sdk — shared domain types, Store interface, HttpStore client
apps/web          React + Vite + reactflow front-end
apps/server       Hono backend (runs on Node and on Cloudflare Workers)
```

## Deployment modes

Esbuddy ships in three modes. The same UI runs everywhere; what differs is the
storage backend, chosen at build time via `VITE_STORE_MODE`. The backend is one
platform-agnostic `buildApp` (see Architecture) running on two runtimes.

| Mode | Storage | Canvas content (Yjs doc) | Build | Deploy |
|---|---|---|---|---|
| **Pure frontend** (static, no backend) | `LocalStore` → browser `localStorage` | `y-indexeddb` (this browser only) | `pnpm build` (web `local` mode) | GitHub Pages — `.github/workflows/deploy.yml` |
| **Backend, self-hosted** (Node) | Hono + SQLite (better-sqlite3), serves SPA + `/api/*` | WebSocket room per canvas, in-process (`realtime.node.ts`) | `pnpm build:fullstack` | `Dockerfile` + `docker-compose.yml` |
| **Backend, Cloudflare** | one Worker + D1, serves SPA (Assets binding) + `/api/*` | one Durable Object per canvas (`room.worker.ts`) | `pnpm build:cf` | `pnpm deploy:cf` — `.github/workflows/deploy-cloudflare.yml` |

The two backend modes share all domain logic; only the `*.node.ts` (better-sqlite3,
`ws`) and `*.worker.ts` (D1, Durable Objects) bootstraps differ.

## Working on it

Common tasks are pnpm scripts (see `package.json`): `dev` / `dev:fullstack`,
`build` / `build:fullstack` / `build:cf`, `typecheck`, `lint`, `test`. Copy
`apps/server/.env.example` → `apps/server/.env` for local backend config.

Before opening a PR, run what CI runs (`.github/workflows/ci.yml`):

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Architecture

- **Platform-agnostic core, per-platform bootstrap.** `apps/server/src/app.ts`
  (`buildApp({ db, env, staticHandler })`) holds all domain logic with no Node-
  or Workers-specific imports. `*.node.ts` (better-sqlite3, `node:*`) and
  `*.worker.ts` (D1, Workers globals) files are the only platform-coupled code
  and provide the two bootstraps.
- **Domain modules** under `apps/server/src/modules/<domain>/`, each with three
  layers:
  - `api.ts` — Hono routes; HTTP concerns only (parse request, status codes).
  - `service.ts` — business logic + cross-module orchestration; the module's
    public surface (the api imports the service, not the repo).
  - `repo.ts` — data access for that domain's tables only.

  Domains: `auth` (users, jwt, google, middleware), `workspace` (workspaces,
  members, invitations), `canvas` (canvases, events). Cross-domain flows go
  through services, keeping the chain `auth → workspace → canvas` acyclic (new
  user → `workspace.createWorkspace` → `canvas.seedExampleCanvas`).
- **DB** (`apps/server/src/db/`): `types.ts` exposes a driver-agnostic `Db`;
  `index.node.ts` builds a better-sqlite3 handle (migrations applied on
  startup); `d1.worker.ts` wraps a D1 binding. Schema in `schema.ts`, Drizzle
  migrations in `apps/server/drizzle/`.
- **Frontend storage** is a `Store` implementation selected by `VITE_STORE_MODE`
  — `LocalStore` or `HttpStore` — one per deployment mode (see Deployment modes).
  The Store handles canvas *metadata* only; canvas *content* is never written
  through it.
- **Realtime collaboration** (ADR-0002, `doc/decisions/0002-realtime-collaboration.md`).
  Canvas content is a Yjs `Y.Doc` whose schema lives in `packages/sdk/src/ydoc.ts`.
  - Web: `apps/web/src/collab/` — `binding.ts` diffs React Flow arrays into the
    doc and rebuilds them from it; `provider.ts` picks IndexedDB (local) or
    `y-websocket` to `/api/rooms/:id?token=<jwt>` (remote); `Y.UndoManager`
    replaces the old snapshot history; awareness drives cursors/selection/presence.
  - Server: `modules/canvas/room.ts` (`CanvasRoom`) is the platform-agnostic room
    (y-websocket wire protocol, fan-out, awareness). Hosts: `realtime.node.ts`
    (in-process map + `ws` upgrade on the same port) and `room.worker.ts`
    (`CanvasRoomObject` Durable Object, Hibernation WebSockets, DO storage hot /
    D1 cold). Auth happens in the host entry, not in the room.
  - DB: `canvases.ydoc` (base64 Yjs state) is the source of truth;
    `canvases.snapshot` is a materialised view rewritten on flush. Canvases that
    only have a snapshot are converted on first room open.

## Testing

Vitest, two projects, both driving the same `buildApp` on different DB drivers.
Tests live in `apps/server/test/`; run them via the `test*` scripts in
`apps/server/package.json`.

- **node** project — unit (`test/unit`) + local integration (`test/integration`)
  on an in-memory better-sqlite3 DB.
- **workers** project — Cloudflare integration (`test/cf`) inside
  Miniflare/workerd with a real D1 binding; migrations from `drizzle/` are
  applied per worker via `applyD1Migrations` (`test/setup`). `main` points at
  the real Worker entry, so `SELF.fetch` covers routing → Durable Object room →
  D1 flush end to end (`room.cf.test.ts`).

Gotchas worth knowing before touching test config:

- Versions are pinned: `vitest@3.2.4` + `@cloudflare/vitest-pool-workers@0.8.68`
  (the 0.22.x line dropped the `/config` export and requires vitest 4).
- `workerd` is in root `onlyBuiltDependencies` so its install script runs —
  Miniflare needs the workerd binary.
- `y-websocket` also syncs peers over `BroadcastChannel` (which Node 22 has);
  tests that must prove the *server* relayed something pass `disableBc: true`.
- Node and Workers global types collide (`URL`, `fetch`, …). Worker code is
  isolated in `*.worker.ts`, excluded from `tsconfig.json` and typechecked by
  `tsconfig.worker.json`; `test:typecheck` (`tsconfig.test.json`) covers only
  the Node side for the same reason. Don't merge these tsconfigs to silence IDE
  errors.

## Conventions

- Imports use explicit `.js` extensions (nodenext), including source-to-source.
- New workspace-level config goes in `.devin/` (skills, rules, MCP), not
  tool-specific dirs.
