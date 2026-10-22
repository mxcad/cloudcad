# 0080 — 通知呈现分级 + 常驻横幅改铃铛下拉 + ack/viewed 双簿记

**Status**: accepted（2026-10-20）

通知按 `level` 三级分流呈现：`danger` 弹框、`warning` 可点 toast、`info` 只进列表
（不主动打扰）。常驻公告横幅删除，改为 header 右侧的通知铃铛（下拉 + 未读徽标）。
管理端补齐单条删除与批量删除。前端把「已提醒（ack）」与「已查看（viewed）」拆成
两套簿记，各自服务不同语义。

## 背景

三个独立的痛点叠加：

1. **横幅恒常驻**：`NoticeBanner` 挂在 Layout 顶部、无背景色区分、无关闭按钮。
   无论内容紧急与否都占一整条 header 高度，且 `info` 级公告（说明性内容）与
   `danger` 级（停机维护）在视觉上完全同级——用户无法从呈现方式判断该不该立即响应。
2. **CAD 编辑器是全屏覆盖层**：CAD 路由渲染 `<></>`，`CADEditorDirect` 是
   `fixed inset-0` 的全屏 WebGL 叠加层，header 与铃铛都不在 DOM 可视范围内。
   任何依赖 header 的呈现方式在编辑器内都失效，必须另设入口。
3. **管理端只有「下线」没有「删除」**：`POST /:id/retract` 把公告状态改为
   `retracted`，记录永久留存。管理员想清掉误发/废弃公告没有手段，列表只会越来越长。

「已读」只有一套簿记（`cloudcad_notice_acks`，24h TTL）。TTL 到期会重新弹框——
这对停机公告是刻意设计（跨天要再提醒一次）。但把同一套数据同时用作铃铛「未读」
徽标的判据会导致：用户昨天点开看过公告，24h 后红点重新亮起。观感上是 bug。

## 决策

### D1 — 三级分流（按 `level`，与前端页面状态无关）

| level | 普通页面 | CAD 编辑器内 |
|---|---|---|
| `danger` | 模态弹框（`Z_LAYERS.MODAL`） | 同左 |
| `warning` | 可点击 toast（8s，一次一条排队）→ 打开铃铛下拉 | toast → 打开通知列表弹框 |
| `info` | 仅出现在列表中 | 仅出现在列表中 |

`warning` 的 toast 之所以在 CAD 编辑器内改开模态而非下拉：CAD 编辑器没有 header，
下拉没有锚点；而模态是编辑器内唯一可用的居中呈现方式。

**`forceOverlay`**：`warning` 的 toast 带 `forceOverlay: true`，旁路 `routeToCadMessage`。
CAD 路由的消息条不可点击，把可点击的 toast 路由过去会让「点 toast 看列表」失效。

### D2 — 呈现入口由页面状态决定，不是由 level 决定

分流键是 `useCADEditorStore((s) => s.isActive)`：

- 普通页面 → Radix `Popover` 下拉（无遮罩，轻打扰）。
- CAD 编辑器 → `Modal`（编辑器内唯一可用的居中容器）。

进 CAD 编辑器时立刻关闭铃铛下拉（header 已被覆盖层挡住，下拉不应继续悬在编辑器上）。

**`PopoverTrigger` 不用 `asChild`**：项目的 `Button` 未 `forwardRef`，
Radix 拿不到定位 ref。铃铛触发器直接写成原生 `PopoverTrigger`（`role=button`
由 Radix 承担），视觉上与其他 header 按钮对齐。外层 `Tooltip` 不 clone children，
故 `Tooltip` 包 `Popover` 安全；反过来不成立。

### D3 — ack 与 viewed 双簿记（不可复用同一套）

| | ack | viewed |
|---|---|---|
| 语义 | 已**提醒**过（抑制重复弹窗/toast） | 已**点开看过**（驱动铃铛红点） |
| 键 | `cloudcad_notice_acks:<ownerId>` | `cloudcad_notice_viewed:<ownerId>` |
| 值 | `Record<noticeId, timestamp>` | `string[]`（noticeId 集合） |
| TTL | 24h（`NOTICE_ACK_TTL_MS`），到期重新提醒 | 无 TTL，永久 |
| 清理 | `pruneExpiredAcks` 剔除过期项 | `pruneViewed` 剔除不再生效的 noticeId |

**`pruneViewed` 在 `validIds.size === 0` 时直接返回原值**：首屏尚未拉回数据时
`notices` 恒为空，若按「全部公告已消失」清理，会把用户已读记录一次性抹掉、
红点集体复亮。

两套簿记都按 `<ownerId>` 分键（未登录归 `anonymous`），沿用既有「按账号隔离」
的修法——同一浏览器上 A 账号关掉公告不该让 B 账号在 TTL 内静默错过。

仍刻意用 localStorage 而非后端已读表：离线部署没有可靠的用户在线状态，
已读回传会产生大量无用写入。代价是换设备重新提醒——对停机公告可接受。

### D4 — 长内容用滚动而不是压缩

列表下拉 `maxHeight` 420（普通页面）/ 480（CAD 弹框），内容超出时列表内部滚动。
不做字号自适应、不做「展开更多」两段式——两段式会让用户误以为看完就没了。

### D5 — 删除语义

- **删除 = 硬删，不可恢复**（`DELETE /notices/:id`）。审计留痕：
  `AuditAction.NOTICE_DELETE` + `ResourceType.NOTICE`，`params` 记 `wasActive`
  与批量条数。
- **下线（retract）= 软删**，记录留存可重新发布。管理员要「清掉」用删除，
  要「暂时停掉」用下线。两者并存，不用一个动作覆盖另一个语义。
- 删除正在生效的公告即立即从 `GET /notices/current` 响应中消失，
  所有在线用户下一个轮询周期不再看到（retract 走广播即时失效）。
- 批量删除 `POST /notices/batch-delete`（`{ ids }` → `{ requested, deleted, active, notFound }`）。
  必须声明在 `@Post(':id/...')` 之前，否则被 `:id` 吃掉。

### D6 — 状态过滤只做前端

管理页的状态筛选（全部/生效中/待生效/已过期/草稿/已下线）复
用 `deriveNoticeStatus` + `NOTICE_STATUS_LABELS`，纯前端 `filter`，不加后端参数。
当前公告量级下前端过滤足够；等列表量级上来再考虑服务端分页+筛选。

## 权衡与代价

- **`info` 不再主动呈现**：管理员发一条 `info` 公告后，用户不会被打扰到，
  只能主动点铃铛。这是刻意的——`info` 就是说明性内容，不该抢占注意力。
  代价是「被动公告」的触达率下降，管理员需要用 `warning` 才能确保被看到。
- **24h TTL 导致跨天重新提醒**：`danger` 公告跨天会再弹一次。这是刻意设计
  （停机公告不能只提醒一次），保留。
- **换设备重新提醒**：localStorage 簿记的固有代价，保留。
- **CAD 编辑器内 `warning` 开模态**：比普通页面的 toast 打扰更强，但编辑器内
  没有更轻的选择（header 不可达）。
- **`pruneViewed` 空集合不清理**：极端情况下（全部公告被删光）已读记录会滞留
  一个清理周期。体积影响可忽略。

## 迁移

- Prisma：`20261020000000_add_notice_audit_enum` 加两个枚举值
  （`AuditAction.NOTICE_DELETE` / `ResourceType.NOTICE`）。`ADD VALUE` 是在线变更，
  不锁表、不影响存量数据。
- 无存量数据迁移：ack/viewed 都是 localStorage，旧键（无账号后缀）自然失效于 TTL。
- API SDK 与 MSW handler 已随契约变更重新生成（`noticeCenterControllerRemove`、
  `noticeCenterControllerBatchDelete` 两个新函数）。

## 已知未做

- **移动端未跟随分级**：`packages/frontend_mobile` 的 `NoticeDialog.vue` 仍对
  所有未 ack 公告（含 `info`）弹模态，且移动端没有通知列表页与菜单入口。
  补齐需要新建页面 + 路由 + 菜单项，属独立工作项，本轮不纳入。
- **`NOTICE_STATUS_LABELS` 的值不走 `t()` 提取**：`constants.ts` 里的
  `生效中/待生效/已过期/草稿/已下线` 以变量形式传入 `t()`，i18n 静态提取无法
  建映射，多语言下按原样渲染。这是既有行为，本轮未改动。
