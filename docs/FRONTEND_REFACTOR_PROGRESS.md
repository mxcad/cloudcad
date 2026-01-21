# CloudCAD 前端重构进度跟踪

> 开始时间：2026-01-21
> 预计完成：14 天
> 当前分支：`refactor/frontend-cleanup`
> 回滚标签：`v0-pre-refactor`

## 📊 总体进度

| 阶段 | 状态 | 进度 |
|------|------|------|
| 阶段 0：准备工作 | ✅ 完成 | 100% |
| 阶段 1：全局基础设施重构 | 🔄 进行中 | 0% |
| 阶段 2：核心组件重构 | ⏳ 待开始 | 0% |
| 阶段 3：目录结构重组 | ⏳ 待开始 | 0% |
| 阶段 4：优化与测试 | ⏳ 待开始 | 0% |
| 阶段 5：文档更新与发布 | ⏳ 待开始 | 0% |

---

## 阶段 0：准备工作（1 天）✅

### 已完成任务

- [x] 创建重构分支 `refactor/frontend-cleanup`
- [x] 创建回滚标签 `v0-pre-refactor`
- [x] 安装 Zustand 依赖（版本 5.0.10）
- [x] 配置 ESLint 规则（禁止 console.log 和 any 类型）
- [x] 创建重构进度跟踪文档

### 验收标准

- ✅ Zustand 安装成功
- ✅ ESLint 规则生效
- ✅ 所有测试通过

---

## 阶段 1：全局基础设施重构（3 天）🔄

### 1.1 清理调试代码（1 天）

- [x] 创建 `utils/logger.ts` 替代 console.log
- [ ] 全局搜索并替换所有 `console.log`（160+ 处）
  - [ ] `components/FileItem.tsx`（50+ 处）
  - [ ] `hooks/useFileSystem.ts`（30+ 处）
  - [ ] `services/apiService.ts`（20+ 处）
  - [ ] 其他组件文件
- [ ] 删除过时注释（如 `// 静默`）
- [ ] 删除未使用的代码（mockApi、cleanConsole.ts）

**验收标准**：
- [ ] 0 处 console.log（生产代码）
- [ ] 0 处未使用的导入/变量
- [ ] ESLint 检查通过

---

### 1.2 代码去重（1 天）

- [x] 创建 `utils/hashUtils.ts` - 统一文件哈希计算
- [ ] 创建 `utils/fileUtils.ts` - 统一文件格式化函数
- [x] 创建 `utils/permissionUtils.ts` - 统一权限检查
- [x] 创建 `utils/errorHandler.ts` - 统一错误处理
- [ ] 删除重复实现
  - [ ] `services/apiService.ts`（删除 calculateFileHash）
  - [ ] `hooks/useMxCadUploadNative.ts`（删除 calculateFileHash）
  - [ ] `utils/filesystemUtils.ts`（删除重复函数）
  - [ ] 多个组件中的权限检查逻辑

**验收标准**：
- [ ] 0 处重复函数
- [ ] 所有重复逻辑已提取到工具函数
- [ ] 代码重复率 < 5%

---

### 1.3 引入 Zustand（1 天）

- [ ] 创建 `stores/uiStore.ts` - UI 状态（Toast、Modal）
- [ ] 创建 `stores/fileSystemStore.ts` - 文件系统状态
- [ ] 创建 `stores/notificationStore.ts` - 通知状态
- [ ] 迁移现有状态到 Zustand
- [ ] 更新组件使用 Zustand
  - [ ] `components/Layout.tsx`
  - [ ] `pages/FileSystemManager.tsx`
  - [ ] `hooks/useFileSystem.ts`

**验收标准**：
- [ ] Zustand stores 正常工作
- [ ] Props drilling 减少 50%
- [ ] 状态管理集中化

---

## 阶段 2：核心组件重构（5 天）⏳

### 2.1 拆分 FileItem 组件（2 天）

- [ ] 创建 `components/file-system/FileItem/index.tsx`（主组件，50 行）
- [ ] 创建 `components/file-system/FileItem/FileThumbnail.tsx`（缩略图）
- [ ] 创建 `components/file-system/FileItem/FileMenu.tsx`（菜单）
- [ ] 创建 `components/file-system/FileItem/FileActions.tsx`（操作按钮）
- [ ] 创建 `components/file-system/FileItem/FileContextMenu.tsx`（右键菜单）
- [ ] 创建 `components/file-system/FileItem/FileGridItem.tsx`（网格视图）
- [ ] 创建 `components/file-system/FileItem/FileListItem.tsx`（列表视图）
- [ ] 重写 `components/FileItem.tsx` 为组合组件

**验收标准**：
- [ ] 每个子组件 < 200 行
- [ ] 主组件 < 100 行
- [ ] 功能完全一致
- [ ] 所有测试通过

---

### 2.2 拆分 useFileSystem Hook（2 天）

- [ ] 创建 `hooks/file-system/useFileSystem.ts`（主 Hook，100 行）
- [ ] 创建 `hooks/file-system/useFileSystemData.ts`（数据加载）
- [ ] 创建 `hooks/file-system/useFileSystemActions.ts`（操作）
- [ ] 创建 `hooks/file-system/useFileSystemSelection.ts`（选择逻辑）
- [ ] 创建 `hooks/file-system/useFileSystemDragDrop.ts`（拖拽）
- [ ] 创建 `hooks/file-system/useFileSystemValidation.ts`（验证）
- [ ] 创建 `hooks/file-system/useFileSystemPagination.ts`（分页）
- [ ] 重写 `hooks/useFileSystem.ts` 为组合 Hook

**验收标准**：
- [ ] 每个 Hook < 150 行
- [ ] 主 Hook < 100 行
- [ ] 功能完全一致
- [ ] 所有测试通过

---

### 2.3 拆分 FileSystemManager 组件（1 天）

- [ ] 创建 `pages/FileSystemManager.tsx`（主页面，200 行）
- [ ] 创建 `components/file-system/ProjectList.tsx`（项目列表）
- [ ] 创建 `components/file-system/FileManager.tsx`（文件管理）
- [ ] 创建 `components/file-system/FileGrid.tsx`（文件网格）
- [ ] 创建 `components/file-system/FileList.tsx`（文件列表）
- [ ] 创建 `components/file-system/BreadcrumbNavigation.tsx`（面包屑导航）
- [ ] 重写 `pages/FileSystemManager.tsx` 为组合组件

**验收标准**：
- [ ] 每个子组件 < 300 行
- [ ] 主组件 < 200 行
- [ ] 功能完全一致
- [ ] 所有测试通过

---

## 阶段 3：目录结构重组（2 天）⏳

### 3.1 重组目录结构（1 天）

- [ ] 创建新的目录结构（按功能模块）
- [ ] 移动组件到新目录
- [ ] 移动 hooks 到新目录
- [ ] 更新所有导入路径
- [ ] 删除旧目录

**新目录结构**：
```
packages/frontend/
├── components/
│   ├── ui/ (基础 UI 组件)
│   ├── layout/ (布局组件)
│   ├── file-system/ (文件系统组件)
│   ├── uploads/ (上传组件)
│   ├── admin/ (管理员组件)
│   └── shared/ (共享组件)
├── hooks/
│   ├── auth/ (认证相关)
│   ├── file-system/ (文件系统相关)
│   ├── mxcad/ (MxCAD 相关)
│   └── shared/ (共享)
├── pages/
│   ├── auth/ (认证页面)
│   ├── admin/ (管理员页面)
│   ├── file-system/ (文件系统页面)
│   ├── cad/ (CAD 编辑器)
│   └── resources/ (资源管理)
├── services/
│   ├── api/ (API 服务)
│   └── mxcad/ (MxCAD 服务)
├── stores/ (Zustand stores)
├── contexts/ (Context)
├── types/ (类型定义)
└── utils/ (工具函数)
```

**验收标准**：
- [ ] 所有文件移动到新目录
- [ ] 所有导入路径更新
- [ ] 构建成功
- [ ] 所有测试通过

---

### 3.2 优化 API 架构（1 天）

- [ ] 创建 `services/api/apiClient.ts`（统一 API 客户端）
- [ ] 创建 `services/api/types.ts`（API 类型定义）
- [ ] 拆分 `apiService.ts` 为多个模块：
  - [ ] `services/api/authApi.ts`
  - [ ] `services/api/usersApi.ts`
  - [ ] `services/api/fileSystemApi.ts`
  - [ ] `services/api/projectsApi.ts`
  - [ ] `services/api/mxcadApi.ts`
  - [ ] `services/api/galleryApi.ts`
  - [ ] `services/api/fontsApi.ts`
- [ ] 统一响应格式处理
- [ ] 简化拦截器逻辑

**验收标准**：
- [ ] API 调用逻辑清晰
- [ ] 响应格式统一
- [ ] 拦截器简化为单一层
- [ ] 所有测试通过

---

## 阶段 4：优化与测试（2 天）⏳

### 4.1 性能优化（1 天）

- [ ] 为纯展示组件添加 `React.memo`
- [ ] 使用 `useMemo` 优化计算密集型操作
- [ ] 使用 `useCallback` 优化回调函数
- [ ] 优化 useEffect 依赖
- [ ] 减少不必要的状态更新

**涉及文件**：
- [ ] `components/file-system/FileItem/*`
- [ ] `pages/FileSystemManager.tsx`
- [ ] `hooks/file-system/*`

**验收标准**：
- [ ] React DevTools Profiler 显示性能提升
- [ ] 无不必要的重渲染
- [ ] 所有测试通过

---

### 4.2 类型安全优化（1 天）

- [ ] 移除所有 `any` 类型
- [ ] 完善类型定义
- [ ] 添加运行时类型验证（Zod）
- [ ] 修复类型错误

**涉及文件**：
- [ ] `services/apiService.ts`
- [ ] `services/mxcadManager.ts`
- [ ] `hooks/useMxCadInstance.ts`
- [ ] 其他使用 any 的文件

**验收标准**：
- [ ] 0 处 `any` 类型（必要的除外）
- [ ] TypeScript 编译通过
- [ ] 所有测试通过

---

## 阶段 5：文档更新与发布（1 天）⏳

### 5.1 文档更新

- [ ] 更新 README.md
- [ ] 更新组件文档
- [ ] 更新 API 文档
- [ ] 创建重构总结文档

### 5.2 发布

- [ ] 创建 Git 标签 `v0-post-refactor`
- [ ] 合并到主分支
- [ ] 部署到生产环境

**验收标准**：
- [ ] 文档完整准确
- [ ] 代码审查通过
- [ ] 所有测试通过
- [ ] 部署成功

---

## 📈 关键指标

| 指标 | 重构前 | 目标 | 当前 |
|------|--------|------|------|
| 代码行数 | ~15,000 | -12,000 | ~15,000 |
| 代码重复率 | 15% | <5% | 15% |
| 组件平均行数 | 1000+ | <300 | 1000+ |
| any 类型数量 | 50+ | 0 | 50+ |
| console.log 数量 | 160+ | 0 | 160+ |
| 测试覆盖率 | 60% | 90% | 60% |
| 新增工具函数 | 0 | - | 4 |

---

## 🚨 风险与问题

| 风险 | 状态 | 缓解措施 |
|------|------|----------|
| 引入新 Bug | ⏳ | 每阶段完成后完整测试 |
| 破坏现有功能 | ⏳ | 保持向后兼容，渐进式重构 |
| 性能下降 | ⏳ | 使用 React DevTools Profiler 监控 |
| 重构时间超期 | ⏳ | 分阶段交付，优先处理高影响问题 |

---

## 📝 日志

### 2026-01-21

- ✅ 创建重构分支 `refactor/frontend-cleanup`
- ✅ 创建回滚标签 `v0-pre-refactor`
- ✅ 安装 Zustand 依赖（版本 5.0.10）
- ✅ 配置 ESLint 规则（禁止 console.log 和 any 类型）
- ✅ 创建重构进度跟踪文档
- ✅ 创建 utils/logger.ts - 统一日志工具
- ✅ 创建 utils/hashUtils.ts - 统一文件哈希计算
- ✅ 创建 utils/permissionUtils.ts - 统一权限检查
- ✅ 创建 utils/errorHandler.ts - 统一错误处理
- ✅ 提交阶段0和阶段1部分成果（commit: 19b6e86）

---

## 📞 联系方式

如有问题或疑问，请联系开发团队。