# 纯 Cloudflare 部署 TODO

目标架构：**单个 Worker + Static Assets**（同域）
- 前端（`apps/web` 构建产物）→ Worker 的 Assets 托管
- 后端（`apps/server` 的 Hono 应用）→ Cloudflare Workers
- 数据库（`better-sqlite3`）→ Cloudflare D1

核心原则：**领域/业务逻辑与部署架构解耦**。平台无关的核心（`app.ts` / `repo.ts` /
`db/schema.ts` / `db/types.ts` / `env.ts` / `context.ts` / `routes/` / `auth/`）在 Node
与 Workers 两套目标间共享；平台相关代码统一按后缀区分：`*.node.ts`（Node）/ `*.worker.ts`（Workers）。

## 兼容性约束
- **现有 fullstack 模式继续可用**：`pnpm dev:fullstack`、`pnpm build:fullstack`、Node 启动、`better-sqlite3`、Docker 全部保持工作。
- Cloudflare/D1 为**并行的第二套目标**，不删除、不破坏 Node 路径。
- 通过 `DB_KIND`（`sqlite` 默认 / `d1`）分流，共用 `schema` / `repo` / `buildApp`。
- 迁移 SQL 单一来源（`drizzle-kit generate` → `./drizzle`）：Node 用 better-sqlite3 migrator（启动时），D1 用 `wrangler d1 migrations apply`。

---

## 已完成（代码改动）

- [x] **env 拆分**：`env.ts`（中立 `Env`/`isDevMode`）、`env.node.ts`（process.env/.env）、`env.worker.ts`（bindings/vars）
- [x] **DB 拆分**：`db/types.ts`（共享 `Db` 类型）、`db/index.node.ts`（better-sqlite3，启动时 migrate）、`db/d1.worker.ts`（D1）、`db/migrate.node.ts`
- [x] **app 解耦**：`buildApp` 改为注入 `staticHandler`（不再直接依赖 node 版 static）
- [x] **静态资源**：`static.node.ts`（node:fs）、`static.worker.ts`（Assets binding，SPA fallback 交由 wrangler 配置）
- [x] **入口**：`index.node.ts`（`@hono/node-server`）、`index.worker.ts`（`export default { fetch }`）
- [x] **命名约定**：`*.node.ts` / `*.worker.ts`；主 `tsconfig.json` 排除 `src/**/*.worker.ts`，新增 `tsconfig.worker.json` 仅编译 worker 子图（`@cloudflare/workers-types`）
- [x] **部署配置**：`apps/server/wrangler.jsonc`（`nodejs_compat`、D1 binding `DB`、Assets binding `ASSETS`+SPA、`vars`、`migrations_dir: drizzle`、observability）
- [x] **依赖与脚本**：装 `wrangler` + `@cloudflare/workers-types`；server 加 `cf:dev`/`cf:deploy`/`db:migrate:d1[:local]`；root 加 `build:cf`/`deploy:cf`；`Dockerfile` CMD → `dist/index.node.js`
- [x] **文档**：README 增加「Cloudflare (Workers + D1)」章节 + 项目结构更新

## 已验证

- [x] `pnpm --filter @esbuddy/server typecheck`（node + worker 两套 tsconfig）通过
- [x] `pnpm lint` 无新增错误（web 侧 2 个既有告警）
- [x] server `tsc` 构建产物干净（dist 不含 `*.worker.js`）
- [x] `wrangler deploy --dry-run` 打包成功，绑定识别正确，**未拉入 better-sqlite3**
- [x] Node 运行时冒烟：`/health`、`/api/config`、`/api/auth/dev-login` 正常（sqlite 无回归）

---

## 剩余人工步骤（需要你的 Cloudflare 账号）

- [ ] `cd apps/server && pnpm exec wrangler d1 create esbuddy`，把打印的 `database_id` 填入 `wrangler.jsonc`（当前为占位符 `REPLACE_WITH_D1_DATABASE_ID`）
- [ ] `pnpm db:migrate:d1`（远端）/ `pnpm db:migrate:d1:local`（本地）应用迁移
- [ ] `wrangler secret put` 设置 `JWT_SECRET`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_REDIRECT_URI`
- [ ] （可选）在 `wrangler.jsonc` `vars` 里设置 `FRONTEND_URL`
- [ ] 从仓库根执行 `pnpm deploy:cf` 部署
- [ ] （可选）Google OAuth 回调 URL 指向 Workers 域名
