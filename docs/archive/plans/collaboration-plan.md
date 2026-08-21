# 协同功能改造方案

## 概述

基于 SDK 新 API（`createWrok`/`joinWork` 支持自定义数据），对协同功能做最小改造：

1. `sWorkData`/`sUserData` 用结构化 JSON，支持后续扩展
2. 协同会话按项目维度展示
3. 私人图纸加入分享（二维码 + 临时链接）

不做权限校验、不改代理、不建复杂后端模块。

## TypeScript 类型定义

在 `packages/frontend/src/types/collaboration.ts` 中定义：

```ts
export interface CollaborateWorkData {
  v: 1;
  drawingId: string;
  projectId: string | null;
}

export interface CollaborateUserData {
  v: 1;
  id: string;
  name: string;
  avatar?: string;
}
```

## 数据格式

### sWorkData

> **设计决策**：不存储 `drawingName`。文件名已在 `FileSystemNode.name` 中维护，
> 同步到 `workData` 会造成改名后列表显示旧名字。显示名从 store/API 实时解析。

```ts
const workData: CollaborateWorkData = {
  v: 1,
  drawingId: currentFileId,
  projectId: currentProjectId, // null = 私人图纸
}
const sWorkData = JSON.stringify(workData)
```

### sUserData

```ts
const userData: CollaborateUserData = {
  v: 1,
  id: user.id,
  name: user.username,
  avatar: user.avatar,
}
const sUserData = JSON.stringify(userData)
```

## 前端改动

### 1. CollaborateSidebar 改造

**补充上下文读取：**

```ts
const { user } = useAuth()
const { currentFileId, currentProjectId, isPersonalSpaceMode } = useCADEditorStore()
```

**初始化优化：** `cooperate.init()` 只在 CAD 就绪后调用一次，不再每次 `getCooperate()` 都 init。

**创建协同（替换硬编码）：**

```ts
const workData = JSON.stringify({ v: 1, drawingId: currentFileId, projectId: currentProjectId })
const userData = JSON.stringify({ v: 1, id: user.id, name: user.username, avatar: user.avatar })
cooperate.createWrok(callback, workData, user.id, userData)
```

**加入协同（替换硬编码）：**

```ts
cooperate.joinWork(workId, callback, user.id, userData)
```

**列表渲染 — 显示文件名：** 从 `workData.drawingId` 关联到当前文件列表或 `FileSystemNode` 查找名称，不再依赖 `workData` 中可能过期的 `drawingName`。

### 2. 会话列表过滤

不再直接展示 `getWorks()` 全部结果，按用户项目归属过滤：

> **已知限制**：`getWorks()` 返回系统所有协同会话的元数据（含其他项目的 drawingId），
> 客户端过滤意味着数据会下发到客户端。当前内网部署场景可接受，
> 公网部署需等 SDK 支持服务端过滤参数。

```ts
const myProjectIds = await fetchMyProjectIds()

cooperate.getWorks((list) => {
  const filtered = list.filter(w => {
    try {
      const data: CollaborateWorkData = JSON.parse(w.work_data)
      if (!data || data.v !== 1) return false
      if (data.projectId && myProjectIds.includes(data.projectId)) return true
      return false
    } catch {
      return false
    }
  })
  setWorks(filtered)
})
```

### 3. 分享功能

新增分享弹窗组件。

**入口**：`CollaborateSidebar` 中当前已加入协同时显示「分享」按钮。当前只实现私人图纸场景（`isPersonalSpaceMode`），但组件层面不硬性禁止项目内分享，预留扩展点。

**组件结构：** `src/components/modals/ShareDialog.tsx`
- 调后端 POST `/api/v1/collaboration/share` 生成 token
- 展示二维码（`qrcode` 库前端生成）
- 展示可复制链接
- 支持撤销分享（调后端 DELETE）

**分享落地页路由：** `/share/:token`
- 调后端 GET `/api/v1/collaboration/share/:token` 解析 token → 得到 `fileId`
- 跳转到编辑器 `/cad-editor?fileId=xxx`
- 编辑器打开图纸后，查找该 fileId 是否有活跃协同会话：
  - 有 → 自动 `joinWork`
  - 没有 → 提示用户可创建协同

> **关键设计**：token 只存 `fileId`，不存 `workId`。
> workId 来自 mxCAD cooperate 服务，服务重启后失效归零。
> 存储过期的 workId 会导致分享链接永久不可用。

### 4. 移动端差异备忘

当前 `packages/frontend_mobile/src/composables/useCooperate.ts` 的 `works` 类型是 `ref<number[]>`（仅 workId 数组），
不包含 `Work` 对象。同步移动端时需改为 `Work[]` 并增加 `CollaborateWorkData` JSON 解析逻辑。
桌面端先行，移动端后续同步。

## 后端改动

### 数据模型

```prisma
model CooperateShare {
  id         String    @id @default(cuid())
  fileId     String
  token      String    @unique @default(nanoid(16))
  createdBy  String
  expiresAt  DateTime? // null = 永不过期，建议默认创建时 +7 天
  usedCount  Int       @default(0)
  deletedAt  DateTime? // 软删除 = 撤销分享

  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  creator User @relation(fields: [createdBy], references: [id])

  @@map("cooperate_shares")
}
```

### 端点

新建 `CooperateModule`，路径 `/api/v1/collaboration`：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/share` | 生成分享 token，body `{ fileId, expiresIn?: number }`，返回 `{ token, url }` |
| GET | `/share/:token` | 解析 token，校验未过期/未删除，递增 `usedCount`，返回 `{ fileId }` |
| DELETE | `/share/:token` | 撤销分享，设 `deletedAt`，仅创建者可调用 |

## 不改动

| 模块 | 原因 |
|------|------|
| 代理 `/api/cooperate` | 不动，保持现状 |
| 权限系统 | 后续再考虑 |
| 移动端 Vue | 等桌面端跑通再同步 |
| NestJS Guard | 分享链接用 token 鉴权，不需要新增 Guard |

## 实施步骤

1. 定义 `CollaborateWorkData` / `CollaborateUserData` TypeScript 类型
2. Prisma 加 `CooperateShare` 表 + migrate
3. 后端新建 `CooperateModule`（3 个端点：创建 / 解析 / 撤销）
4. 前端改造 `CollaborateSidebar`（替换硬编码 + init 优化 + 列表过滤 + 文件名解析）
5. 前端新增 `ShareDialog` 组件
6. 前端新增分享落地页路由 `/share/:token`
7. 验证桌面端完整流程