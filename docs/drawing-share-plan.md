# 图纸分享设计方案

## 概述

分享就是「给人访问图纸的权限」。只有一种含义——给人看。

协同分享 = 分享 + 实时协同。接收者不仅能看，还能参与实时协同编辑（但依然不能保存原文件）。

现有 `CooperateShare` 已是雏形（token + fileId + 有效期），改进点：
1. **入口单一** — 只在协同侧边栏，文件管理器无入口
2. **无法选择是否启用协同** — 现在分享默认跟协同绑定，应解耦
3. **无管理能力** — 看不到已创建的分享，无法批量管理

---

## 核心概念

```
分享 = 给人看图纸
  └─ 可选：collaborationEnabled — 是否允许接收者加入实时协同
                                  加入协同后可实时同步编辑，但不可保存原文件
                                  只有项目成员（有 CAD_SAVE）才能保存
```

分享不设权限等级。**另存为是编辑器通用功能**，登录用户都可以另存到个人空间，跟分享无关。

### 关于协同工作区（work）的重要说明

协同工作区（work）由 **mxcad cooperate SDK** 管理，**不存储在后端数据库**。
- work 是瞬态的——最后一个人退出后自动消失
- 只有 CAD 编辑器加载后，通过 `cooperate.getWorks()` 才能查询到活跃 work
- **一个图纸同时只有一个活跃 work**，所有人加入同一个 session 才有协同意义
- 分享链接的 `collaborationEnabled` 只是一个「允许接收者协同」的权限开关，不等于创建了 work

### 两种模式

| 模式 | 接收者能做什么 |
|------|---------------|
| 分享（协同关） | 打开图纸 → 随意查看 → 可另存|
| 协同分享（协同开） | 打开图纸 → 加入协同 → 实时同步编辑 → 可另存 |

---

## 设计原则

1. **分享只有一种：给人看。** 不看权限等级，不设功能限制
2. **协同是可选附加项。** 跟分享解耦，独立开关控制
3. **不碰原文件。** `savemxweb/:nodeId` 有 `RequireProjectPermission(CAD_SAVE)」，非项目成员永远 403。不用改
4. **另存为是通用功能。** 跟分享无关，登录用户随时可另存到个人空间。不用改
5. **增量交付。** 分步上线，每步可独立验证
6. **向下兼容。** 已有字段不改，只加新字段和新端点

---

## 数据模型

### Prisma Schema

```prisma
model CooperateShare {
  // 现有字段（不变）
  id        String    @id @default(cuid())
  fileId    String
  token     String    @unique @default(nanoid(16))
  createdBy String
  expiresAt DateTime?
  usedCount Int       @default(0)
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  // 新增字段
  collaborationEnabled Boolean @default(false)

  creator User @relation(fields: [createdBy], references: [id])

  @@index([fileId])
  @@index([token])
  @@index([createdBy])
  @@map("cooperate_shares")
}
```

### 字段说明

| 字段 | 含义 | 默认值 |
|------|------|--------|
| `collaborationEnabled` | 是否允许接收者加入实时协同 | `false` |

### 已有数据兼容

库中无数据，无兼容问题。

---

## 分享流程

### 创建分享

```
用户操作入口（二选一）：
  ├─ 文件管理器：右键文件 → 分享
  └─ 协同侧边栏：当前文件 → 分享

          │
          ▼
    分享对话框
      ├─ 协同：□ 允许加入实时协同（默认关）
      ├─ 有效期：永不过期 / 1天 / 3天 / 7天 / 自定义
      └─ 确定 → POST /api/v1/collaboration/share
                → 返回 { token, url, expiresAt }
                → 展示 QR 码 + 可复制链接
          │
          ▼
    同一对话框可「撤销分享」
      └─ DELETE /api/v1/collaboration/share/:token
```

### 消费分享

```
接收者打开 /share/:token

  ├─ 未登录 → 显示图纸信息 → 引导登录/注册
  │           登录后继续
  │
  └─ 已登录 → GET /api/v1/collaboration/share/:token/node
              → 返回 { id, name, path, collaborationEnabled }
              → 跳转编辑器 /cad-editor/:fileId?shareToken=xxx
                │
                ▼
             CAD 编辑器
              ├─ 加载文件（filesData，JWT 鉴权）
              ├─ 工具栏：正常显示「另存为」按钮
              │  （另存为个人空间是通用功能，跟分享无关）
              └─ 如果 collaborationEnabled = true（在 CAD 就绪后执行）
                   → cooperate.getWorks() 查本 drawingId 的活跃 work
                     ├─ 有 → 提示「此图纸有活跃协同，是否加入？」
                     │       加入 → joinWork → 实时协同
                     │       不加入 → 正常查看
                     └─ 无 → 提示「是否创建协同并邀请其他人？」
                             创建并加入 → createWork + joinWork
                             暂不创建 → 正常查看
```

---

## 权限说明

### 保存覆盖（savemxweb/:nodeId）— 不改

现状：`@RequireProjectPermission(CAD_SAVE)`

分享接收者不是项目成员 → 403。不需要改任何代码。

### 另存为（save-as）— 不改

现状：`@UseGuards(JwtAuthGuard)`，`targetType=personal` 时检查个人空间归属

分享接收者是登录用户，可以正常另存到个人空间。不需要改任何代码。

### 文件加载（filesData）— 不改

现状：`@UseGuards(JwtAuthGuard)`

分享接收者已登录，JWT 鉴权通过即可加载。不需要改任何代码。

---

## 后端 API 变更

### 新增端点

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| `GET` | `/api/v1/collaboration/shares` | JWT | 列出当前用户创建的分享（管理页用） |
| `PATCH` | `/api/v1/collaboration/share/:token` | JWT | 修改分享设置（协同开关、有效期），仅创建者 |

### 修改端点

| 方法 | 路径 | 改动 |
|------|------|------|
| `POST` | `/share` | `CreateShareDto` 加 `collaborationEnabled` |
| `GET` | `/share/:token/node` | 响应加 `collaborationEnabled` |
| `DELETE` | `/share/:token` | 不变 |

### DTO 定义

```ts
// CreateShareDto — 新增 collaborationEnabled
interface CreateShareDto {
  fileId: string;
  expiresIn?: number;
  collaborationEnabled?: boolean;  // 默认 false
}
```

---

## 前端变更

### 组件

| 文件 | 改动 |
|------|------|
| `components/modals/ShareDialog.tsx` | 增加协同开关、有效期选择。从文件管理器调用时传 `fileId` |
| `components/modals/ShareManageDialog.tsx` | **新建** — 查看某个文件的所有分享链接 |
| `sidebar/CollaborateSidebar.tsx` | **重写** — 改为双 tab 结构（当前图纸 + 协同列表）。提取 `CurrentFilePanel` 和 `WorkListPanel` 子组件 |
| `sidebar/CurrentFilePanel.tsx` | **新建** — Tab 1 当前图纸状态卡，处理四种场景 |
| `sidebar/WorkListPanel.tsx` | **新建** — Tab 2 协同列表，展示项目名+图纸名+在线人数+加入 |
| `sidebar/CollaborateSidebar.module.css` | 更新—增加子 tab、状态卡、列表项等样式 |

### 页面

| 文件 | 改动 |
|------|------|
| `pages/ShareLanding.tsx` | 增加未登录引导、显示图纸名 |
| `pages/ShareManagePage.tsx` | **新建** — 全局分享管理页 (`/shares` 路由) |
| `pages/CADEditorDirect.tsx` | 通过 `shareToken` 打开文件时，`canSaveAs` 设为 `true`（通用功能） |
| `pages/FileSystemManager.tsx` | 文件列表增加「分享」入口 |

### 入口插入

`fileActionConfig` 增加 `share` action：

```ts
{
  type: 'share',
  icon: Share2,
  label: '分享',
  visibilityCheck: (node) => node.isFolder === false,
  permissionCheck: () => true,
}
```

### 类型

| 文件 | 改动 |
|------|------|
| `types/collaboration.ts` | 新增 `ShareInfo` 接口 |
| `api-sdk/types.gen.ts` | 重新生成 |
| `api-sdk/sdk.gen.ts` | 重新生成 |
| `App.tsx` | 增加 `/shares` 路由 |

---

## 协同侧边栏设计

### 设计决策

**一个图纸同时只有一个活跃 work。** 所有人加入同一个 session 才有协同意义。work 瞬态存在，最后一个人退出后自动消失。

**不需要"创建者"标签。** work 是瞬态的，谁创建的不重要。重要的是"当前有谁在线"——`link_user_data` 已包含所有参与者信息（id, name, avatar），直接展示参与者头像列表。

### 整体结构

侧边栏「实时协同」tab 下分两个子 tab：

```
┌─────────────────────────────────────┐
│  [当前图纸]  [协同列表]              │  ← 子 tab
├─────────────────────────────────────┤
│                                     │
│  （根据选中的 tab 渲染不同内容）      │
│                                     │
└─────────────────────────────────────┘
```

### Tab 1: 当前图纸

聚焦当前打开的文件，只显示一张状态卡。

#### 界面

```
┌─────────────────────────────────────┐
│  实时协同                            │
│                                     │
│  [当前图纸]  [协同列表]              │
│                                     │
│  ── 当前图纸 ──                      │
│  别墅方案A.dwg                       │
│                                     │
│  ┌─ 状态卡片 ────────────────────┐   │
│  │                               │   │
│  │  场景 A: 无活跃 work           │   │
│  │  👤 暂无协同                   │   │
│  │  [     创建协同     ]          │   │
│  │                               │   │
│  │  场景 B: 有 work，未加入       │   │
│  │  🟢 协同进行中                 │   │
│  │  👤 张三  👤 李四              │   │
│  │  [     加入协同     ]          │   │
│  │                               │   │
│  │  场景 C: 已加入                │   │
│  │  🟢 协同进行中                 │   │
│  │  👤 张三  👤 李四  👤 我       │   │
│  │  [分享]             [退出]     │   │
│  │                               │   │
│  │  场景 D: 分享但未开启协同       │   │
│  │  此图纸未开启协同              │   │
│  │  （仅分享接收者可见，无操作）   │   │
│  └───────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

#### 四种状态

| 场景 | 显示 | 操作 |
|------|------|------|
| **A: 无 work** | 👤 暂无协同 | [创建协同] — 调 `createWork` |
| **B: 有 work，未加入** | 🟢 协同进行中 + 参与者头像列表 | [加入协同] — 调 `joinWork` |
| **C: 已加入** | 🟢 协同进行中 + 参与者头像列表（含自己） | [分享] 打开 ShareDialog + [退出] 调 `exitWork` |
| **D: 分享但协同关** | 此图纸未开启协同 | 无（仅接收者，collaborationEnabled=false） |

**分享接收者在场景 A/B/C 下行为与项目成员一致**——有权限访问图纸就能创建/加入 work。

### Tab 2: 协同列表

展示当前用户可见项目内的所有活跃 work。

#### 数据范围

仅显示当前用户有成员资格的项目内的活跃 work。不含个人空间 work。

#### 界面

```
┌─────────────────────────────────────┐
│  实时协同                            │
│                                     │
│  [当前图纸]  [协同列表]              │
│                                     │
│  ┌──────┬──────────┬──────┬──────┐  │
│  │ 项目  │ 图纸     │ 在线  │ 操作 │  │
│  ├──────┼──────────┼──────┼──────┤  │
│  │ 别墅  │ 方案A    │ 2人  │ 加入 │  │
│  │ 小区  │ 总平图   │ 1人  │ 加入 │  │
│  │ 办公楼│ 立面图   │ 3人  │ ✓ 已 │  │
│  │ 别墅  │ 📌结构图 │ 1人  │ 加入 │  │
│  └──────┴──────────┴──────┴──────┘  │
│                                     │
└─────────────────────────────────────┘
```

#### 列表项

每行展示：

| 内容 | 来源 |
|------|------|
| 项目名 | work_data.projectId → FileSystemNode.name（project root） |
| 图纸名 | work_data.drawingId → FileSystemNode.name |
| 在线人数 | work.link_user_ids.length |
| 加入按钮 | 未加入显示 [加入]，已加入显示 ✓ 已加入（灰色） |
| 当前文件标记 | 当前文件 = `currentFileId` 时显示 📌 |

#### 状态

| 状态 | 处理 |
|------|------|
| 加载中 | Spinner |
| 无可用 work | "暂无活跃协同" + 空状态图 |
| 加载失败 | 错误提示 + 重试按钮 |

### 子 tab 切换 UI

参考现有 `SidebarContainer` 中 drawings 子 tab 的样式（`SUB_TABS` 模式），用 `Tab` 组件实现两个子 tab 切换。

### 协同侧边栏完整代码结构

```tsx
// CollaborateSidebar.tsx — 新结构
export const CollaborateSidebar: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'current' | 'list'>('current');
  const { currentFileId, currentProjectId } = useCADEditorStore();
  const { user } = useAuth();
  const [works, setWorks] = useState<Work[]>([]);       // 全量 work 列表
  const [currentWorkId, setCurrentWorkId] = useState<number | null>(null);

  // 获取所有 work → 分别供给两个 tab
  const fetchWorks = useCallback(async () => {
    const cooperate = getCooperate();
    cooperate.getWorks((workList) => {
      setWorks(workList);
    });
  }, []);

  // 当前文件匹配的 work（给 Tab 1）
  const currentFileWork = useMemo(() =>
    works.find(w => parseWorkData(w.work_data)?.drawingId === currentFileId),
    [works, currentFileId]
  );

  // 可加入的 work 列表（给 Tab 2）
  const availableWorks = useMemo(() => {
    // 仅展示用户有成员资格的项目内的 work
    // 每项包含项目名、图纸名、在线人数
    // 标记已加入的和当前文件
    return works
      .filter(w => {
        const data = parseWorkData(w.work_data);
        if (!data) return false;
        if (data.projectId && myProjectIds.includes(data.projectId)) return true;
        if (!data.projectId) return false;  // 过滤个人空间
        return false;
      })
      .map(w => ({
        ...w,
        projectName: projectNameCache[parseWorkData(w.work_data)!.projectId!],
        drawingName: fileNameCache[parseWorkData(w.work_data)!.drawingId],
        isCurrentFile: parseWorkData(w.work_data)?.drawingId === currentFileId,
        isJoined: w.link_user_ids.includes(user?.id ?? ''),
      }));
  }, [works, myProjectIds, projectNameCache, fileNameCache, currentFileId, user]);

  return (
    <div className={styles.container}>
      {/* 子 tab 切换 */}
      <div className={styles.subTabBar}>
        <Tab active={activeSubTab === 'current'} onClick={() => setActiveSubTab('current')}>
          当前图纸
        </Tab>
        <Tab active={activeSubTab === 'list'} onClick={() => setActiveSubTab('list')}>
          协同列表
        </Tab>
      </div>

      {activeSubTab === 'current' ? (
        <CurrentFilePanel
          work={currentFileWork}
          currentWorkId={currentWorkId}
          onCreateWork={handleCreateWork}
          onJoinWork={handleJoinWork}
          onExitWork={handleExitWork}
          onShare={() => setShareDialogOpen(true)}
        />
      ) : (
        <WorkListPanel
          works={availableWorks}
          currentWorkId={currentWorkId}
          onJoinWork={handleJoinWork}
        />
      )}

      <ShareDialog
        isOpen={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
      />
    </div>
  );
};
```

### 分享入口

分享按钮继续保留在 Tab 1 "已加入"状态卡片中，同时从文件管理器右键菜单也可进入。两处入口打开的都是同一个新的 `ShareDialog`（含协同开关 + 有效期）。

### 接收者打开分享链接后

与协同侧边栏联动：

```
/share/:token → 登录 → CAD 编辑器就绪
  │
  ├─ 自动检测 collaborationEnabled
  │    ├─ true → 查 work
  │    │          ├─ 有 → 提示加入
  │    │          └─ 无 → 提示创建
  │    └─ false → 无协同提示
  │
  └─ 用户可以随时在侧边栏 Tab 1 查看和操作
```

---

## 分享管理

### 后端 API

#### GET /api/v1/collaboration/shares

列出当前用户创建的所有分享（分页）。

**Query 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | number | 否 | 页码，默认 1 |
| `pageSize` | number | 否 | 每页条数，默认 20 |
| `fileId` | string | 否 | 按文件筛选（资源级管理用） |
| `search` | string | 否 | 按文件名搜索 |
| `sortBy` | string | 否 | `createdAt` / `expiresAt` / `usedCount`，默认 `createdAt` |
| `sortOrder` | `asc` / `desc` | 否 | 默认 `desc` |

**响应：**

```ts
interface ShareListResponse {
  items: ShareItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface ShareItem {
  id: string;
  token: string;
  url: string;                    // /share/{token}
  fileId: string;
  fileName: string;               // FileSystemNode.name（关联查询）
  collaborationEnabled: boolean;
  expiresAt: string | null;
  usedCount: number;
  createdAt: string;
}
```

#### PATCH /api/v1/collaboration/share/:token

修改分享设置，仅创建者可调。

**Body：**

```ts
interface UpdateShareDto {
  collaborationEnabled?: boolean;
  expiresAt?: string | null;   // ISO 日期，传 null 改为永不过期
}
```

### 全局管理页

**路由：** `/shares`（受 JWT 保护）

**入口：** 侧边栏导航底部增加「分享管理」入口

**UI 设计：**

```
┌──────────────────────────────────────────────────────────────┐
│  分享管理                                     [+ 新建分享]   │
├──────────────────────────────────────────────────────────────┤
│  [搜索框...]                                  [新建分享]  ▾  │
├──────┬──────────┬────────┬──────────┬──────┬────────┬───────┤
│ 文件 │ 链接      │ 协同   │ 有效期   │ 次数 │ 创建时间│ 操作  │
├──────┼──────────┼────────┼──────────┼──────┼────────┼───────┤
│ 别墅 │ /share/… │ 开     │ 5天后过期│  3   │ 06-01  │ ▾ ⋯  │
│ 方案A │         │        │          │      │        │       │
│      │   [复制]  │        │          │      │        │       │
├──────┼──────────┼────────┼──────────┼──────┼────────┼───────┤
│ 小区 │ /share/… │ 关     │ 永不过期 │ 12   │ 05-20  │ ▾ ⋯  │
│ 规划 │   [复制]  │        │          │      │        │       │
├──────┼──────────┼────────┼──────────┼──────┼────────┼───────┤
│                      ← 1  2  3 ... →                       │
└──────────────────────────────────────────────────────────────┘
```

**页面状态：**

| 状态 | 处理 |
|------|------|
| 加载中 | 骨架屏（Skeleton），占位表格行 |
| 空列表 | 插图 + "还没有分享过图纸" + 「去分享」按钮跳转文件管理器 |
| 搜索无结果 | "没有找到匹配的分享" + 清除搜索按钮 |
| 加载失败 | 错误提示 + 重试按钮 |

**操作菜单（点击 ▾）：**

| 操作 | 行为 |
|------|------|
| 复制链接 | 复制 `origin/share/{token}` 到剪贴板，toast 提示 |
| 编辑 | 弹出编辑弹窗（修改协同开关 + 有效期） |
| 撤销分享 | 确认对话框 → `DELETE /share/:token` → 列表移除该行 |
| 打开文件 | 跳转 CAD 编辑器打开该文件 |

**编辑弹窗：**

```
┌──────────────────────────────────────┐
│  编辑分享链接                         │
├──────────────────────────────────────┤
│                                      │
│  协同： □ 允许加入实时协同            │
│                                      │
│  有效期：                            │
│  ○ 永不过期                          │
│  ○ 1天后过期                         │
│  ○ 3天后过期     [当前: 2026-06-10]  │
│  ○ 自定义    [____] [____]           │
│                                      │
├──────────────────────────────────────┤
│           [取消]      [保存]          │
└──────────────────────────────────────┘
```

### 资源级管理

**入口：** 文件管理器右键菜单 → 「查看分享」

**组件：** `ShareManageDialog` — Modal 弹窗，复用全局管理页的 `ShareList` 子组件

**布局：**

```
┌──────────────────────────────────────────────┐
│  "别墅.dwg" 的分享链接       [+ 新建分享]    │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────┬────────┬──────┬────────┬───────┐ │
│  │ 链接    │ 协同   │ 有效期│ 次数   │ 操作  │ │
│  ├────────┼────────┼──────┼────────┼───────┤ │
│  │/share/…│ 开     │5天后 │  3     │ ▾ ⋯  │ │
│  │ [复制]  │        │      │        │       │ │
│  └────────┴────────┴──────┴────────┴───────┘ │
│                                              │
│  (没有更多分享)                               │
│                                              │
├──────────────────────────────────────────────┤
│                [关闭]                         │
└──────────────────────────────────────────────┘
```

**状态：**

| 状态 | 处理 |
|------|------|
| 加载中 | 局部 Spinner |
| 无分享 | "还没有分享过这个文件" + 「新建分享」按钮 |
| 操作失败 | 行内错误提示 + 重试 |

**"新建分享" 按钮：** 点击直接打开 `ShareDialog`，传当前 `fileId`

---

## 实施步骤

### Step 1: 模型扩展 + 后端 API
- Prisma 加 `collaborationEnabled` 字段 → `pnpm prisma migrate dev --name add_share_collaboration`
- `CooperateService` 扩展创建/解析逻辑
- 新增 `GET /shares`、`PATCH /share/:token`
- `pnpm generate:swagger` → `pnpm generate:sdk`

### Step 2: 协同侧边栏重写
- `CollaborateSidebar.tsx` 改为双 tab 结构
- 新建 `CurrentFilePanel.tsx`（当前图纸状态卡，四种场景）
- 新建 `WorkListPanel.tsx`（协同列表，项目名+图纸名+在线人数+加入）
- 添加项目名缓存解析逻辑（从 projectId 查 FileSystemNode）
- 当前文件标记、已加入标记

### Step 3: ShareDialog 增强
- 增加协同开关（默认关）
- 增加有效期选择
- 支持从文件管理器调用（传 `fileId`）

### Step 4: 文件管理器入口
- `fileActionConfig` 加 `share` action
- 右键菜单出现「分享」
- 对接 ShareDialog

### Step 5: ShareLanding 增强
- 未登录→引导登录/注册
- 显示图纸名

### Step 6: CAD 编辑器优化
- 分享打开时，`canSaveAs` 设为 `true`
- 显示协同提示（如果 `collaborationEnabled`）

### Step 7: 分享管理
- 全局管理页 `/shares`
- 资源级管理弹窗

### Step 8: 移动端同步（后续）

---

## 未解决问题

| 问题 | 状态 |
|------|------|
| 匿名用户查看图纸（无需登录） | 本次不做。filesData 需要 JWT |
| 项目级分享 | 本次不做。模型已留扩展 |
| 链接密码保护 | 后续可加 |
| 水印叠加 | 后续考虑 |
| 文件移动后分享链接 | 记录 fileId，节点移动后仍可解析 |
| 协同工作区（work）与分享的关联 | 已确定：通过 drawingId 运行时匹配，一个图纸一个 work |
| 协同侧边栏是否展示"创建者" | 已确定：不需要。展示参与者头像列表即可 |
| "协同列表"是否展示个人空间 work | 已确定：不展示。仅展示用户有成员资格的项目内 work |
