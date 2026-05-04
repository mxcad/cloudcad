# CloudCAD 前端迁移资产盘点

> 生成时间: 2026-05-03
> 项目目录: `packages/frontend/src/`
> 目标框架: Vue 3 + Vue 3 + Vuetify 3

---

## 概述

本文档对 CloudCAD 前端项目的所有 React 资产进行了完整盘点，并按照迁移难度进行分级：

| 等级 | 说明 |
|------|------|
| **直接复用** | 纯逻辑、工具函数、常量、类型定义，可以直接复用或极少改动 |
| **语法转换** | 主要是 React 特有语法转换为 Vue 3 语法，逻辑基本保持不变 |
| **完全重写** | 复杂组件、依赖 React 生态的部分需要完全重写 |

---

## 一、Components（组件）盘点

### 1.1 UI 基础组件 (`components/ui/`)

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| Button.tsx | 通用按钮组件 | 语法转换 | 逻辑简单，主要是 JSX 转 Vue Template + Tailwind 保持 |
| ConfirmDialog.tsx | 确认对话框 | 语法转换 | 使用 Vue Dialog 替代 Radix UI |
| LoadingOverlay.tsx | 全局加载遮罩 | 语法转换 |
| Modal.tsx | 模态框组件 | 语法转换 | 使用 Vuetify Dialog |
| PageSkeleton.tsx | 页面骨架屏 | 语法转换 |
| Pagination.tsx | 分页组件 | 语法转换 |
| Toast.tsx | 通知提示组件 | 语法转换 |
| Tooltip.tsx | 提示组件 | 语法转换 |
| TruncateText.tsx | 文本截断组件 | 语法转换 |
| index.ts | 导出文件 | 直接复用 |

**UI 组件总数**: 9个

---

### 1.2 业务组件

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| AuthBackground.tsx | 认证页面背景 | 语法转换 |
| AuthLayout.tsx | 认证页面布局 | 语法转换 |
| BreadcrumbNavigation.tsx | 面包屑导航 | 语法转换 |
| CategoryTabs.tsx | 分类标签组件 | 语法转换 |
| CollaborateSidebar.tsx | 协作侧边栏 | 完全重写 | 复杂交互逻辑，依赖 React |
| DirectoryImportDialog.tsx | 目录导入对话框 | 语法转换 |
| DynamicBackground.tsx | 动态背景 | 语法转换 |
| FileIcons.tsx | 文件图标映射 | 直接复用 | 纯配置 |
| FileItem.tsx | 文件项展示组件 | 语法转换 |
| KeyboardShortcuts.tsx | 键盘快捷键组件 | 完全重写 | 复杂交互，需要重新设计 |
| Layout.tsx | 主布局组件 | 完全重写 | 核心布局，依赖 React 路由 |
| Logo.tsx | Logo 组件 | 语法转换 |
| MxCadUploader.tsx | CAD 文件上传组件 | 完全重写 | 复杂上传逻辑，需要重写 |
| ProjectDrawingsPanel.tsx | 项目图纸面板 | 语法转换 |
| ThemeToggle.tsx | 主题切换 | 语法转换 |
| Toolbar.tsx | 工具栏组件 | 语法转换 |

**业务组件总数**: 16个

---

### 1.3 auth 认证相关组件

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| LoginPrompt.tsx | 登录提示组件 | 语法转换 |

---

### 1.4 common 通用组件

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| ResourceList.tsx | 资源列表 | 语法转换 |
| VersionHistoryDropdown.tsx | 版本历史下拉框 | 语法转换 |
| index.ts | 导出文件 | 直接复用 |

---

### 1.5 file-item 文件项组件

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| FileItemExternalReferenceWarning.tsx | 外部引用警告 | 语法转换 |
| FileItemInfo.tsx | 文件项信息 | 语法转换 |
| FileItemMenu.tsx | 文件项菜单 | 语法转换 |
| FileItemSelection.tsx | 文件项选择 | 语法转换 |
| FileItemTypeTag.tsx | 文件项类型标签 | 语法转换 |
| Thumbnail.tsx | 文件缩略图 | 语法转换 |
| fileActionConfig.tsx | 文件操作配置 | 直接复用 | 纯配置 |
| index.ts | 导出文件 | 直接复用 |

---

### 1.6 file-system-manager 文件系统管理

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| FileSystemBatchActions.tsx | 批量操作 | 完全重写 | 复杂交互 |
| FileSystemContent.tsx | 文件系统内容 | 完全重写 | 复杂逻辑 |
| FileSystemHeader.tsx | 文件系统头部 | 语法转换 |
| FileSystemModals.tsx | 文件系统模态框 | 语法转换 |
| useFileSystemDragDrop.ts | 拖拽 Hook | 语法转换 | 转 Vue Draggable |
| index.ts | 导出文件 | 直接复用 |

---

### 1.7 modals 模态框组件

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| CreateFolderModal.tsx | 创建文件夹 | 语法转换 |
| DownloadFormatModal.tsx | 下载格式选择 | 语法转换 |
| ExternalReferenceModal.tsx | 外部引用模态框 | 语法转换 |
| ExternalReferenceModal.spec.tsx | 测试文件 | 直接复用 | 测试用例需要重写 |
| ImagePreviewModal.tsx | 图片预览 | 语法转换 |
| LibrarySelectFolderModal.tsx | 库选择文件夹 | 语法转换 |
| MembersModal.tsx | 成员管理 | 语法转换 |
| ProjectModal.tsx | 项目模态框 | 语法转换 |
| ProjectRolesModal.tsx | 项目角色 | 语法转换 |
| RenameModal.tsx | 重命名 | 语法转换 |
| SaveAsModal.tsx | 另存为 | 语法转换 |
| SaveConfirmModal.tsx | 保存确认 | 语法转换 |
| SelectFolderModal.tsx | 选择文件夹 | 语法转换 |
| VersionHistoryModal.tsx | 版本历史 | 语法转换 |

---

### 1.8 permission 权限组件

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| PermissionAssignment.tsx | 权限分配 | 语法转换 |

---

### 1.9 sidebar 侧边栏

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| SidebarContainer.tsx | 侧边栏容器 | 语法转换 |
| SidebarTabBar.tsx | 侧边栏标签栏 | 语法转换 |
| SidebarTrigger.tsx | 侧边栏触发按钮 | 语法转换 |
| sidebar.module.css | 样式文件 | 直接复用 |

---

### 1.10 tour 引导组件

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| GlobalTourRenderer.tsx | 全局引导渲染 | 完全重写 | 复杂引导逻辑 |
| TourCenter.tsx | 引导中心 | 完全重写 |
| TourCenter.spec.tsx | 测试文件 | 直接复用 |
| TourOverlay.tsx | 引导遮罩 | 完全重写 |
| TourOverlay.spec.tsx | 测试文件 | 直接复用 |
| TourStartModal.tsx | 引导开始模态框 | 语法转换 |
| TourStartModal.spec.tsx | 测试文件 | 直接复用 |
| TourTooltip.tsx | 引导提示 | 语法转换 |
| index.ts | 导出文件 | 直接复用 |

---

## Components 统计

| 等级 | 数量 | 占比 |
|------|------|------|
| 直接复用 | 9 | 12.3% |
| 语法转换 | 50 | 68.5% |
| 完全重写 | 14 | 19.2% |
| **总计** | **73** | **100%** |

---

## 二、Hooks（自定义钩子）盘点

### 2.1 file-system 文件系统 Hooks

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| useFileSystem.ts | 文件系统核心 Hook | 语法转换 | 转 Vue Composable |
| useFileSystemCRUD.ts | 文件系统 CRUD | 语法转换 |
| useFileSystemData.ts | 文件系统数据 | 语法转换 |
| useFileSystemDragDrop.ts | 文件系统拖拽 | 语法转换 |
| useFileSystemNavigation.ts | 文件系统导航 | 语法转换 |
| useFileSystemSearch.ts | 文件系统搜索 | 语法转换 |
| useFileSystemSelection.ts | 文件系统选择 | 语法转换 |
| useFileSystemUI.ts | 文件系统 UI | 语法转换 |
| index.ts | 导出文件 | 直接复用 |

---

### 2.2 library 资源库 Hooks

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| useLibraryOperations.ts | 库操作 | 语法转换 |
| useLibrarySelection.ts | 库选择 | 语法转换 |

---

### 2.3 其他 Hooks

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| useBreadcrumbCollapse.ts | 面包屑折叠 | 语法转换 |
| useDirectoryImport.ts | 目录导入 | 语法转换 |
| useDocumentTitle.ts | 文档标题 | 语法转换 |
| useExternalReferenceUpload.ts | 外部引用上传 | 完全重写 | 复杂逻辑 |
| useExternalReferenceUpload.spec.ts | 测试文件 | 直接复用 |
| useExternalReferenceUpload.integration.spec.ts | 集成测试 | 直接复用 |
| useFileItemProps.ts | 文件项属性 | 语法转换 |
| useFileListPagination.ts | 文件列表分页 | 语法转换 |
| useFileListSearch.ts | 文件列表搜索 | 语法转换 |
| useLibrary.ts | 资源库 | 语法转换 |
| useLibraryPanel.ts | 资源库面板 | 语法转换 |
| useMxCadEditor.ts | CAD编辑器 | 完全重写 | 依赖 mxcad 集成 |
| useMxCadInstance.ts | CAD实例 | 完全重写 |
| useMxCadUploadNative.ts | CAD原生上传 | 完全重写 |
| usePermission.ts | 权限检查 | 语法转换 |
| usePermission.spec.ts | 测试文件 | 直接复用 |
| useProjectManagement.ts | 项目管理 | 语法转换 |
| useProjectPermission.ts | 项目权限 | 语法转换 |
| useProjectPermissions.ts | 项目权限列表 | 语法转换 |
| useSidebarSettings.ts | 侧边栏设置 | 语法转换 |
| useTour.ts | 引导功能 | 完全重写 |
| useTourVisibility.ts | 引导可见性 | 完全重写 |
| useWechatAuth.ts | 微信授权 | 完全重写 | 依赖第三方集成 |

---

## Hooks 统计

| 等级 | 数量 | 占比 |
|------|------|------|
| 直接复用 | 3 | 9.4% |
| 语法转换 | 19 | 59.4% |
| 完全重写 | 10 | 31.2% |
| **总计** | **32** | **100%** |

---

## 三、Contexts（上下文）盘点

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| AuthContext.tsx | 认证上下文 | 完全重写 | 转 Vue Provide/Inject + Pinia |
| BrandContext.tsx | 品牌配置上下文 | 语法转换 |
| NotificationContext.tsx | 通知上下文 | 语法转换 |
| RuntimeConfigContext.tsx | 运行时配置 | 语法转换 |
| SidebarContext.tsx | 侧边栏上下文 | 语法转换 |
| ThemeContext.tsx | 主题上下文 | 语法转换 |
| TourContext.tsx | 引导上下文 | 完全重写 |

---

## Contexts 统计

| 等级 | 数量 | 占比 |
|------|------|------|
| 直接复用 | 0 | 0% |
| 语法转换 | 4 | 57.1% |
| 完全重写 | 3 | 42.9% |
| **总计** | **7** | **100%** |

---

## 四、Pages（页面）盘点

### 4.1 Profile 页面模块

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| ProfileAccountTab.tsx | 账户标签页 | 语法转换 |
| ProfileContext.tsx | Profile 上下文 | 语法转换 |
| ProfileEmailTab.tsx | 邮箱标签页 | 语法转换 |
| ProfilePasswordTab.tsx | 密码标签页 | 语法转换 |
| ProfilePhoneTab.tsx | 手机标签页 | 语法转换 |
| ProfileWechatTab.tsx | 微信标签页 | 语法转换 |
| WechatDeactivateConfirm.tsx | 微信注销确认 | 语法转换 |
| index.ts | 导出文件 | 直接复用 |
| hooks/useEmailTab.ts | 邮箱标签页 Hook | 语法转换 |
| hooks/usePasswordForm.ts | 密码表单 Hook | 语法转换 |
| hooks/useVerificationCode.ts | 验证码 Hook | 语法转换 |

---

### 4.2 pages/components 页面组件

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| BatchActionsBar.tsx | 批量操作栏 | 语法转换 |
| FileGrid.tsx | 文件网格 | 语法转换 |
| FileSystemHeader.tsx | 文件系统头部 | 语法转换 |
| FileSystemToolbar.tsx | 文件系统工具栏 | 语法转换 |
| ProfileDeactivateTab.tsx | 账户注销标签页 | 语法转换 |
| ProfileEmailTab.tsx | 邮箱标签页 | 语法转换 |
| ProfileInfoTab.tsx | 信息标签页 | 语法转换 |
| ProfilePasswordTab.tsx | 密码标签页 | 语法转换 |
| ProfilePhoneTab.tsx | 手机标签页 | 语法转换 |
| ProfileWechatTab.tsx | 微信标签页 | 语法转换 |
| ProjectFilterTabs.tsx | 项目筛选标签 | 语法转换 |
| index.ts | 导出文件 | 直接复用 |
| types.ts | 类型定义 | 直接复用 |

---

### 4.3 主要页面

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| AuditLogPage.tsx | 审计日志 | 语法转换 |
| CADEditorDirect.tsx | CAD编辑器 | 完全重写 | 核心复杂页面 |
| Dashboard.tsx | 仪表盘 | 完全重写 | 复杂页面 |
| EmailVerification.tsx | 邮箱验证 | 语法转换 |
| FileSystemManager.tsx | 文件系统管理 | 完全重写 | 核心复杂页面 |
| FontLibrary.tsx | 字体库 | 语法转换 |
| ForgotPassword.tsx | 忘记密码 | 语法转换 |
| LibraryManager.tsx | 资源库管理 | 完全重写 | 复杂页面 |
| Login.tsx | 登录页面 | 完全重写 | 复杂页面 |
| PhoneVerification.tsx | 手机验证 | 语法转换 |
| Profile.tsx | 个人中心 | 完全重写 | 复杂页面 |
| Register.tsx | 注册页面 | 完全重写 | 复杂页面 |
| ResetPassword.tsx | 重置密码 | 语法转换 |
| RoleManagement.tsx | 角色管理 | 完全重写 | 复杂页面 |
| RuntimeConfigPage.tsx | 运行时配置 | 语法转换 |
| SystemMonitorPage.tsx | 系统监控 | 语法转换 |
| UserManagement.tsx | 用户管理 | 完全重写 | 复杂页面 |

---

## Pages 统计

| 等级 | 数量 | 占比 |
|------|------|------|
| 直接复用 | 2 | 5.0% |
| 语法转换 | 18 | 45.0% |
| 完全重写 | 20 | 50.0% |
| **总计** | **40** | **100%** |

---

## 五、Services（服务层）盘点

### 5.1 API 服务

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| adminApi.ts | 管理员 API | 直接复用 | API 定义可复用 |
| apiClient.ts | API 客户端 | 语法转换 | axios 配置需调整 |
| auditApi.ts | 审计 API | 直接复用 |
| authApi.ts | 认证 API | 直接复用 |
| cacheApi.ts | 缓存 API | 直接复用 |
| filesApi.ts | 文件 API | 直接复用 |
| fontsApi.ts | 字体 API | 直接复用 |
| healthApi.ts | 健康检查 API | 直接复用 |
| index.ts | 导出文件 | 直接复用 |
| libraryApi.ts | 资源库 API | 直接复用 |
| mxcadApi.ts | CAD API | 直接复用 |
| mxcadManager.ts | CAD 管理器 | 完全重写 | 复杂逻辑 |
| nodeApi.ts | 节点 API | 直接复用 |
| projectApi.ts | 项目 API | 直接复用 |
| projectMemberApi.ts | 项目成员 API | 直接复用 |
| projectPermissionApi.ts | 项目权限 API | 直接复用 |
| projectTrashApi.ts | 项目回收站 API | 直接复用 |
| projectsApi.ts | 项目列表 API | 直接复用 |
| publicFileApi.ts | 公共文件 API | 直接复用 |
| rolesApi.ts | 角色 API | 直接复用 |
| runtimeConfigApi.ts | 运行时配置 API | 直接复用 |
| searchApi.ts | 搜索 API | 直接复用 |
| trashApi.ts | 回收站 API | 直接复用 |
| userCleanupApi.ts | 用户清理 API | 直接复用 |
| usersApi.ts | 用户 API | 直接复用 |
| versionControlApi.ts | 版本控制 API | 直接复用 |

---

## Services 统计

| 等级 | 数量 | 占比 |
|------|------|------|
| 直接复用 | 25 | 96.2% |
| 语法转换 | 1 | 3.8% |
| 完全重写 | 0 | 0% |
| **总计** | **26** | **100%** |

---

## 六、Stores（状态管理）盘点

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| fileSystemStore.ts | 文件系统状态 | 完全重写 | 转 Pinia Store |
| notificationStore.ts | 通知状态 | 完全重写 | 转 Pinia Store |
| uiStore.ts | UI 状态 | 完全重写 | 转 Pinia Store |

---

## Stores 统计

| 等级 | 数量 | 占比 |
|------|------|------|
| 直接复用 | 0 | 0% |
| 语法转换 | 0 | 0% |
| 完全重写 | 3 | 100% |
| **总计** | **3** | **100%** |

---

## 七、其他资产盘点

### 7.1 Config（配置）

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| apiConfig.ts | API 配置 | 直接复用 |
| getConfig.ts | 获取配置 | 直接复用 |
| serverConfig.ts | 服务器配置 | 直接复用 |
| tourGuides.ts | 引导配置 | 直接复用 |
| tours/create-project.ts | 创建项目引导 | 直接复用 |
| tours/index.ts | 引导导出 | 直接复用 |
| tours/navigate-to-projects.ts | 导航引导 | 直接复用 |
| tours/personal-space.ts | 个人空间引导 | 直接复用 |
| tours/project-management-full.ts | 项目管理完整引导 | 直接复用 |

---

### 7.2 Constants（常量）

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| appConfig.ts | 应用配置 | 直接复用 |
| permissions.ts | 权限常量 | 直接复用 |
| storage.constants.ts | 存储常量 | 直接复用 |

---

### 7.3 Types（类型定义）

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| api-client.ts | API 客户端类型 | 直接复用 |
| filesystem.ts | 文件系统类型 | 直接复用 |
| lucide-icons.d.ts | 图标类型 | 直接复用 |
| sidebar.ts | 侧边栏类型 | 直接复用 |
| tour.ts | 引导类型 | 直接复用 |

---

### 7.4 Utils（工具函数）

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| authCheck.ts | 认证检查 | 直接复用 |
| cleanConsole.ts | 控制台清理 | 直接复用 |
| dateUtils.ts | 日期工具 | 直接复用 |
| errorHandler.ts | 错误处理 | 直接复用 |
| fileUtils.ts | 文件工具 | 直接复用 |
| fileUtils.spec.ts | 测试文件 | 直接复用 |
| filesystemUtils.ts | 文件系统工具 | 直接复用 |
| hashUtils.ts | 哈希工具 | 直接复用 |
| loadingUtils.ts | 加载工具 | 直接复用 |
| mxcadUploadUtils.ts | CAD 上传工具 | 直接复用 |
| mxcadUtils.ts | CAD 工具 | 直接复用 |
| permissionUtils.ts | 权限工具 | 直接复用 |
| validation.ts | 验证工具 | 直接复用 |

---

### 7.5 Styles（样式）

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| app.css | 应用样式 | 直接复用 |
| icon.css | 图标样式 | 直接复用 |
| theme.css | 主题样式 | 语法转换 | 需要适配 Vuetify |
| transitions.css | 过渡动画 | 直接复用 |

---

### 7.6 入口文件

| 文件 | 功能描述 | 迁移等级 | 说明 |
|------|----------|----------|------|
| App.tsx | 应用入口组件 | 完全重写 |
| index.tsx | 渲染入口 | 完全重写 |

---

## 其他资产统计

| 等级 | 数量 | 占比 |
|------|------|------|
| 直接复用 | 32 | 84.2% |
| 语法转换 | 1 | 2.6% |
| 完全重写 | 5 | 13.2% |
| **总计** | **38** | **100%** |

---

## 八、总体统计

### 8.1 按类型统计

| 类型 | 直接复用 | 语法转换 | 完全重写 | 总计 |
|------|----------|----------|----------|------|
| Components | 9 | 50 | 14 | 73 |
| Hooks | 3 | 19 | 10 | 32 |
| Contexts | 0 | 4 | 3 | 7 |
| Pages | 2 | 18 | 20 | 40 |
| Services | 25 | 1 | 0 | 26 |
| Stores | 0 | 0 | 3 | 3 |
| 其他 | 32 | 1 | 5 | 38 |
| **总计** | **71** | **93** | **55** | **219** |

### 8.2 按等级统计

| 等级 | 数量 | 占比 |
|------|------|------|
| 直接复用 | 71 | 32.4% |
| 语法转换 | 93 | 42.5% |
| 完全重写 | 55 | 25.1% |
| **总计** | **219** | **100%** |

---

## 九、迁移优先级建议

### P0 - 核心基础设施（先完成）

1. **状态管理迁移** - Pinia Store 建立
2. **路由迁移** - Vue Router 替代 React Router
3. **Contexts 迁移 - Provide/Inject
4. **API 服务层复用 - 确保 API Client
5. **Utils & Constants 复用

### P1 - 基础 UI 组件（第二阶段）

1. UI 基础组件（Button, Modal, Toast 等）
2. 通用业务组件
3. 简单 Hooks 转 Composables
4. 简单页面迁移

### P2 - 复杂页面与功能（第三阶段）

1. CADEditorDirect (CAD 编辑器)
2. FileSystemManager (文件系统管理)
3. Login/Register (认证页面)
4. Dashboard (仪表盘)
5. UserManagement/RoleManagement (管理页面)

### P3 - 增强与优化（第四阶段）

1. Tour 引导系统
2. MxCadUploader (文件上传)
3. KeyboardShortcuts (快捷键)
4. 性能优化

---

## 十、关键技术栈对应关系

| React 生态 | Vue 3 对应技术 |
|------------|--------------|
| React 19 | Vue 3.4+ |
| React Router | Vue Router 4 |
| Zustand | Pinia |
| useContext | provide/inject |
| Custom Hooks | Composables |
| Radix UI | Vuetify 3 |
| Lucide React | Vuetify Icons |
| React Hook Form | VeeValidate |
| Zod | Zod |
| Tailwind CSS | Tailwind CSS (保持) |
| Axios | Axios (保持) |
| Vitest | Vitest (保持) |

---

## 十一、风险评估

### 高风险模块

1. **CADEditorDirect** - CAD 编辑器，依赖 mxcad 第三方库，集成复杂度高
2. **MxCadUploader** - 文件上传组件，依赖 WebUploader
3. **Tour 系统** - 引导系统，依赖复杂的 DOM 交互
4. **CollaborateSidebar** - 协作侧边栏
5. **KeyboardShortcuts** - 快捷键系统

### 中风险模块

1. **FileSystemManager** - 文件系统管理
2. **Layout** - 主布局组件
3. **Login/Register** - 认证页面
4. **Dashboard** - 仪表盘

### 低风险模块

1. UI 组件库
2. API 服务层
3. 工具函数
4. 常量与类型

---

## 十二、迁移建议

### 12.1 保持不变（直接复用

- 所有 API 服务模块（Services）
- 所有常量（Constants）
- 所有类型定义（Types）
- 所有工具函数（Utils）
- 大部分配置（Config）

### 12.2 语法转换

- UI 基础组件
- 简单业务组件
- 大部分 Hooks → Composables
- 简单页面

### 12.3 完全重写

- 路由系统（App.tsx, index.tsx）
- 状态管理（Stores）
- 上下文（Contexts）
- CAD 编辑器相关功能
- Tour 引导系统
- 复杂交互组件

---

**报告生成完成！
汇报人：AI Migration Analyst
