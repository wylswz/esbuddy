# ADR-0002：实时多人协作（CRDT + 每画布一个房间）

- 状态：Accepted
- 取代：ADR-0001.7（「实时协作本期不实现，按追加日志预留」）

## 背景

ADR-0001.7 把画布写入建模为「全量快照 + `canvas_events` 追加日志」，并设想未来客户端按 `seq` 拉增量。
真正做多人协作时，这条路线需要中心定序（OT 类），且全量 `set_state` 事件无法合并并发编辑。
我们改为 CRDT：并发编辑天然可交换合并，离线/断线重连自愈，且能复用成熟生态。

## 决策

### 1. 数据模型：一张画布 = 一个 Yjs `Y.Doc`（`@esbuddy/sdk` `ydoc.ts`）

```
doc.getMap('nodes'): Y.Map<nodeId, Y.Map<field>>   // type, x, y, w, h, z, data(Y.Map)
doc.getMap('edges'): Y.Map<edgeId, Y.Map<field>>   // source, target, sourceHandle, targetHandle
```

- 每个元素是独立 `Y.Map`，**不同字段的并发编辑都能保留**（一人拖动、一人改名互不覆盖）；同字段才退化为 LWW。
- 层叠顺序用每节点的数字 `z`，渲染按 `(aggregate 优先, z, id)` 排序，保留「聚合永远在便签之下」的领域不变量。
- **viewport 不入共享文档**（每人各自的平移/缩放），存客户端 localStorage。

### 2. 实时是唯一写路径

- 画布**内容**只通过 Y.Doc 修改；REST 不再提供 `PUT /canvases/:id`，`Store.saveCanvas` 删除。
- 三种部署模式共用同一套编辑器绑定（`apps/web/src/collab/`）：
  - local（GitHub Pages）：`y-indexeddb`，单机；localStorage 仅保留派生快照供画廊/缩略图。
  - remote（Node / Cloudflare）：`y-websocket` 协议连到 `/api/rooms/:canvasId?token=<jwt>`。
- 撤销/重做改为 `Y.UndoManager`，仅跟踪本客户端的事务（不会撤销他人的编辑）。
- 在线状态（awareness）：光标、选中、参与者头像。

### 3. 服务端：平台无关的 `CanvasRoom` + 两个宿主

`apps/server/src/modules/canvas/room.ts` 实现房间语义（y-websocket 线协议、fan-out、awareness 记账），不依赖任何平台。

| 运行时 | 宿主 | 「单实例」由谁保证 | 热状态 | 冷持久化 |
|---|---|---|---|---|
| Node（单容器） | `realtime.node.ts`：`Map<canvasId, CanvasRoom>` + `ws` upgrade | 单进程 | 内存 | SQLite，1s 防抖 + 最后一人离开 + SIGTERM |
| Cloudflare | `room.worker.ts`：每画布一个 Durable Object | DO（`idFromName(canvasId)`） | DO storage（250ms 防抖） | D1，alarm 10s + 最后一人离开 |

- CF 使用 **WebSocket Hibernation API**：空闲房间不计费；唤醒后从 DO storage 重建文档并重新挂接存活连接（不重做握手），awareness clientID 通过 socket attachment 跨休眠保留。
- 鉴权在宿主入口完成（Worker / Node upgrade handler），DO 信任来自 Worker 的请求。
- 横向扩多个 Node 实例不在范围内；若需要，接入 y-redis 之类的共享广播层，不改 `CanvasRoom`。

### 4. 存储与迁移

- `canvases.ydoc`（TEXT, base64 的 Yjs 状态）为真相源；`canvases.snapshot` 变为**派生的物化视图**，每次 flush 时重写，供 REST 读与缩略图使用。
- 旧画布（只有 `snapshot`）在房间首次打开时由 `loadCanvasDoc` 转成 Y.Doc；示例画布的种子逻辑不变（仍只写 `snapshot`）。
- `canvas_events` 表与 `GET /canvases/:id/events` 保留但不再写入。

## 理由

- CRDT（而非 OT）：无需中心定序，天然支持离线与多宿主；Yjs 是事实标准且自带 awareness。
- 「实时为唯一路径」而非双轨：避免 LWW 快照与 CRDT 两套写路径互相覆盖，编辑器只维护一种状态模型。
- 平台无关 `CanvasRoom`：与现有 `buildApp` + `*.node.ts` / `*.worker.ts` 的架构模式一致。

## 后果

- 依赖新增：`yjs`、`y-protocols`、`y-websocket`、`y-indexeddb`、`lib0`、`ws`。
- Node 宿主在崩溃时最多丢失最后一次 flush（≤1s）之后的编辑；DO 宿主的热状态在 DO storage 中，丢失窗口 ≤250ms。
- 测试新增：`test/unit/ydoc`、`test/unit/room`、`test/integration/realtime.node`、`test/cf/room.cf`（后者在 workerd 中跑完整 Worker → DO → D1 链路）。
