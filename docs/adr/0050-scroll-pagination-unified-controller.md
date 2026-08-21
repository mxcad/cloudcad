# 0050 — 前端滚动分页统一控制器（Scroll Pagination Unified Controller）
**Status**: accepted

现状：四个滚动分页场景（我的图纸 `/personal-space`、项目管理 `/projects`、公开资源库 `/library/*`、CAD 编辑器侧边栏图纸库/图块库）此前各有实现，同一「上下滚动加载 = 在现有数据上追加/前插」本质逻辑被重复且不一致地实现：

- **三套滚动位置恢复**：`FileListGrid` 自实现 prepend 恢复；`useResourceListScroll`（侧边栏）自实现 jump/up 恢复；两者行为不一致（跳页定位、按钮翻页各写各的）。
- **方向靠外部状态传递**：`loadDirection` / `onLoadComplete` / `nextLoadDirection` 贯穿 ResourceListTypes → ResourceList → useResourceListScroll → ProjectPanelView → useProjectDrawingsInteractions → useProjectDrawingsData 六个文件；`buttonPaginateRef` 恒为 false 是死代码。
- **两套数据合并**：`useAccumulatedPagination`（管理页面展示层）与 `useLibraryLoader.mergeNodes`（侧边栏查询管线）重复实现 replace/append/prepend 去重。
- **体验缺口**：触发阈值固定 200px 滚动到底才请求（无预加载，慢网等待感）；点击页码无跳页定位（视口错位）；内容不足一屏不自动填充；无加载中/到底反馈。

**Decision**

**一、`useScrollPagination` 升级为统一滚动分页控制器（FileListGrid + ResourceList 共用）**

统一承载以下行为，四个场景行为完全一致：

1. **预加载边界触发**：触发阈值 = `max(300, clientHeight × 0.6)`（视口越大提前越多），距底/顶提前触发下一页/上一页，数据提前就位、滚动到底无等待；加载中整体阻塞防并发。
2. **页码指示 visiblePage**：累计多页（DOM 含多页）测量视口顶部所在页；单页（replace/jump）跟随渲染页。**距底 `PAGE_EDGE_PX = 200` 内恒为最后一页**（真实网格每项高度不均，视口顶部可能仍在前一页）——该阈值独立于触发阈值，避免预加载提前让页码过早变最后一页。
3. **滚动位置恢复**（数据到位 + 双 rAF，等父层合并渲染完成）：
   - `prev` 前插 → `scrollTop = oldTop + heightDiff` 视口锚定；
   - `next` 追加 → 不动；
   - `jump` 跳页（页脚页码/上一页/下一页按钮经 `jumpTo(page)` 通知）→ 累计模型定位目标页第一项（`offsetTop − clientHeight/2`，视口中心对准，上下皆可滚），replace 模型滚动条居中（`(scrollHeight − clientHeight)/2`）；
   - pageSize 变化 → 回顶。
4. **自动填充**：内容不足视口（`scrollHeight ≤ clientHeight + 1`）且还有下一页 → 自动触发 next 直至填满/加载完（挂载后 + itemsLength 变化 + ResizeObserver 视口变化；检查延迟一帧等布局稳定）。
5. **加载指示派生**：`showBottomLoader`（加载中）、`showTopLoader`（加载中且最近方向为 prev）、`isLastPage`（已到最后一页）——渲染层据此显示「加载中...」/「已经是最后一页」。
6. **方向自跟踪**：控制器内部记录最近滚动方向，**禁止外部 loadDirection 状态链**（已删除 6 文件传递 + buttonPaginateRef 死代码）。

**2026-08-14 体验增强（本轮补充）**

7. **速度感知动态提前量**：滚动处理中按 `|ΔscrollTop|/Δt` 计算瞬时速度，连续两次事件速度均达标（≥1500px/s）时触发阈值放大至多 2 倍（`max(300, clientHeight×0.6) × velocityFactor`）。**单次大跳（拖滚动条/PageDown）不放大**——需连续快速滚动才进入"快速模式"，保证快速滚到底数据已提前就位；慢速滚动回到基准值避免过早加载未看内容。
8. **链式预载**：翻页加载结束 + 替换屏蔽窗（`SETTLE_BLOCK_MS`）过后，若滚动位置仍停留在触发边界内（用户未再滚动），自动续载下一页/上一页——避免「滚到底 → 等加载 → 必须再滚一次」的体验断裂；**连续自动加载上限 `MAX_CHAIN_PAGES = 3`** 防慢网下无限拉取，用户滚动触发翻页时重置计数（jumpTo 跳页亦重置）。**翻页失败（`loadError` prop 非空，容器层从页面错误透传）时链式停止**——失败时数据未追加，继续链式会静默跳过失败页、破坏「列表=已加载连续页」不变量（失败页由底部失败条提示 + 重试恢复，重试成功后 useAccumulatedPagination 的挂起方向仍正确消费合并）。prev 方向数据到位后视口锚定（`oldTop + heightDiff`）会自然离开顶部边界，因此链式 prev 实际几乎不触发（防御性保留）。
9. **翻页失败降级（不整页替换）**：翻页/后台刷新请求失败时 react-query error 非空，若整页错误态替换列表会让**已滚动加载 N 页的内容瞬间消失**。容器层（FileListGrid/SelectableTable/ResourceList/ProjectListView）新增 `loadError?: string | null` + `onRetryLoadMore?: () => void`：列表已有内容时错误渲染为**底部失败条**（错误信息 + 重试按钮，与 isLastPage 互斥）；首屏（itemsLength = 0）仍走整页错误态。页面适配：FileSystemManager / LibraryManager（FileSystemStates 分流）、UserManagement（顶部 banner 改为仅首屏）、ShareManagePage。
10. **加载骨架占位与回顶**：底部加载中渲染共享 `ListSkeleton`（grid 卡片/列表行两形态，渲染于 itemContainer **之外**，不破坏 children↔items 一一对应的 DOM 二分测页）；共享 `ScrollToTopButton` 监听容器 scroll，滚动超过 2 屏后显示于容器右下角，点击平滑回顶。三容器 + 项目列表统一接入。

**2026-08-14 体验增强（第二轮：跳页/向上滚动交互修复）**

11. **prev 触发基于 `minLoadedPage`（列表第一项所属页码）**：该值由数据层合并逻辑维护（`useAccumulatedPagination` / `useLibraryLoader`：整体替换/prepend → currentPage，append → 不变，初始 1）。prev 触发条件从 `cp > 1` 改为 **`minLoadedPage > 1`，且目标页 = `minLoadedPage − 1`**（而非 `cp − 1`）——累计模型下 `cp − 1` 可能已在列表中（如 jump 到 3 后 next 到 4，列表 [3,4] 的 cp−1=3 已存在），触发会 prepend 去重错乱（[4,1,2,3,5]）+ 视口锚定后内容跳回第 1 页；jump 到深层页（replace 单页，minLoadedPage = currentPage）后向上滚仍正常逐页前插，`minLoadedPage = 1`（列表已覆盖第 1 页）时不触发。
12. **页码测量延迟到替换屏蔽窗结束**：`useLayoutEffect [itemsLength]` 的 `setMeasuredPage` 从"数据到位立即执行"改为"`SETTLE_BLOCK_MS` 后（滚动恢复双 rAF 已完成）执行"——prepend 前插后若在视口锚定前测量会读到旧 scrollTop（顶部触发值），页码被错误算成第 1 页且不再刷新；延迟后测量读到锚定后的最终位置（页脚指示器 = 可视内容）。
13. **页码测量带 `minLoadedPage` 偏移**：`measureVisiblePage` 的页码计算从 `floor(index / ps) + 1` 改为 `floor(index / ps) + minLoadedPage`（顶部恒为 `minLoadedPage`、距底恒为 `ceil(len / ps) + minLoadedPage − 1`）——jump 到深层页后向上滚动前插（列表不从第 1 页开始，如 [4,5]）时，旧公式把第 21 项（page5 第一项）算成第 2 页、把 page4 区域算成第 1 页，页脚指示器"跳回页码 1"（用户管理/我的图纸等所有累计模型页面均受影响；CAD 侧边栏页脚 Pagination 使用少不易暴露）。
14. **`displayedPage`（单页/replace 模型指示器）延迟到替换屏蔽窗结束更新**：`useEffect` 从 `if (!loading) setDisplayedPage(currentPage)`（依赖 loading/currentPage 立即执行）改为 `setTimeout(SETTLE_BLOCK_MS)` + cleanup 取消——滚动触发翻页时 `currentPage` 立即前跳，而 react-query 的 `isFetching` 经 `useSyncExternalStore` 可能延迟一帧才变 true，若立即更新会让页码抢先于数据（内容还是旧页）造成页码跳变（「页码快速滚动」：快速滚动时页脚页码 1→2→1 乱跳，数据到位后才稳定）；延迟窗口内 loading 变 true 时 cleanup 取消更新，只有数据真正到位才更新。

**二、`mergeNodesByMode(prev, incoming, mode)` 公共纯函数**

replace/append/prepend + 按 id 去重唯一实现，`useAccumulatedPagination`（管理页面）与 `useLibraryLoader.mergeNodes`（侧边栏）共用。

**三、测试先行保障（TDD）**

统一控制器行为以 `useScrollPagination.spec`（28 用例：指示/触发/恢复/jump 定位/自动填充/指示派生）为契约；`mergeNodesByMode.spec` 与 `useLibraryLoader.spec`（替换前固化合并行为）兜底数据层；`FileListGrid.spec` 覆盖渲染接线。重构分 6 阶段逐阶段绿（基线 → 契约红 → 实现绿 → 链简化 → 全量回归）。

**Guidance**

- 新增滚动分页列表：直接用 `useScrollPagination`（列表项容器提供 `itemContainerRef` 即可测量页码）+ 数据层用 `useAccumulatedPagination` 合并；不要重新实现恢复/定位/自动填充。
- 数据合并一律走 `mergeNodesByMode`，禁止再写 Map 去重。
- 页脚跳页必须经 `jumpTo(page)` 通知控制器（否则跳页后视口错位）。
- 不重新引入外部方向状态（loadDirection 类 props）；方向由控制器自跟踪。
- 翻页/刷新失败：有内容时不整页替换，传 `loadError` + `onRetryLoadMore` 给容器显示底部失败条；`totalPages` 初始 0（未同步时不算最后一页，禁 `max(1, …)` / `|| 1`）。
- 底部加载态用 `ListSkeleton`（itemContainer 之外）；列表项骨架/回顶按钮统一走共享组件。
- 数据层必须把 `minLoadedPage`（列表第一项所属页码）传给滚动控制器：replace/prepend → currentPage、append → 不变；prev 触发依赖它防重复加载已存在页。

## 已知限制（后续工作，2026-08-14 评估暂缓）

- 虚拟滚动（@tanstack/react-virtual）：与 DOM 二分测页（children↔items 一一对应）、橡皮筋框选、append/prepend 累计合并深度耦合，重写三容器风险高、管理列表数量级 <1000 收益有限 → [#369](https://github.com/mxcad/cloudcad/issues/369)
- 快速滚动跳页（skip pages）：破坏「列表=已加载连续页」不变量（测页/prev 锚定/jump 居中依赖连续）→ [#370](https://github.com/mxcad/cloudcad/issues/370)
- 后端分页设施统一：`page/pageSize` 与 `page/limit` 两套命名并存、service 手写 count+skip/take 重复，破坏性变更分批迁移 → [#371](https://github.com/mxcad/cloudcad/issues/371)
