# Esbuddy

Esbuddy is a front-end app for visualising Event Storming workshops in Domain-Driven Design (DDD).

![](./doc/screenshot.png)

## Event Storming Elements

| Element | Color | Description |
|---|---|---|
| **Event** | orange `#f97316` | A significant thing that happened in the domain |
| **Command** | blue `#3b82f6` | An action that triggers an event |
| **Aggregate** | green `#10b981` | A boundary created by grouping Events/Commands; shown as a translucent box |
| **Actor** | yellow `#eab308` | A person or system that issues commands |
| **Policy** | purple `#a855f7` | Reactive logic triggered by an event ("when X, then Y") |
| **External System** | pink `#ec4899` | A dependency outside the system boundary |
| **Hot Spot** | red `#991b1b` | A conflict, question, or risk worth flagging |
| **Read Model** | green `#10b981` | The information an actor needs to know before making a decision |

## Sticky Notes

Each element is a square sticky note with:

- a **title** (double-click to edit)
- an optional **memo** (double-click to edit)
- resizable via corner handles when selected
- adjustable z-order (front/back)

## Aggregates

- Select 2+ Events/Commands and click **Group as Aggregate** to create a boundary box.
- The box always covers its children; dragging a child outward grows it automatically (no manual resize).
- Dragging the aggregate moves its children with it.
- Drop a free element onto an aggregate to add it.
- An aggregate cannot contain another aggregate; empty aggregates are removed automatically.

### Invariants

1. **Containment** — a child never leaves its aggregate's bounds (enforced on add, remove, move, and resize).
2. **No nesting** — an aggregate can never contain another aggregate.
3. **Single parent** — an element belongs to at most one aggregate.
4. **No orphans** — an aggregate with zero children is removed.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `E` | Add an **Event** at the mouse cursor |
| `C` | Add a **Command** at the mouse cursor |
| `A` | Add an **Actor** at the mouse cursor |
| `P` | Add a **Policy** at the mouse cursor |
| `X` | Add an **External System** at the mouse cursor |
| `H` | Add a **Hot Spot** at the mouse cursor |
| `R` | Add a **Read Model** at the mouse cursor |
| `Shift` + drag out | Remove a child from its aggregate |
| `⌥ Option` / `Alt` + click | Connect the selected node(s) to the clicked node |
| `]` | Bring selection to front |
| `[` | Send selection to back |
| `⌘ Cmd` / `Ctrl` + `Z` | Undo |
| `⌘ Cmd` / `Ctrl` + `⇧ Z` (or `Ctrl` + `Y`) | Redo |
| `⌘ Cmd` / `Ctrl` + click | Multi-select |
| double-click | Edit a note's title or memo |

### Modifier keys (one concern per modifier)

- **Shift** — break containment (remove from an aggregate)
- **⌥ Option / Alt** — create a relation (connect nodes)
- **⌘ Cmd / Ctrl** — multi-select

## Canvas Interactions

- Infinite canvas with zoom, pan, and MiniMap.
- **Pan**: two-finger scroll, middle/right mouse button, or `Space` + drag.
- **Zoom**: pinch gesture.
- **Box select**: drag on empty canvas.
- **Connect**: drag a handle, or select a node and `⌥`-click another.
- **Auto-save**: nodes, edges, and viewport are saved to `localStorage` and restored on refresh.

## Import / Export

- **Export**: generate Context Mapper (CML) source from the canvas; copy to clipboard or download as `.cml`.
- **Import**: upload a `.cml` file to parse and render it.
- Supported CML: `Aggregate`, `Command`, `DomainEvent`, and `Flow` relations.

## Project Structure

```
apps/
├── web/                       # React frontend (Vite + React Flow + Tailwind)
│   └── src/
│       ├── App.tsx            # React Flow canvas + state management
│       ├── types.ts           # element styles (domain types come from @esbuddy/sdk)
│       ├── storage.ts         # localStorage persistence primitives
│       ├── stores/            # polymorphic Store layer (ADR-0001.1)
│       │   ├── LocalStore.ts  # localStorage (stateless GitHub Pages build)
│       │   └── index.ts       # factory: local | remote (VITE_STORE_MODE)
│       ├── cmlExporter.ts     # canvas data → CML source
│       ├── cmlImporter.ts     # CML source → canvas data + createNode factory
│       └── components/
└── server/                    # Hono backend (ADR-0001.10/11)
    └── src/
        ├── index.ts           # Node bootstrap
        ├── app.ts             # platform-agnostic Hono app
        ├── env.ts             # Env interface + node resolver
        ├── db/                # Drizzle schema + polymorphic DB factory (sqlite | d1 | pg)
        ├── repo.ts            # repository layer (users/workspaces/canvases/events)
        ├── auth/              # JWT + Google OAuth + middleware
        └── routes/            # auth / canvases / workspaces / invitations

packages/
└── sdk/                       # shared domain types + Store interface + HttpStore client
```

## Development

Two local dev modes:

```bash
pnpm install
pnpm dev            # pure frontend (:5173, LocalStore/localStorage) — the stateless build
pnpm dev:fullstack  # frontend (remote mode) + Hono server (:8787, SQLite)
pnpm dev:server     # backend only
pnpm build          # build sdk → web → server
pnpm typecheck      # typecheck all workspaces
pnpm lint           # oxlint
```

- `npm run dev` runs the frontend with `VITE_STORE_MODE=local` (default) — no backend needed.
- `npm run dev:fullstack` starts Vite in `--mode fullstack` (`apps/web/.env.fullstack` sets `VITE_STORE_MODE=remote`) plus the server; `/api` is proxied from `:5173` to `:8787`.

### Store modes

The frontend selects its storage via `VITE_STORE_MODE`:

- `local` (default): `LocalStore`, persists to `localStorage` — the stateless GitHub Pages build.
- `remote`: `HttpStore`, talks to the backend `/api/*` (fullstack single deployment).

### Backend env vars

Copy `apps/server/.env.example` → `apps/server/.env` (auto-loaded on startup) and adjust as needed. The frontend reads `apps/web/.env.local` for `VITE_STORE_MODE` / `VITE_API_URL`.

| Var | Default | Purpose |
|---|---|---|
| `DB_KIND` | `sqlite` | `sqlite` (local) — `d1`/`pg` are extension points |
| `DB_PATH` | `./.db/esbuddy.sqlite` | SQLite file path |
| `JWT_SECRET` | `esbuddy-dev-secret` | JWT signing secret |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `GOOGLE_REDIRECT_URI` | — | Google OAuth (server-side flow) |
| `FRONTEND_URL` | `/` | post-login redirect target |
| `PORT` | `8787` | HTTP port |

For local testing without Google, call `POST /api/auth/dev-login` to mint a dev token.

## Docker

Single-deployment fullstack image (backend serves the built SPA + `/api/*`):

```bash
docker compose up --build    # build image + start on :8787
# open http://localhost:8787
```

- `Dockerfile` — multi-stage: builds sdk → web → server via pnpm, runtime serves `apps/web/dist` + API.
- `docker-compose.yml` — binds `:8787`, persists SQLite in a named volume, forwards `GOOGLE_*` / `JWT_SECRET` from your shell (or a root `.env`).

## Roadmap

- [ ] Dark mode
- [ ] Right-click context menu to create elements
- [ ] Multiple canvas switching
- [ ] Fuller CML support (Actor, Policy, External System mappings)
- [ ] Real-time multi-user collaboration (see `src/useHistory.ts` — the snapshot log is designed to be swapped for a serializable operation/command log)
- [ ] Collaboration!

## More on DDD

- [Aggregates: An In-depth Examination by Thomas Coopman Gien Verschatse - DDD Europe](https://youtu.be/m7SMk8VA7Bg?si=O1PNsNpHIHV0LPVE)
- [A step by step guide to Event Storming – our experience](https://www.boldare.com/blog/event-storming-guide/)
- [Event Storming — The Storm That Cleans Up The Mess!](https://medium.com/@samar.benamar/event-storming-the-storm-that-cleans-up-the-mess-b2bb578db7c)
- [Context Mapper](https://contextmapper.org/)
