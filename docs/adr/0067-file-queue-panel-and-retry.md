# 文件队列：取消悬浮药丸 + 删除永久失败机制 + 失败重试 + 配额可见

**Status**: accepted

转换队列面板（ADR-0065）上线后暴露三个问题，本次一并解决，并因此把面板改名为**文件队列**：

1. **悬浮药丸是遮挡式入口**：无任务时也常驻屏幕一角，用户明确希望"不要常驻"。
2. **"转换失败就永远失败"**：后端与 conversion-service 各自维护一套「永久失败」负缓存，把某类内容标记为不可重试并展示「永久失败」徽标。用户认为失败就应能重试。
3. **失败后没有重试入口**：转换失败 / 下载失败的行只有取消或删除，无法原地重跑。

## 决策

### D1 面板改名「文件队列」，隐藏态不渲染任何可见元素

面板改名 `文件队列`（i18n key 8012）。`ConversionPanel` 在 `collapsed` 时**直接 `return null`**——不再有 `.conversion-collapsed` 悬浮药丸。用户反馈"取消悬浮药丸"的准确含义是"不要常驻可见元素"，而非"面板不可用"：入口改到顶栏，见 D2。

面板自身的交互能力**保持不变**：可拖动、8 向缩放、位置持久化（ADR-0065 D8）。默认位置仍是右下角。

### D2 入口迁移：顶栏按钮 + CAD 命令

- **非 CAD 页**：`Layout.tsx` 右上角语言切换按钮组**左侧**常驻一个 `ListTodo` 图标按钮，点击调 store 的 `togglePanel()` 切换显隐；有进行中任务时显示角标（活跃任务数）。
- **CAD 编辑器页**：`/cad-editor/:fileId` 不渲染 React 顶栏（`Layout.tsx` 早退返回隐藏 div），故注册 CAD 命令 `Mx_ToggleFileQueue`（`src/services/mxcadManager/cmd/toggleFileQueue.ts`），走 `mxcadManager` 的 `MxFun.addCommand` 桥接。用户自行配置工具栏入口，**不改 `myUiConfig.json`**。
- 面板自身的「隐藏」按钮（头部 X）保留，语义改为"完全隐藏"。

`togglePanel()` 放在 store 而非组件内，使顶栏按钮与 CAD 命令两条入口共用同一切换逻辑。

### D3 删除「永久失败」机制（前后端全链）

「转换失败就永远失败」涉及两套各自独立的实现，全部删除：

| 层 | 删除内容 |
|---|---|
| conversion-service | `services/negative-cache.ts`（按内容 hash 的负缓存）、`routes/conversions.ts` 的 known-bad 路由（`GET`/`POST /v1/conversions/known-bad/reset`）、`runner.ts` 的 `deterministic` 判定 |
| backend | `conversion-monitor` 的 `listKnownBad`/`resetKnownBad` 与 `ResetKnownBadDto`、`conversion-task.dto.ts` 的 `ConversionTaskItemDto.permanent`/`contentKey`、`function-executor` 接口与 `http-conversion.executor` 的 `permanent` 映射 |
| frontend | `ConversionTask.permanent`、ConversionTab 的「永久失败」徽标、SystemMonitorPage 转换队列 Tab 的「永久失败」区块与复位按钮（含孤儿 `XCircle`/`Button` import 与 `.knownBad*` CSS）、known-bad 的 MSW handler 与 spec mock |

**`contentKey` 不删**：conversion-service 的 `CONTENT_KEY_FIELDS`（ADR-0060）用于结果缓存的内容身份派生，与「永久失败」无关。删掉的只是它作为负缓存 key 的那条链路。

保留的部分：失败呈现（ConversionTab 红色失败图标 + 「转换失败」文案）、文件树节点的失败徽标、上传重试 / 下载重试 / 「仅重试失败项」——这些是失败状态的可读性，不是「不可重试」的机制。

### D4 失败重试端点

新增 `POST /api/v1/mxcad/conversion/tasks/:taskId/retry`（`conversion-task.controller.ts`）：

- **归属校验**：按 taskId 查 `fileSystemNode`，加 `buildAccessFilter(userId)`，防止越权重试他人任务；查不到抛 `error.conversion_task.not_found_or_no_access`。
- **状态校验**：仅 `FileStatus.FAILED` 可重试，否则抛 `error.conversion_task.retry_not_failed`。
- **重跑**：调 `asyncConversionService.convertNode(nodeId, priority=2)`——FAILED→PROCESSING 是状态机合法迁移边，走**原地重新排队**（不重新上传、不新建节点），返回新 taskId。前端拿到新 taskId 后按 `nodeId` 合并，无需额外适配。
- **无次数上限**：源文件在首次转换时已占过配额位，重试不再占位，仅受转换并发信号量约束。

前端行内重试按钮（转换 tab 失败行 + 下载 tab 失败行）：点击后立即置回 `pending`（乐观），失败则回写错误信息。

### D5 配额可见（面板头部）

新增 `GET /api/v1/mxcad/conversion/quota`（`@Public()`，游客按 IP 窗口，登录用户按 userId 窗口）：委托 ADR-0043 的 `RestrictionEngine.getConversionQuotaState(userId, ip)`，与占位（扣减）走**同一 Redis 窗口键与同一上限来源**，因此显示值即实际限制。

返回 `ConversionQuotaDto`：`{ limit, used, remaining, windowHours, unlimited, resetsAt, scope }`。`unlimited: true` 时面板显示「转换次数不限」且不出进度条；否则显示「本 {h} 小时剩 {n}/{m} 次」+ 进度条（宽度按 `used/limit`）。

前端 `useConversionQuota(enabled)`：面板展开时启用，`staleTime`/`refetchInterval` 60s，失败静默降级（返回 null，不渲染配额条），不阻断面板。

### D6 行内按钮统一用全局 Tooltip

面板**三个 tab**（转换 / 下载 / 上传）行右侧图标按钮原先用原生 `title`，改为 `src/components/ui/Tooltip.tsx`（`content` prop）以符合"要有 hover tip（应存在全局组件）"的要求。两处例外**保留原生 `title`**：面板 8 个 resize 手柄与头部拖拽区——`Tooltip` 会包一层 `className="relative"` 的 wrapper，破坏 `position: absolute` 子元素的定位。被 CSS 截断的长文本（文件名、错误信息、时间戳）也保留原生 `title`——它是完整内容的唯一显示通道，不是图标按钮。

同时给这些图标按钮补 `aria-label`（原生 `title` 顺带提供了可访问名，换成 Tooltip 后不丢）。

## 遗留（后续排票）

**process-pool 模式缺 cancel 与 queuePosition**：`FUNCTION_EXECUTOR=conversion-service` 支持取消任务与队列位置（`/v1/conversions/tasks/:taskId/cancel` + `queuePosition`），process-pool 模式没有等价实现，面板在 process-pool 模式下不显示取消按钮与「第 N 位」。这是执行器能力差异而非本次改动引入的回归（两个 executor 的功能对齐是独立议题），单独排票，不在本次范围。

排票时的实现面评估（2026-09-14 摸排）：

- **queuePosition（中等）**：`RateLimiter` 内部三个优先级队列用自身递增的 `nextTaskId` 编号，与 conversion 的 `taskId` 是两套编号。做法是在 `RateLimiter.execute` 增可选 `taskKey` 参数写入 `TaskState`，`ProcessPoolExecutor` 建 `taskKey → TaskState.id` 映射，`getTaskStatus` 对 `PENDING` 任务查所在优先级队列的索引。
- **cancel（大）**：`ProcessPoolExecutor.invoke` 在调用 `rateLimiter.execute` 之前就把 `record.status` 置为 `PROCESSING`，即「排队中」的任务尚未拿到信号量——取消排队中任务只需从队列移除对应 `TaskState`。但真在跑的 mxcadassembly 子进程，从 executor 到 `fileConversionService` 到 `mxcad-exec` 的 `spawn` 全链路没有任何 AbortSignal 或进程组杀除通路，需穿透实现。
- **不要只做一半**：只做 queuePosition 会让 process-pool 出现「取消排队中有效、取消运行中报不支持」，与「两个执行器功能无缺」的诉求相悖。若要分批，先做 queuePosition、cancel 单独排票，并在面板对 process-pool 明确隐藏取消按钮（现状即如此，无需改动）。

## 回归防护

- `packages/backend/src/mxcad/conversion/conversion-task.service.spec.ts`：`retryTask` 用例覆盖归属校验、非 FAILED 拒绝、成功重跑返回新 taskId；`getQuota` 用例覆盖 unlimited 与有限窗口两种形状。
- `packages/backend/src/mxcad/conversion/file-conversion.service.spec.ts`：断言确定性失败也可重试（负缓存已移除，同内容二次调用仍真跑）。
- `packages/frontend/src/components/conversion-panel/ConversionPanel.spec.tsx`：44 例覆盖隐藏态无可见元素、`togglePanel` 双向切换、越界 position 展开前 clamp、失败行重试（成功/失败两路）、配额条两种形状。
- `packages/frontend/src/pages/SystemMonitorPage/SystemMonitorPage.spec.tsx`：断言转换队列 Tab 不再出现「永久失败」区块与复位按钮。
- 生成产物已同步：`packages/api-sdk`（无 `permanent`/`KnownBad`，含 `conversionTaskControllerGetQuota`/`conversionTaskControllerRetryTask`）、`src/test/msw/generated/handlers.ts`、i18n 四语言。

## 关联

- ADR-0065（转换队列悬浮面板 UX）——D1 常驻悬浮药丸、D3 自动展开时机、D8 默认位置的部分结论已被本 ADR 取代，详见其行内废弃标记。
- ADR-0043（限制与配额）——D5 直接复用其 `RestrictionEngine`，未新增限流语义。
- ADR-0058 / ADR-0060（转换队列监控 / 并发与缓存）——D3 删除 known-bad 后，监控页「转换队列」Tab 只剩统计与趋势，不含永久失败区块。
- ADR-0014（conversion-service 抽取 + `FUNCTION_EXECUTOR` 三模式）——D4 的重试与取消端点只在 conversion-service 模式下有完整能力，见遗留。
