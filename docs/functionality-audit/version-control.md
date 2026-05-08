# Version Control (SVN) — 逻辑意图审计报告

> **分支对比:** `main` (old, messy, functionally complete) vs `refactor/circular-deps` (new, refactored)
> **审计日期:** 2026-05-08
> **审计人员:** Claude Code (automated)

---

## 一、结构变更概览

| 层级 | main 分支 | refactor/circular-deps 分支 |
|------|-----------|---------------------------|
| **Controller** | `version-control.controller.ts` — 2 个端点 | 同上，2 个端点，无新增 |
| **Service** | 单体服务，包含所有 SVN 逻辑 | 瘦包装层，委托给 `SvnVersionControlProvider` |
| **Provider** | 不存在 | **新增** `SvnVersionControlProvider` 实现 `IVersionControl` |
| **Interface** | 不存在 | **新增** `IVersionControl` + `VERSION_CONTROL_TOKEN` |
| **Module** | 简单 DI，导出 `VersionControlService` | 增加 `SvnVersionControlProvider`、`VERSION_CONTROL_TOKEN`、`forwardRef` |
| **DTO** | 4 个 DTO（同当前分支） | 无变更 |
| **svnVersionTool** | 18 个 JS 文件 | 18 个 JS 文件（无差异） |
| **Frontend** | 2 个 hooks + 2 个 Modal + 1 个 Dropdown | 同 main |

---

## 二、API 端点对比

### 2.1 Controller 端点（✅ 相同，2 个端点均保留）

| 端点 | main | refactor/circular-deps | 状态 |
|------|------|------------------------|------|
| `GET /version-control/history` | ✅ | ✅ | 逻辑一致 |
| `GET /version-control/file/:revision` | ✅ | ✅ | ⚠️ 有类型转换 hack |

**⚠️ 问题：类型转换 hack**

当前分支第 107 行使用了 `as unknown as Promise<FileContentResponseDto>` 强制类型转换：

```typescript
// refactor/circular-deps 分支 — version-control.controller.ts:102-110
async getFileContentAtRevision(
  @Param('revision', ParseIntPipe) revision: number,
  @Query('projectId') projectId: string,
  @Query('filePath') filePath: string
): Promise<FileContentResponseDto> {
  return this.versionControlService.getFileContentAtRevision(
    filePath,
    revision
  ) as unknown as Promise<FileContentResponseDto>;
}
```

这是因为 `VersionControlService` 返回的是内部接口类型而 `SvnVersionControlProvider` 返回的是 `IVersionControl` 接口类型，两者与 Swagger DTO 类型不兼容。hack 本身不影响运行时行为，但揭示了**重构中类型系统的对齐问题**。

---

## 三、Service 方法完整性对比

### 3.1 内部操作（供 file-system 等模块调用）

| 方法 | main | refactor/circular-deps | 状态 |
|------|------|------------------------|------|
| `commitNodeDirectory()` | ✅ | ✅ | 逻辑一致，新分支增加了 `FileUtils.validatePath()` 安全校验和文件路径备份 |
| `commitFiles()` | ✅ | ✅ | 逻辑一致 |
| `commitWorkingCopy()` | ✅ | ✅ | 逻辑一致 |
| `deleteNodeDirectory()` | ✅ | ✅ | 新分支增加了 `FileUtils.validatePath()` |
| `getFileHistory()` | ✅ | ✅ | 逻辑一致 |
| `getFileContentAtRevision()` | ✅ | ✅ | 逻辑一致 |
| `listDirectoryAtRevision()` | ✅ | ✅ | 逻辑一致，参数类型拓宽为 `string \| number` |
| `isReady()` | ✅ | ✅ | 逻辑一致 |
| `ensureInitialized()` | ✅ | ✅ | 逻辑一致 |
| **`rollbackToRevision()`** | ❌ 不存在 | ✅ Provider 中存在 | 🔴 |

### 3.2 初始化逻辑

| 功能 | main | refactor/circular-deps | 状态 |
|------|------|------------------------|------|
| SVN 仓库创建 (`svnadmin create`) | ✅ | ✅ | 一致 |
| 工作副本检出 / import | ✅ | ✅ | 一致 |
| `svn:global-ignores` 设置 | ✅ | ✅ | 一致 |
| 锁定错误自动 cleanup 重试 | ✅ | ✅ | 一致 |
| 配置缺失时抛异常 | ❌ 静默 `!` 断言 | ✅ `throw InternalServerErrorException` | 改进 |
| `FileUtils.validatePath` 安全检查 | ❌ | ✅ `commitNodeDirectory` / `deleteNodeDirectory` | 改进 |

---

## 四、🔴 需要决策的问题

### 🔴 NEEDS DECISION: `rollbackToRevision()` 存在但无 API 端点、无 UI

**发现：**
- `SvnVersionControlProvider` (line 773-819) 实现了 `rollbackToRevision(filePath, revision, message?)` 方法
- 该方法通过 `svn update -r` + `svn commit` 实现文件回滚
- `IVersionControl` 接口中声明了此方法
- **但 Controller 中没有对应的 API 端点**（main 也没有）
- **前端没有任何调用此方法的代码**
- **不存在于 `VersionControlService` 的公共方法中**（Service 未转发此方法）

**评估：**
这是一个在重构过程中**预埋但未暴露**的新功能。意图上属于"增强"，不属于"丢失的旧功能"。但当前状态是死代码——Provider 实现了、接口声明了、但无法被外部调用（Controller 未暴露，Service 未转发）。

| 选项 | 描述 |
|------|------|
| **A. 暴露为 API** | 在 Controller 加 `POST /version-control/rollback` 端点 + 权限校验 + DTO，前端加回滚按钮 UI |
| **B. 暂不暴露** | rollback 逻辑保留在 Provider 中（供未来使用），标记为 TODO，不阻塞当前合并 |
| **C. 移除** | 如果短期不需要，删除 `rollbackToRevision` 避免死代码 |

**建议：** 选项 B（暂不暴露），但需在接口注释中标记 `@internal` 或 `TODO`。

---

## 五、前后端对齐检查

### 5.1 前端调用的 API

前端通过 `versionControlControllerGetFileHistory` (SDK 自动生成) 调用 **唯一** 的版本控制 API：

| 前端组件 | 调用的端点 | 状态 |
|----------|-----------|------|
| `VersionHistoryDropdown.tsx` | `GET /version-control/history` | ✅ 正常 |
| `ProjectDrawingsPanel/hooks/useVersionHistory.ts` | `GET /version-control/history` | ✅ 正常 |
| `FileSystemManager/hooks/useVersionHistory.ts` | `GET /version-control/history` | ✅ 正常 |
| `ProjectDrawingsPanel/components/VersionHistoryModal.tsx` | (通过 hook) | ✅ 正常 |
| `components/modals/VersionHistoryModal.tsx` | 未直接调用 API | ✅ 需确认引用链 |

### 5.2 前端未使用的后端能力

| 后端能力 | 前端使用 | 说明 |
|----------|---------|------|
| `GET /version-control/file/:revision` | ❌ 未直接调用 | CAD 编辑器通过 URL 参数 `?v=revision` 加载历史版本，可能由 CAD 引擎内部处理 |
| `listDirectoryAtRevision()` | ❌ | 纯内部方法，供 file-system 模块使用 |
| `rollbackToRevision()` | ❌ | 见上方 🔴 决策 |

### 5.3 权限控制

| 端点 | 权限要求 | main | refactor | 状态 |
|------|---------|------|----------|------|
| `GET /history` | `VERSION_READ` | ✅ | ✅ | 一致 |
| `GET /file/:revision` | `VERSION_READ` | ✅ | ✅ | 一致 |

---

## 六、重构质量评估

### ✅ 改进项

1. **接口抽象** — `IVersionControl` 接口使 SVN 实现可替换（便于测试 mock 和未来切换到 Git）
2. **关注点分离** — Provider 负责 SVN 操作，Service 负责业务编排
3. **配置安全** — 配置缺失时明确抛异常，而非静默 `!` 断言
4. **路径安全** — `commitNodeDirectory` 和 `deleteNodeDirectory` 增加了 `FileUtils.validatePath()` 防路径遍历
5. **错误恢复** — commitNodeDirectory 失败时备份文件路径信息

### ⚠️ 待改进项

1. **类型转换 hack** — Controller 中的 `as unknown as Promise<FileContentResponseDto>` 应通过正确的类型映射消除
2. **`rollbackToRevision` 死代码** — 功能实现但无入口（见上方 🔴）
3. **Service 冗余** — `VersionControlService` 当前只是 Provider 的转发层，未来可考虑 Controller 直接注入 Provider

---

## 七、svnVersionTool 包

两个分支的 `packages/svnVersionTool/` 下的 18 个 JS 文件完全一致（无差异）。

导出的方法：
```
svnCheckout, svnAdd, svnCommit, svnDelete, svnadminCreate, svnImport,
svnLog, svnCat, svnList, svnPropset, svnUpdate, svnCleanup
```

---

## 八、总结

| 指标 | 结论 |
|------|------|
| **功能完整性** | 所有 main 分支的功能均已保留（无丢失） |
| **新增功能** | `rollbackToRevision()` — 预埋但未暴露（🔴 需决策） |
| **架构改进** | Provider 模式 + 接口抽象（✅ 正向重构） |
| **安全性改进** | 配置校验 + 路径安全校验（✅ 改进） |
| **待修复问题** | Controller 类型转换 hack（⚠️ 技术债） |
| **前后端对齐** | 一致，无断连 |

**结论：** 重构未丢失任何旧功能。`rollbackToRevision` 是新增的死代码，需要决策是否暴露。可安全合并，但建议在合并前解决类型转换 hack。
