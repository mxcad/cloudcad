# Vue 3 迁移评估报告

**生成日期**: 2026-05-02
**当前分支**: refactor/circular-deps
**评估范围**: 16个前端页面

---

## 1. 可复用资源分析

### 1.1 API 服务层（完全可复用）

| 服务文件 | 用途 | Vue 3 可复用性 |
|---------|------|----------------|
| `apiClient.ts` | Axios 基础配置和拦截器 | ✅ 完全可复用 |
| `authApi.ts` | 认证相关 API | ✅ 完全可复用 |
| `usersApi.ts` | 用户管理 API | ✅ 完全可复用 |
| `projectsApi.ts` | 项目管理 API | ✅ 完全可复用 |
| `projectApi.ts` | 单个项目操作 API | ✅ 完全可复用 |
| `nodeApi.ts` | 文件节点操作 API | ✅ 完全可复用 |
| `filesApi.ts` | 文件操作 API | ✅ 完全可复用 |
| `rolesApi.ts` | 角色管理 API | ✅ 完全可复用 |
| `projectMemberApi.ts` | 项目成员 API | ✅ 完全可复用 |
| `projectPermissionApi.ts` | 项目权限 API | ✅ 完全可复用 |
| `mxcadApi.ts` | MxCAD 编辑器 API | ✅ 完全可复用 |
| `versionControlApi.ts` | 版本控制 API | ✅ 完全可复用 |
| `auditApi.ts` | 审计日志 API | ✅ 完全可复用 |
| `adminApi.ts` | 管理员 API | ✅ 完全可复用 |
| `runtimeConfigApi.ts` | 运行时配置 API | ✅ 完全可复用 |
| `healthApi.ts` | 健康检查 API | ✅ 完全可复用 |
| `libraryApi.ts` | 库管理 API | ✅ 完全可复用 |
| `fontsApi.ts` | 字体库 API | ✅ 完全可复用 |

### 1.2 类型定义（完全可复用）

| 类型文件 | 用途 | Vue 3 可复用性 |
|---------|------|----------------|
| `types/api-client.ts` | API 请求/响应类型 | ✅ 完全可复用 |
| `types/filesystem.ts` | 文件系统类型 | ✅ 完全可复用 |
| `types/sidebar.ts` | 侧边栏类型 | ✅ 完全可复用 |
| `types/tour.ts` | 导览类型 | ✅ 完全可复用 |

### 1.3 工具函数（完全可复用）

| 工具文件 | 用途 | Vue 3 可复用性 |
|---------|------|----------------|
| `utils/fileUtils.ts` | 文件工具函数 | ✅ 完全可复用 |
| `utils/dateUtils.ts` | 日期工具函数 | ✅ 完全可复用 |
| `utils/hashUtils.ts` | 哈希工具函数 | ✅ 完全可复用 |
| `utils/permissionUtils.ts` | 权限工具函数 | ✅ 完全可复用 |
| `utils/validation.ts` | 验证工具函数 | ✅ 完全可复用 |
| `utils/errorHandler.ts` | 错误处理工具 | ✅ 完全可复用 |
| `utils/mxcadUtils.ts` | MxCAD 工具函数 | ✅ 完全可复用 |
| `utils/mxcadUploadUtils.ts` | MxCAD 上传工具 | ✅ 完全可复用 |

---

## 2. 页面复杂度评估

### 2.1 页面分类总览

| 类别 | 页面数量 | 预估总工作量 | 风险等级 |
|------|---------|-------------|----------|
| **简单页面** | 6 | 2-3 天 | 低 |
| **中等页面** | 5 | 3-5 天 | 中 |
| **复杂页面** | 5 | 5-8 天 | 高 |

### 2.2 详细页面评估

#### 第一组：简单页面（低复杂度）

| 页面 | 依赖分析 | 预估工作量 | 风险等级 | 可复用资源 |
|------|---------|-----------|----------|-----------|
| **Login.tsx** | AuthContext、ThemeContext、BrandContext、RuntimeConfigContext、authApi | 4-6 小时 | ⭐ 低 | authApi、types |
| **Register.tsx** | AuthContext、ThemeContext、BrandContext、authApi | 4-6 小时 | ⭐ 低 | authApi、types |
| **ForgotPassword.tsx** | ThemeContext、authApi | 3-4 小时 | ⭐ 低 | authApi、types |
| **ResetPassword.tsx** | ThemeContext、authApi | 3-4 小时 | ⭐ 低 | authApi、types |
| **EmailVerification.tsx** | ThemeContext、authApi | 3-4 小时 | ⭐ 低 | authApi、types |
| **PhoneVerification.tsx** | ThemeContext、authApi | 3-4 小时 | ⭐ 低 | authApi、types |

**简单页面特点**：
- 主要是表单交互和简单的 API 调用
- 状态管理相对简单
- 组件依赖较少
- 几乎没有复杂的业务逻辑

#### 第二组：中等页面（中复杂度）

| 页面 | 依赖分析 | 预估工作量 | 风险等级 | 可复用资源 |
|------|---------|-----------|----------|-----------|
| **Dashboard.tsx** | AuthContext、ThemeContext、BrandContext、projectsApi、usersApi、ProjectModal、FileItem | 1-2 天 | ⭐⭐ 中 | projectsApi、usersApi、types、utils |
| **Profile.tsx** | AuthContext、ThemeContext、多个 Tab 组件 | 1-2 天 | ⭐⭐ 中 | usersApi、types |
| **ProfileEmailTab.tsx** | AuthContext、usersApi | 4-6 小时 | ⭐⭐ 中 | usersApi、types |
| **ProfilePasswordTab.tsx** | AuthContext、usersApi | 4-6 小时 | ⭐⭐ 中 | usersApi、types |
| **ProfilePhoneTab.tsx** | AuthContext、usersApi | 4-6 小时 | ⭐⭐ 中 | usersApi、types |

**中等页面特点**：
- 需要整合多个 API 数据源
- 包含多个子组件
- 需要状态管理（如表单状态）
- 可能涉及权限检查

#### 第三组：复杂页面（高复杂度）

| 页面 | 依赖分析 | 预估工作量 | 风险等级 | 可复用资源 |
|------|---------|-----------|----------|-----------|
| **FileSystemManager.tsx** | useFileSystem、useProjectManagement、usePermission、useProjectPermissions、多个 Modal 组件、uploader | 3-4 天 | ⭐⭐⭐ 高 | projectsApi、nodeApi、types、utils |
| **CADEditorDirect.tsx** | MxCAD 实例、主题同步、协作功能 | 3-4 天 | ⭐⭐⭐ 高 | mxcadApi、types、utils |
| **UserManagement.tsx** | usersApi、权限检查、表格分页 | 2-3 天 | ⭐⭐⭐ 高 | usersApi、types |
| **RoleManagement.tsx** | rolesApi、权限系统、表格分页 | 2-3 天 | ⭐⭐⭐ 高 | rolesApi、types |
| **AuditLogPage.tsx** | auditApi、表格分页、时间筛选 | 1-2 天 | ⭐⭐ 中高 | auditApi、types |
| **SystemMonitorPage.tsx** | adminApi、实时数据展示 | 1-2 天 | ⭐⭐ 中高 | adminApi、types |
| **RuntimeConfigPage.tsx** | runtimeConfigApi、表单配置 | 1-2 天 | ⭐⭐ 中高 | runtimeConfigApi、types |
| **LibraryManager.tsx** | libraryApi、文件上传 | 2-3 天 | ⭐⭐⭐ 高 | libraryApi、types |
| **FontLibrary.tsx** | fontsApi、字体上传预览 | 1-2 天 | ⭐⭐ 中高 | fontsApi、types |

**复杂页面特点**：
- 涉及复杂的状态管理逻辑
- 大量的交互和模态框
- 需要与 MxCAD 深度集成
- 复杂的权限控制
- 表格分页、搜索、筛选功能

---

## 3. 推荐迁移顺序

### 3.1 迁移路线图

```
阶段一（第1周）: 基础设施搭建 + 简单页面
├── 配置 Vue 3 + Vite + Pinia
├── 配置 Vue Router
├── 复用 API 服务层
├── 迁移 Login.tsx
├── 迁移 Register.tsx
└── 迁移 ForgotPassword.tsx

阶段二（第2周）: 简单页面完成 + 中等页面启动
├── 迁移 ResetPassword.tsx
├── 迁移 EmailVerification.tsx
├── 迁移 PhoneVerification.tsx
├── 迁移 Dashboard.tsx
└── 迁移 Profile 相关页面

阶段三（第3-4周）: 复杂页面迁移
├── 迁移 AuditLogPage.tsx
├── 迁移 SystemMonitorPage.tsx
├── 迁移 RuntimeConfigPage.tsx
├── 迁移 FontLibrary.tsx
└── 迁移 UserManagement.tsx

阶段四（第5-6周）: 核心复杂页面
├── 迁移 RoleManagement.tsx
├── 迁移 LibraryManager.tsx
├── 迁移 FileSystemManager.tsx
└── 迁移 CADEditorDirect.tsx
```

### 3.2 详细迁移顺序表

| 序号 | 页面 | 优先级 | 预估工时 | 建议阶段 |
|------|------|--------|---------|---------|
| 1 | Login.tsx | P0 | 4-6h | 阶段一 |
| 2 | Register.tsx | P0 | 4-6h | 阶段一 |
| 3 | ForgotPassword.tsx | P1 | 3-4h | 阶段一 |
| 4 | ResetPassword.tsx | P1 | 3-4h | 阶段二 |
| 5 | EmailVerification.tsx | P1 | 3-4h | 阶段二 |
| 6 | PhoneVerification.tsx | P1 | 3-4h | 阶段二 |
| 7 | Dashboard.tsx | P0 | 1-2d | 阶段二 |
| 8 | Profile.tsx | P1 | 1-2d | 阶段二 |
| 9 | ProfileEmailTab.tsx | P2 | 4-6h | 阶段二 |
| 10 | ProfilePasswordTab.tsx | P2 | 4-6h | 阶段二 |
| 11 | ProfilePhoneTab.tsx | P2 | 4-6h | 阶段二 |
| 12 | AuditLogPage.tsx | P2 | 1-2d | 阶段三 |
| 13 | SystemMonitorPage.tsx | P2 | 1-2d | 阶段三 |
| 14 | RuntimeConfigPage.tsx | P2 | 1-2d | 阶段三 |
| 15 | FontLibrary.tsx | P2 | 1-2d | 阶段三 |
| 16 | UserManagement.tsx | P1 | 2-3d | 阶段三 |
| 17 | RoleManagement.tsx | P1 | 2-3d | 阶段四 |
| 18 | LibraryManager.tsx | P1 | 2-3d | 阶段四 |
| 19 | FileSystemManager.tsx | P0 | 3-4d | 阶段四 |
| 20 | CADEditorDirect.tsx | P0 | 3-4d | 阶段四 |

---

## 4. 风险评估与缓解措施

### 4.1 风险矩阵

| 风险 | 影响程度 | 概率 | 缓解措施 |
|------|---------|------|----------|
| MxCAD 集成兼容性 | 高 | 中 | 先做 PoC 验证，锁定版本 |
| 状态同步问题 | 高 | 中 | 使用 localStorage + Pinia + CustomEvent |
| Vuetify 主题冲突 | 中 | 低 | 使用共享 Vuetify 实例 |
| 路由迁移错误 | 中 | 中 | 编写路由映射表，逐个验证 |
| 权限系统迁移 | 中 | 中 | 复用 permissionUtils，编写测试 |
| 第三方库兼容性 | 低 | 低 | 检查 Vue 3 兼容性，使用 VueUse |

### 4.2 关键风险点

#### 风险1：MxCAD 编辑器集成
- **问题**: CADEditorDirect 深度依赖 React 生命周期
- **缓解**: 逐步迁移，保留 React 包装层，渐进式替换

#### 风险2：状态管理迁移
- **问题**: React Context/Store 需要转换为 Pinia
- **缓解**: 创建状态映射表，逐个 Store 迁移

#### 风险3：事件系统兼容
- **问题**: React 事件处理与 Vue 3 事件系统不同
- **缓解**: 使用自定义事件 + Pinia 组合方案

---

## 5. 迁移工作量估算

### 5.1 总工作量估算

| 类别 | 页面数 | 单页面工时 | 总工时 |
|------|--------|-----------|--------|
| 简单页面 | 6 | 3-6h | 18-36h |
| 中等页面 | 5 | 8-16h | 40-80h |
| 复杂页面 | 5 | 16-32h | 80-160h |
| **总计** | **16** | - | **138-276h** |

**按人天计算**（按每天 8 小时）：
- 最小估算：138 / 8 ≈ **17 人天**
- 最大估算：276 / 8 ≈ **35 人天**

**建议团队配置**：
- 2-3 名前端开发人员
- 预计 3-4 周完成核心页面迁移

### 5.2 资源需求

| 资源类型 | 需求 |
|---------|------|
| 前端开发 | 2-3 人 |
| 后端配合 | 1 人（API 验证） |
| QA 测试 | 1-2 人 |
| 设计评审 | 按需 |

---

## 6. 结论与建议

### 6.1 可复用资源总结

**完全可复用**（约 80% 代码）：
- API 服务层（services/*.ts）
- 类型定义（types/*.ts）
- 工具函数（utils/*.ts）

**需要转换**（约 20% 代码）：
- React 组件 → Vue 3 组件
- React Hooks → Vue 3 Composables
- React Context → Pinia Stores
- React Router → Vue Router

### 6.2 迁移策略建议

1. **渐进式迁移**: 从简单页面开始，逐步积累经验
2. **保留兼容层**: 对于复杂的 MxCAD 集成，保留 React 包装层
3. **自动化测试**: 迁移过程中同步编写测试用例
4. **代码审查**: 每个页面迁移后进行代码审查
5. **性能监控**: 迁移后进行性能对比测试

### 6.3 下一步行动

1. **立即行动**: 创建 Vue 3 PoC 项目，验证 MxCAD 集成
2. **短期计划**: 完成基础设施搭建和简单页面迁移
3. **中期计划**: 完成中等和复杂页面迁移
4. **长期计划**: 性能优化和全量回归测试

---

**文档版本**: 2.0
**审核状态**: 待评审
**下一步**: 评审此方案，确定资源配置和时间表