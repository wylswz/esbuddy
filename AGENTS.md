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
  members, invitations), `canvas` (canvases, versions). Cross-domain flows go
  through services, keeping the chain `auth → workspace → canvas` acyclic (new
  user → `workspace.createWorkspace` → `canvas.seedExampleCanvas`; workspace
  delete → `canvas.deleteWorkspaceCanvases`).
- **Authorization** (`modules/access/service.ts`) sits above `workspace` and
  `canvas`: a user-owned canvas is its owner's only; a workspace canvas belongs
  to the members, where owners/editors write and viewers read. Every
  `/api/canvases/:id/*` route goes through `requireCanvasAccess`, and room hosts
  call `authorizeRoomRequest` (`realtime.ts`), which opens viewers read-only
  (`CanvasRoom` drops their sync step 2 / updates). No access at all answers 404
  so ids don't leak; a viewer attempting a write gets 403. Don't add a route
  without an access check.
- **Auth secrets**: the built-in dev JWT secret only works in dev mode
  (`isDevMode`); otherwise `JWT_SECRET` is required. The OAuth callback hands
  the token to the SPA in the URL fragment (`#token=`), never the query string.
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
  - Published versions: `canvas_versions` rows are immutable snapshots keyed by
    a random 40-hex signature, which is also the permalink token (`/v/<sig>`
    in the SPA → unauthenticated `GET /api/versions/:sig`). Versions are
    private by default; the permalink only resolves (and the UI only offers
    the link) while `is_public` is on — private ones 404 like missing ones. The
    snapshot is sent by the publishing client (the DB lags the live room).
    Management routes live under `/api/canvases/:id/versions`. Backend modes only.
- **Canvas grammar + natural-language compiler** (`packages/sdk/src/grammar.ts`,
  `compiler.ts`). `grammar.ts` is the single source of truth for which relations
  Event Storming allows: `EDGE_RULES` (legal `source → target` edges) and
  `OVERLAP_RULES` (notes stuck onto another note — actor on command, read model
  on command, hot spot on anything). An edge and a binding spell the same
  relation. Bindings are explicit like `aggregateId`: `data.boundTo` is set when
  an attacher is dropped onto exactly one valid note (`bindingTarget`); the pair
  then moves with its target, and dropping it off the target unbinds it
  (`nextBinding`; see "Binding invariants" in `apps/web/src/editor/transforms.ts`, which holds the
  editor's pure aggregate/binding transforms). The compiler reads `boundTo`, never
  geometry; overlaps outside a group are errors. The editor enforces edges
  (`isValidConnection`, per-type handles). Analysis lives in
  `packages/sdk/src/analysis/`: `buildContext` computes facts only (relations
  from legal edges/bindings, overlaps across groups); each rule is a `Checker`
  (one diagnostic code, `check(ctx)` yields findings) under `checkers/`, listed
  in the `CHECKERS` registry; `analyzeCanvas` runs them (errors = illegal /
  incomplete, warnings = likely gaps). To add a rule: write a checker, register
  it, add the code to `DiagnosticCode` and its UI translation.
  `compileCanvas` refuses to compile while errors remain, else renders
  English, each relation stated once. No fuzzy guessing — anything the grammar
  can't read is an error for the user to fix. UI: `CompilePanel.tsx`. Tests:
  `apps/server/test/unit/compiler.test.ts` (the example board must compile with
  zero diagnostics). Aggregate membership stays explicit (`aggregateId`, events
  and commands only), never geometric.
  - Pivotal events are tape (`pivotal`), an attacher bound to one event
    (`marks`). Tape is long and thin, so it only overlaps what it could mark
    (`overlapCounts`); its label is optional.
  - DB: `canvases.ydoc` (base64 Yjs state) is the source of truth;
    `canvases.snapshot` is a materialised view rewritten on flush. Canvases that
    only have a snapshot are converted on first room open.
- **Board structure** (swimlanes, temporal milestones) is visual only and never
  compiled. It lives in its own Y.Maps (`lanes`, `milestones`; `ydoc.ts`) and
  in `CanvasSnapshot.structure` (omitted when empty). Lanes never overlap: every
  create/move/resize is clamped to the free gap (`packages/sdk/src/structure.ts`). Web: `collab/structure.ts`
  writes straight to the doc and reads every change back; `StructureRulers.tsx`
  draws Word-style rulers (outside the board, under one `ReactFlowProvider`) and
  the bands/lines beneath the notes. Structuring tools have no toolbar entry —
  they are reached via the ⌘K `CommandPalette`, which also searches notes.
- **Votes** (dot voting on hot spots, `isVotable`) are visual only and never
  compiled. They live in their own Y.Map (`votes`, one key per note + voter so
  concurrent votes merge; `ydoc.ts`) and in `CanvasSnapshot.votes` (omitted when
  empty; only votes on existing hot spots). A vote outlives its note's deletion
  so undo restores both. Web: `collab/votes.ts` reads them back, `VoteBadge.tsx`
  renders/toggles them; the UndoManager tracks the map too.
- **Guide** (`GuidedTour.tsx`, opened on first visit and by Help) walks a
  workshop step by step. Its example boards are read-only canvas definitions in
  `packages/sdk/src/guideBoards.ts` (labels localised via `tour.sample.*`),
  rendered by `ReadOnlyBoard.tsx` — the same component as published versions.
  The `compile` board must compile with zero diagnostics (`guideBoards.test.ts`).
- **Note interaction**: `NoteComposer.tsx` keeps placement and writing local.
  Confirming a non-empty draft inserts its final content and explicit bindings
  into the doc in one undo step; Escape/empty blur creates nothing. Selection
  actions live next to the note; exports and structure tools remain in search.
  `collab/gestureHistory.ts` keeps a drag/resize and its drop changes in one undo
  step even when the pointer pauses.

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

The frontend also has a dependency-free Chrome interaction smoke suite at
`apps/web/test/browser.mjs`. Start the local-mode Vite server, then a separate
Chrome/Chromium profile with `--remote-debugging-port=9333` bound to loopback:

```bash
pnpm --filter @esbuddy/web dev --host 127.0.0.1 --port 5174
# In another terminal, with Chrome already listening on 9333:
pnpm --filter @esbuddy/web test:browser
```

`BROWSER_TEST_URL` and `BROWSER_DEBUG_URL` override those local endpoints.
`BROWSER_SCREENSHOT_DIR` optionally writes captures to an existing directory.
The suite creates and disposes an isolated browser context, so it never rewrites
your own local canvases. It exercises composition/cancellation, IME-safe input,
single-step undo/redo, attachment and detachment, grouping, read-only boards,
tool search, and touch placement.

## Conventions

- Imports use explicit `.js` extensions (nodenext), including source-to-source.
- New workspace-level config goes in `.devin/` (skills, rules, MCP), not
  tool-specific dirs.
