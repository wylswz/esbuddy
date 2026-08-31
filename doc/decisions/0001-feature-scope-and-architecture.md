# ADR-0001: 用户 / 工作空间 / 多画布 功能范围与架构决策日志

- 状态：Accepted
- 日期：2026-08-31
- 关联：esbuddy（Event Storming 前端应用）

本文档记录在引入「用户 / 工作空间 / 多画布」能力时固化下来的架构决策。后续决策按时间追加条目，作为项目演进日志。

---

## 背景

esbuddy 目前是纯前端、无状态、可托管在 GitHub Pages 的 Event Storming 可视化工具，数据存于 `localStorage`（`src/storage.ts`，单画布）。

需要引入：

1. 用户（User）
2. 工作空间（Workspace）
3. 多画布管理（Multi-canvas）

画布可归属用户或工作空间；可邀请用户加入工作空间。这需要后端，但**仍希望保留纯前端的无状态发行版**托管在 GitHub 上。因此要求各数据 Store 具备**多态**能力。

---

## 决策日志

### ADR-0001.1：前端 Store 多态抽象（LocalStore / RemoteStore）

- 状态：Accepted

**决策**：新增 Store 抽象层 `src/stores/`，定义统一接口（`getUser / listWorkspaces / listMembers / inviteUser / listCanvases / getCanvas / saveCanvas / deleteCanvas ...`），提供两种实现：

- `LocalStore` —— 基于 `localStorage`，用于纯前端静态版（GitHub Pages），无鉴权，`userId` 恒为伪值 `local-user`。
- `RemoteStore` —— 通过 HTTP 调用后端 REST API，统一携带 `Authorization: Bearer <jwt>`。

通过 `VITE_STORE_MODE` 或运行时配置在构建期/运行期选择实现。`App.tsx` 只依赖抽象接口，不感知具体存储。

**理由**：保留现有零后端发行形态；后端接入只是切换一个实现。

---

### ADR-0001.2：后端采用 Cloudflare Serverless 技术栈

- 状态：Accepted

**决策**：后端部署在 Cloudflare 平台，技术选型：

- 运行时：Cloudflare Workers
- 路由框架：Hono
- ORM：Drizzle ORM（支持 D1 / Postgres 多方言）
- 默认数据库：D1（CF 自带 serverless SQLite）
- 可选数据库：Postgres（自托管 / Neon / RDS，推荐经 CF Hyperdrive 代理）
- 对象存储：R2（头像、导出文件、附件）
- 人机校验：Turnstile（登录/注册防滥用）

**理由**：Serverless、边缘部署、免费额度充足、与 GitHub Pages 前端分发解耦。

---

### ADR-0001.3：后端数据层多态（D1 / Postgres 共用 schema）

- 状态：Accepted

**决策**：数据访问层使用 Repository 模式，按 `DB_KIND` 环境变量切换驱动：

```ts
if (env.DB_KIND === 'pg' && env.DATABASE_URL) {
  return createPgRepos(drizzle(new Pool({ connectionString: env.DATABASE_URL }), { schema }));
}
return createD1Repos(drizzle(env.DB, { schema }));
```

- D1 为默认（开箱即用）；用户自托管 PG 时设置 `DB_KIND=pg` + `DATABASE_URL`。
- 业务逻辑（services/routes）不感知底层方言。
- 方言差异（事务语义、迁移执行、自增/时间类型）在 Repository 层收敛。
- 统一使用 `text` 主键（UUID）+ `integer` 毫秒时间戳，规避方言差异。

**理由**：同一 `schema/` 生成 D1 与 PG 两份迁移，逻辑零重复；满足「不排除用户自部署 PG」。

---

### ADR-0001.4：认证仅支持 Google OAuth + 域名白名单

- 状态：Accepted

**决策**：

- 认证方式：仅 Google OAuth（PKCE，`openid email profile`）。
- 域名白名单：环境变量 `ALLOWED_DOMAINS=example.com,corp.com`（逗号分隔，空则允许任意 Google 邮箱）。校验发生在 Google 回调、签发 JWT 之前，未命中则拒绝（403）。
- JWT：使用 Workers 原生 `WebCrypto`（`crypto.subtle`，HMAC-SHA256）签发的自包含 JWT，经 Hono jwt 中间件校验。
- 不提供本地用户名/密码路径。

**理由**：Serverless 上无需 Node 依赖即可校验 Google id_token（JWKS via WebCrypto）；域名白名单满足企业/封闭团队需求。

---

### ADR-0001.5：邀请仅支持分享链接

- 状态：Accepted

**决策**：不做邮箱邀请，仅分享链接：

```
Invitation { id, workspaceId, role: 'editor'|'viewer', token, createdById, createdAt, revokedAt? }
```

- 加入流程：访客打开 `/w/:token` → 未登录则走 Google OAuth（域名白名单）→ `POST /invitations/:token/accept` → 校验 token 有效、未 revoked、邮箱通过白名单 → 写入 `WorkspaceMember`。
- 支持 revoke（`DELETE /invitations/:token`），role 可选 `editor` / `viewer`。

**理由**：简化 Serverless 部署（无需邮件服务）；与 Google OAuth 域名白名单天然衔接。

---

### ADR-0001.6：画布归属（用户 / 工作空间）

- 状态：Accepted

**决策**：画布归属采用联合类型：

```
Canvas.owner = { type: 'user', userId } | { type: 'workspace', workspaceId }
```

权限：
- 读：owner 或 workspace 成员。
- 写：owner / editor。
- 邀请与成员管理：仅 owner。

**理由**：支持个人画布与团队工作空间画布两种形态。

---

### ADR-0001.7：实时协作本期不实现，但按「追加日志」预留扩展性

- 状态：Accepted

**决策**：实时协作（WebSocket / Durable Objects）不在本期范围；但画布写入模型按 **append-only 事件日志** 设计，为未来实时同步预留：

```
CanvasEvent { canvasId, seq, type: 'set_state'|'rename'|... , payload, actorId, createdAt }
```

- 写路径：校验权限 → append 一条 event（`seq = last + 1`）→ 更新 `Canvas.version`。
- 读路径：`GET /canvases/:id` 返回最新快照（`Canvas.snapshot`）。
- Repository 预留 `listEvents(canvasId, afterSeq?)`，本期实现但实时功能暂不消费。

**理由**：未来每个画布可用 Durable Object 持有其日志，客户端通过 WebSocket 订阅 `seq > 本地` 的增量即可实时同步，无需破坏 schema。

---

### ADR-0001.8：多画布管理

- 状态：Accepted

**决策**：前端引入多画布 CRUD（新建 / 重命名 / 删除 / 移动归属）+ 画布切换器；现有 `storage.ts` 数据迁移到 `LocalStore` 的多画布模型。静态版（local 模式）无用户概念，仅多画布。

**理由**：在保留纯前端发行形态的前提下，交付多画布能力。

---

### ADR-0001.9：Fullstack 采用 SPA 单部署（后端 serve 静态资源）

- 状态：Accepted

**决策**：面向「用户 / 工作空间 / 多画布」的 fullstack 形态采用 **SPA 单部署**：

- 前端构建为 SPA（静态资源），由**后端 serve**。
- **前端产物打进后端部署物**（单一可部署单元，如 Worker 的 Assets / 镜像）。
- 后端即 serve 静态资源（`/`、`/assets/*` 等），又提供 `/api/*` REST 接口。
- 前端路由使用 HashRouter（或后端 SPA fallback），配合单部署免配置。

**与纯前端静态版的关系**：存在**两种发行形态**，由 Store 多态（ADR-0001.1）统一支撑：

| 形态 | 产物 | 数据层 | 部署 |
|---|---|---|---|
| 纯前端静态版 | 仅前端 dist | `LocalStore`（localStorage） | GitHub Pages，零后端 |
| Fullstack SPA | 后端 + 内嵌前端 | `RemoteStore`（REST → 后端） | 单部署（Cloudflare Worker Assets / 镜像） |

前端代码同一份，仅打包/接入方式不同；后端通过 `VITE_STORE_MODE`（build 时注入）或运行时配置告知前端当前是哪种形态，从而选择 Store 实现。

**理由**：既保留 ADR-0001.1 的零后端发行版，又为完整功能提供「前端打进后端」的单一部署单元，简化运维。

---

## 数据模型总览（后端 schema）

```
User            { id, provider:'google', googleSub, name, email, avatarUrl?, createdAt }
Workspace       { id, name, ownerId, createdAt }
WorkspaceMember { workspaceId, userId, role:'owner'|'editor'|'viewer', joinedAt }
Canvas          { id, name, owner(union), snapshot, version, createdById, createdAt, updatedAt }
CanvasEvent     { canvasId, seq, type, payload, actorId, createdAt }
Invitation      { id, workspaceId, role, token, createdById, createdAt, revokedAt? }
```

---

## 实施阶段

- **Phase 1** 多画布（纯前端，Store 抽象 + LocalStore）
- **Phase 2** 用户 + Google OAuth + 域名白名单 + JWT（RemoteStore 接 auth）
- **Phase 3** 工作空间 + 分享链接邀请
- **Phase 4** `canvas_events` 日志落地 + `DB_KIND` PG 多态工厂；实时协作留给后续

> Fullstack 单部署（ADR-0001.9）作为这些阶段的最终落地形态：前端打进后端，单一单元部署。

---

## 待确认 / 后续可选项

- 实时协作（Durable Objects + WebSocket）作为独立后续项目。
- Turnstile 是否纳入本批次注册防滥用（决策倾向纳入，待实施确认）。
- Postgres 部署方式（Neon / 自托管 / Hyperdrive 代理）的细化。
