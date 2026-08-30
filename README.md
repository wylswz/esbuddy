# Esbuddy

Esbuddy 是一个前端项目，用于 DDD 中的 Event Storming 可视化活动。

## 技术栈

- Vite + React 19 + TypeScript
- TailwindCSS v4
- React Flow (reactflow) — 自由画布
- Lucide React — 图标库

## Event Storming 元素

| 元素 | 颜色 | 说明 |
|---|---|---|
| **事件 (Event)** | 橙色 `#f97316` | 领域中发生的重要事情 |
| **命令 (Command)** | 蓝色 `#3b82f6` | 触发事件的动作 |
| **聚合 (Aggregate)** | 绿色 `#10b981` | 通过框选一组 Event/Command 创建，显示为半透明边界框 |
| **角色 (Actor)** | 黄色 `#eab308` | 发起 Command 的角色（人或系统） |
| **策略 (Policy)** | 紫色 `#a855f7` | 由 Event 触发的反应逻辑（"当...时，则..."） |
| **外部系统 (External)** | 粉色 `#ec4899` | 系统边界外的依赖 |

## 画布交互

- 自由拖拽画布，支持缩放、平移、无限画布、MiniMap
- 元素可自由拖拽定位
- 元素之间可连线：拖拽节点右侧 Handle 到另一节点左侧 Handle
- 点击节点文字可直接内联编辑标签
- 选中多个 Event/Command 后点击 "Group as Aggregate" 创建聚合边界框
- Sticky Note 拟物化设计：轻微倾斜、真实阴影、纸张质感、顶部胶带条、右下角卷角

## 导入/导出

- **导出**：画布内容生成 Context Mapper (CML) 源码，支持复制到剪贴板和下载 .cml 文件
- **导入**：上传 .cml 文件解析并渲染到画布
- 支持的 CML 特性：Aggregate、Command、DomainEvent、Flow 关系

## 项目结构

```
src/
├── App.tsx                    # 主应用，React Flow 画布 + 状态管理
├── main.tsx                   # 入口
├── index.css                  # TailwindCSS v4 + 全局样式
├── types.ts                   # 元素类型定义 + 样式配置表
├── cmlExporter.ts             # 画布数据 → CML 源码
├── cmlImporter.ts             # CML 源码 → 画布数据 + createNode 工厂函数
├── components/
│   ├── StickyNode.tsx         # 通用便利贴节点组件（拟物化，支持内联编辑）
│   ├── Toolbar.tsx            # 左侧工具栏（添加元素、框选聚合、导入导出）
│   └── ExportModal.tsx        # CML 导出弹窗（复制/下载）
└── assets/
```

## 开发

```bash
npm install
npm run dev      # 启动开发服务器 http://localhost:5173
npm run build    # 构建生产版本
npm run preview  # 预览生产版本
```

## 待办

- [ ] 暗色模式适配
- [ ] 右键菜单创建元素
- [ ] 键盘快捷键
- [ ] localStorage 本地保存
- [ ] 更完整的 CML 语法支持（Actor、Policy、External System 的 CML 映射）
- [ ] Aggregate 拖拽时子元素跟随移动