# Workspace Agent Tokens

Backend deployments (Node/SQLite and Cloudflare/D1) support workspace-scoped
access tokens. Static/local mode has no server and cannot issue credentials.
Agents can connect to the built-in remote MCP server or use the Agent HTTP API.
Neither requires a local adapter.

## Create and Manage

Sign in as a workspace owner, open **Manage workspace**, and find **Agent access
tokens**. Give each agent a name, choose `editor` or `viewer`, and select an
expiration. Copy the secret when it is created: it is shown only once. Closing
the page discards that copy; the list only displays a non-secret prefix.

Each token has a separate, stable identity:

- `id`: `agent:<token UUID>`, independent of the owner who created it.
- `name`: the supplied display name.
- `color`: derived from the identity ID, stable across clients and reconnects.
- `kind`: `agent`, shown with a bot avatar in the collaboration bar.

Use a different token for each agent. Two connections using the same token are
the same identity, just like two browser tabs belonging to the same person.
Names need not be unique; identity IDs always are. To change a name or role,
revoke the token and create a new one.

## Connect via MCP

Creating a token also opens a one-time **Connect via MCP** guide. It includes:

- The public MCP server URL, resolved from the frontend's `VITE_API_URL`.
- Ready-to-copy configurations for Cursor, VS Code and Windsurf, with that
  token already filled into the `Authorization` header.
- Separate copy actions for the URL and the complete client configuration.
- Selectable readonly fields as a fallback when clipboard permission is denied.

The guide and its credential are held only in component memory. **I have saved
the token** dismisses both; refreshing or leaving the page does not restore
them. Treat the copied configuration as a secret, and never commit it to Git.
Merge the `esbuddy` entry with existing servers rather than replacing the
client's whole configuration.

The endpoint is `/api/mcp`, with **Streamable HTTP** transport and
`Authorization: Bearer <workspace token>`. For example, Cursor uses:

```json
{
  "mcpServers": {
    "esbuddy": {
      "url": "https://your-esbuddy.example/api/mcp",
      "headers": {
        "Authorization": "Bearer <your-workspace-token>"
      }
    }
  }
}
```

Save and enable/reconnect the server in the client, then ask the agent to call
`esbuddy_identity` to verify its name, followed by `esbuddy_grammar` and
`esbuddy_canvases`. Use HTTPS outside loopback development. Each agent should
use its own token.

VS Code uses a `servers` root and `type: "http"`; Windsurf uses `serverUrl`
instead of `url`. The guide generates the appropriate format automatically.
Other clients can use the same URL and Bearer authorization header directly.
The HTTP contract is available at `/api/agent/v1/openapi.json`, authenticated
with the same workspace token.

## Permissions and Storage

Only an authenticated human workspace owner can list, create or revoke tokens.
Agent tokens cannot issue more credentials, create/delete workspaces, create
invitations or accept invitations.

An editor token has write access to canvases and published versions in its
workspace, including canvas deletion. A viewer token can read, but its writes
are rejected. Neither can access personal canvases or another workspace, even
if the token's creator owns those too.

Secrets contain 256 random bits and start with `esb_`. Only a SHA-256 digest and
a short display prefix are stored. Tokens expire after 90 days by default;
custom expiration timestamps must be in the future and within 366 days.
Deleting a workspace also deletes its tokens.

REST requests validate the token on every request. Realtime rooms validate it
before each incoming message and each outgoing delivery: a revoked or expired
connection cannot send new edits or keep receiving subsequent updates, even if
it stops sending heartbeats. Such connections close with code `4401`.

## HTTP API

Use the owner's **session JWT** for credential management:

```bash
curl -X POST "$BASE_URL/api/workspaces/$WORKSPACE_ID/tokens" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Domain expert","role":"editor"}'
```

The `201` response contains token metadata and a one-time `token` field. Optional
`expiresAt` is a Unix timestamp in milliseconds. Subsequent list responses never
include the secret or its hash.

```text
GET    /api/workspaces/:id/tokens           List safe metadata (owner only)
POST   /api/workspaces/:id/tokens           Create a named identity (owner only)
DELETE /api/workspaces/:id/tokens/:tokenId  Revoke a token (owner only)
GET    /api/auth/identity                  Resolve the authenticated identity
```

Use the **agent token** for workspace and canvas operations:

```bash
curl "$BASE_URL/api/auth/identity" -H "Authorization: Bearer $AGENT_TOKEN"
curl "$BASE_URL/api/workspaces" -H "Authorization: Bearer $AGENT_TOKEN"
curl "$BASE_URL/api/canvases" -H "Authorization: Bearer $AGENT_TOKEN"
```

For an agent, the workspace list contains only its workspace, and a canvas list
or creation without an explicit owner defaults to that workspace.
`/api/auth/me` remains a human-user endpoint; agents use `/api/auth/identity`.
The SDK's `HttpStore` supports token management and accepts an agent credential
through its existing `getToken` option for canvas operations.

## Realtime Presence

The existing `/api/rooms/:canvasId` endpoint accepts agent tokens. Native clients
should send `Authorization: Bearer <token>` on the WebSocket upgrade to avoid
secrets in URLs. Browser-compatible clients can use the existing `?token=`
fallback. Use TLS outside loopback development.

For a `y-websocket` client:

```ts
const provider = new WebsocketProvider(`${serverUrl}/api/rooms`, canvasId, doc, {
  params: { token: agentToken },
  disableBc: true,
});
provider.awareness.setLocalState({
  cursor: { x: 400, y: 200 },
  selection: [],
});
```

The server supplies `awareness.user` from the authenticated token, even when a
client announces an empty state. A token client cannot change its ID, name,
color or kind, or update another connected peer's awareness entry. Cursor and
selection remain client-controlled. `disableBc` prevents same-process clients
from bypassing the server's identity checks via BroadcastChannel.

Identity is online presence, not a permanent per-note audit log. Canvas content
still flows through Yjs, not REST snapshot replacement.

## Migrations and Tests

Migration `0004_workspace_tokens.sql` adds the token table. Node applies it on
startup. For Cloudflare, apply D1 migrations before deploying the new Worker.

`pnpm test` covers the same API contract on SQLite and D1, plus real Node and
Worker WebSocket flows, authoritative identities, viewer restrictions and live
revocation. `pnpm --filter @esbuddy/server test:typecheck` checks test types too.

The browser smoke test uses an isolated Chrome context and creates its own user.
Run it against an isolated development backend (`DEV_MODE=true`, use a fresh
database), a remote-mode Vite server on `127.0.0.1:5175`, and Chrome listening on
loopback port `9333`:

```bash
pnpm --filter @esbuddy/web test:browser:tokens
```

`BROWSER_TEST_URL`, `BROWSER_DEBUG_URL` and `BROWSER_SCREENSHOT_DIR` work as in the
existing interaction suite. The suite checks the one-time guide, client-specific
configuration, copy actions, denied clipboard access, secret dismissal and mobile
layout. Screenshots redact full credentials, and clipboard tests use an isolated
mock without changing the user's OS clipboard.
