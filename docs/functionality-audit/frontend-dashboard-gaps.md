# Dashboard 功能差异审计报告

**比较分支**: `main` vs `refactor/circular-deps`  
**审计日期**: 2026-05-08  
**审计范围**: Dashboard.tsx 页面 (前端仪表盘)

## 总体结论

当前分支 (`refactor/circular-deps`) 的 Dashboard 实现与 `main` 分支存在显著差异。**核心问题是架构不同**：main 分支使用自定义 hooks (`useDashboardStats`, `useDashboardProjects`)，而当前分支在组件内部直接调用 API 并管理状态。这导致了以下具体功能缺口和问题。

## 详细差异分析

| 维度 | main 分支 | 当前分支 | 影响等级 |
|------|-----------|----------|----------|
| **数据获取方式** | 使用 `useDashboardStats` 和 `useDashboardProjects` hooks | 直接在 `useEffect` 中调用 `projectsApi.list()`, `usersApi.getDashboardStats()`, `projectsApi.getPersonalSpace()` | 可维护性降低，但功能完整 |
| **创建项目后刷新** | hook 内部处理列表刷新，统计不自动更新 | 手动刷新项目列表，**不刷新统计数据和文件列表** | **中** — 用户创建项目后统计卡片数字不变 |
| **创建项目错误处理** | 独立 `createError` 状态，与页面加载错误分离 | 复用 `error` 状态，会覆盖加载错误 | **低** — 错误信息可能被覆盖 |
| **个人空间文件加载失败** | hook 内部处理，可能显示特定错误 | 静默失败 (`.catch(() => null)`)，用户无感知 | **低** — 用户体验稍差 |
| **加载状态粒度** | 分离 `statsLoading` 和 `projectsLoading` | 单一 `loading` 状态 | 无实际影响 |
| **空状态处理** | 两者均有空状态提示 | 两者均有空状态提示 | 一致 |
| **权限处理** | 无显式权限检查 | 无显式权限检查 | 一致 |
| **样式/布局** | 完全相同 (使用 Tailwind + CSS 变量) | 完全相同 | 一致 |
| **错误/成功提示** | 均使用 AlertCircle / CheckCircle | 均使用相同组件 | 一致 |

## 具体功能缺口

### 1. 创建项目后统计卡片不更新 (中优先级)

**重现步骤**:
1. 访问 Dashboard
2. 点击「新建项目」，创建成功
3. 观察「我的项目」统计卡片

**预期行为**: 统计卡片中的项目数量增加 1  
**实际行为**: 数字不变（需要刷新页面）

**技术原因**:
```typescript
// 当前分支 handleCreateProject 中：
// 只刷新了 projects 列表，没有调用 usersApi.getDashboardStats()
setProjects(sortedProjects);
// 缺少: setDashboardStats(新统计数据)
```

### 2. 创建项目错误会覆盖页面加载错误 (低优先级)

**重现步骤**:
1. 页面初次加载时发生网络错误 → 显示「加载数据失败」
2. 用户尝试创建项目并失败 → 错误被替换为「创建项目失败」

**预期行为**: 保持原有错误或堆叠显示  
**实际行为**: 错误被覆盖

### 3. 个人空间文件静默失败 (低优先级)

**代码**:
```typescript
const [projectsRes, statsRes, personalSpaceRes] = await Promise.all([
  projectsApi.list(),
  usersApi.getDashboardStats(),
  projectsApi.getPersonalSpace().catch(() => null), // 静默失败
]);
```

如果 `getPersonalSpace` 失败，`personalSpaceRes` 为 `null`，`recentFiles` 保持空数组，用户不知道可能存在的权限或配置问题。

## 可立即修复的问题

以下问题可以独立修复，无需改动架构：

1. **创建项目后刷新统计** — 在 `handleCreateProject` 成功分支中调用 `usersApi.getDashboardStats()` 并更新 `dashboardStats`
2. **分离创建错误状态** — 添加 `createError` 状态，在错误区域同时显示 `error` 和 `createError`
3. **个人空间失败提示** — 在 catch 中设置 `setError('无法加载个人空间文件')` 或静默处理但记录日志

## 待决策问题

以下问题涉及架构选择，需要团队决策：

1. **是否恢复使用自定义 hooks**？ — main 分支的 `useDashboardStats` 和 `useDashboardProjects` 提供了更好的关注点分离。当前分支的内联实现降低了可维护性。
2. **是否需要统计自动刷新**？ — 创建项目后是否需要刷新所有相关数据，还是仅刷新列表？

## 修复建议

| 问题 | 修复方案 | 预计工作量 |
|------|----------|-----------|
| 统计不刷新 | 在 `handleCreateProject` 中添加 `usersApi.getDashboardStats().then(setDashboardStats)` | 5 分钟 |
| 错误覆盖 | 添加 `createError` 状态，错误区域合并显示 | 10 分钟 |
| 个人空间失败 | 添加 `setError` 或 `console.warn` | 2 分钟 |

## 测试计划

- [ ] 创建项目后验证统计数字更新
- [ ] 创建项目失败时错误信息正确显示且不覆盖其他错误
- [ ] 个人空间 API 失败时用户收到提示（或至少控制台有日志）

## 附件

- `main` 分支 Dashboard.tsx (commit: 参考 git history)
- 当前分支 Dashboard.tsx (路径: `packages/frontend/src/pages/Dashboard.tsx`)

---
*审计完成时间: 2026-05-08*
