# 前端 React 迁移依赖图报告

**报告时间**: 2026-05-03
**分析范围**: `d:\project\cloudcad\apps\frontend\src`

---

## 一、文件分类概览

| 类型 | 数量 |
|------|------|
| Pages (页面) | 16 |
| Components (组件) | 约 45 |
| Hooks | 约 30 |
| Contexts | 7 |
| Services | 约 15 |
| Stores | 3 |
| Utils | 约 20 |

---

## 二、详细依赖图

### 2.1 Pages (页面组件)

#### Login.tsx
- **路径**: `pages/Login.tsx`
- **类型**: page
- **被引用**: App.tsx (路由), RequireAuth.tsx
- **API调用**: authApi.login(), authApi.sendSmsCode()
- **Context/Store依赖**: AuthContext
- **mxcad-app通信**: 无
- **迁移优先级**: P0
- **迁移复杂度**: 低
- **备注**: 登录逻辑完整

#### Register.tsx
- **路径**: `pages/Register.tsx`
- **类型**: page
- **被引用**: App.tsx (路由)
- **API调用**: authApi.register(), authApi.sendSmsCode()
- **Context/Store依赖**: AuthContext
- **mxcad-app通信**: 无
- **迁移优先级**: P0
- **迁移复杂度**: 低
- **备注**: 注册表单完整

#### Dashboard.tsx
- **路径**: `pages/Dashboard.tsx`
- **类型**: page
- **被引用**: App.tsx (路由)
- **API调用**: projectApi.getRecentProjects(), filesApi.getRecentFiles()
- **Context/Store依赖**: AuthContext
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 中
- **备注**: 包含项目列表和快捷操作

#### FileSystemManager.tsx
- **路径**: `pages/FileSystemManager.tsx`
- **类型**: page
- **被引用**: App.tsx (路由)
- **API调用**: nodeApi.getNodes(), nodeApi.createNode(), nodeApi.deleteNode()
- **Context/Store依赖**: AuthContext, SidebarContext
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 中
- **备注**: 文件浏览核心页面

#### CADEditorDirect.tsx
- **路径**: `pages/CADEditorDirect.tsx`
- **类型**: page
- **被引用**: App.tsx (路由)
- **API调用**: nodeApi.getFileInfo(), versionApi.getHistory()
- **Context/Store依赖**: ThemeContext, AuthContext
- **mxcad-app通信**: 直接使用 mxcadManager
- **迁移优先级**: P2 (已有Vue版本)
- **迁移复杂度**: 高
- **备注**: CAD编辑器主页面，复杂业务逻辑

#### UserManagement.tsx
- **路径**: `pages/UserManagement.tsx`
- **类型**: page
- **被引用**: App.tsx (路由)
- **API调用**: usersApi.getUsers(), usersApi.createUser(), usersApi.updateUser()
- **Context/Store依赖**: AuthContext
- **mxcad-app通信**: 无
- **迁移优先级**: P2
- **迁移复杂度**: 中
- **备注**: 用户管理CRUD

#### RoleManagement.tsx
- **路径**: `pages/RoleManagement.tsx`
- **类型**: page
- **被引用**: App.tsx (路由)
- **API调用**: rolesApi.getRoles(), rolesApi.createRole(), rolesApi.assignPermissions()
- **Context/Store依赖**: AuthContext
- **mxcad-app通信**: 无
- **迁移优先级**: P2
- **迁移复杂度**: 中
- **备注**: 角色管理CRUD

#### LibraryManager.tsx
- **路径**: `pages/LibraryManager.tsx`
- **类型**: page
- **被引用**: App.tsx (路由)
- **API调用**: libraryApi.getAssets(), libraryApi.uploadAsset()
- **Context/Store依赖**: AuthContext
- **mxcad-app通信**: 无
- **迁移优先级**: P2
- **迁移复杂度**: 中
- **备注**: 资源库管理

#### AuditLogPage.tsx
- **路径**: `pages/AuditLogPage.tsx`
- **类型**: page
- **被引用**: App.tsx (路由)
- **API调用**: auditApi.getLogs()
- **Context/Store依赖**: AuthContext
- **mxcad-app通信**: 无
- **迁移优先级**: P2
- **迁移复杂度**: 低
- **备注**: 审计日志查询

#### Profile.tsx
- **路径**: `pages/Profile.tsx`
- **类型**: page
- **被引用**: App.tsx (路由)
- **API调用**: usersApi.updateProfile(), usersApi.changePassword()
- **Context/Store依赖**: AuthContext
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 中
- **备注**: 用户资料页面，包含多个Tab表单

#### ResetPassword.tsx
- **路径**: `pages/ResetPassword.tsx`
- **类型**: page
- **被引用**: App.tsx (路由)
- **API调用**: authApi.resetPassword()
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P0
- **迁移复杂度**: 低
- **备注**: 密码重置

#### ForgotPassword.tsx
- **路径**: `pages/ForgotPassword.tsx`
- **类型**: page
- **被引用**: App.tsx (路由)
- **API调用**: authApi.forgotPassword()
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P0
- **迁移复杂度**: 低
- **备注**: 忘记密码

---

### 2.2 Components (组件)

#### MxCadUploader.tsx
- **路径**: `components/MxCadUploader.tsx`
- **类型**: component
- **被引用**: CADEditorDirect.tsx, FileSystemManager.tsx
- **API调用**: 无直接调用，通过 mxcadManager
- **Context/Store依赖**: 无
- **mxcad-app通信**: 直接使用 mxcadManager
- **迁移优先级**: P1
- **迁移复杂度**: 高
- **备注**: 核心上传组件，依赖 mxcadManager

#### MxCadUppyUploader.tsx
- **路径**: `components/MxCadUppyUploader.tsx`
- **类型**: component
- **被引用**: MxCadUploader.tsx
- **API调用**: 无直接调用
- **Context/Store依赖**: 无
- **mxcad-app通信**: 通过 mxcadManager
- **迁移优先级**: P1
- **迁移复杂度**: 高
- **备注**: 基于 Uppy 的上传组件

#### Modal.tsx
- **路径**: `components/ui/Modal.tsx`
- **类型**: component
- **被引用**: 多个页面
- **API调用**: 无
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P0 (可用 v-dialog 替代)
- **迁移复杂度**: 低
- **备注**: 基础弹窗组件，Vuetify 可替代

#### ResourceList.tsx
- **路径**: `components/common/ResourceList.tsx`
- **类型**: component
- **被引用**: LibraryManager.tsx
- **API调用**: libraryApi.getAssets()
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P2
- **迁移复杂度**: 中
- **备注**: 资源列表组件

#### FileSystemModals.tsx
- **路径**: `components/file-system-manager/FileSystemModals.tsx`
- **类型**: component
- **被引用**: FileSystemManager.tsx
- **API调用**: nodeApi.createNode(), nodeApi.moveNode(), nodeApi.copyNode()
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 中
- **备注**: 文件系统操作弹窗集合

#### MembersModal.tsx
- **路径**: `components/modals/MembersModal.tsx`
- **类型**: component
- **被引用**: FileSystemManager.tsx, ProjectModal.tsx
- **API调用**: projectApi.getMembers(), projectApi.addMember()
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 中
- **备注**: 成员管理弹窗

#### ProjectModal.tsx
- **路径**: `components/modals/ProjectModal.tsx`
- **类型**: component
- **被引用**: FileSystemManager.tsx, Dashboard.tsx
- **API调用**: projectApi.createProject(), projectApi.updateProject()
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 中
- **备注**: 项目创建/编辑弹窗

#### SaveAsModal.tsx
- **路径**: `components/modals/SaveAsModal.tsx`
- **类型**: component
- **被引用**: CADEditorDirect.tsx
- **API调用**: nodeApi.saveAs()
- **Context/Store依赖**: 无
- **mxcad-app通信**: 通过 mxcadManager
- **迁移优先级**: P1
- **迁移复杂度**: 中
- **备注**: 另存为弹窗

---

### 2.3 Contexts (上下文)

#### AuthContext.tsx
- **路径**: `contexts/AuthContext.tsx`
- **类型**: context
- **被引用**: 多个页面和组件
- **API调用**: authApi.login(), authApi.refresh(), authApi.logout()
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P0 (核心上下文)
- **迁移复杂度**: 高
- **备注**: 认证状态管理，token 存储

#### ThemeContext.tsx
- **路径**: `contexts/ThemeContext.tsx`
- **类型**: context
- **被引用**: CADEditorDirect.tsx, App.tsx
- **API调用**: 无
- **Context/Store依赖**: 无 (但与 mxcadManager 同步主题)
- **mxcad-app通信**: 直接调用 mxcadManager.setTheme()
- **迁移优先级**: P0
- **迁移复杂度**: 高
- **备注**: 主题管理，与 CAD 编辑器同步

#### SidebarContext.tsx
- **路径**: `contexts/SidebarContext.tsx`
- **类型**: context
- **被引用**: 多个页面
- **API调用**: 无
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 中
- **备注**: 侧边栏状态管理

#### TourContext.tsx
- **路径**: `contexts/TourContext.tsx`
- **类型**: context
- **被引用**: CADEditorDirect.tsx
- **API调用**: 无
- **Context/Store依赖**: AuthContext
- **mxcad-app通信**: 无
- **迁移优先级**: P2
- **迁移复杂度**: 中
- **备注**: 新手引导

#### NotificationContext.tsx
- **路径**: `contexts/NotificationContext.tsx`
- **类型**: context
- **被引用**: 多个页面和组件
- **API调用**: 无
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P1 (可用 vuetify snackbar 替代)
- **迁移复杂度**: 中
- **备注**: 全局通知，Vuetify 可替代

#### RuntimeConfigContext.tsx
- **路径**: `contexts/RuntimeConfigContext.tsx`
- **类型**: context
- **被引用**: App.tsx
- **API调用**: configApi.getConfig()
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 低
- **备注**: 运行时配置

#### BrandContext.tsx
- **路径**: `contexts/BrandContext.tsx`
- **类型**: context
- **被引用**: App.tsx
- **API调用**: configApi.getBrand()
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P2
- **迁移复杂度**: 低
- **备注**: 品牌配置

---

### 2.4 Hooks

#### useMxCadInstance.ts
- **路径**: `hooks/useMxCadInstance.ts`
- **类型**: hook
- **被引用**: CADEditorDirect.tsx, MxCadUploader.tsx
- **API调用**: 无
- **Context/Store依赖**: 无
- **mxcad-app通信**: 直接调用 mxcadManager
- **迁移优先级**: P0
- **迁移复杂度**: 高
- **备注**: CAD 实例管理

#### useMxCadEditor.ts
- **路径**: `hooks/useMxCadEditor.ts`
- **类型**: hook
- **被引用**: CADEditorDirect.tsx
- **API调用**: nodeApi.getFileInfo()
- **Context/Store依赖**: 无
- **mxcad-app通信**: 通过 useMxCadInstance
- **迁移优先级**: P0
- **迁移复杂度**: 高
- **备注**: CAD 文件编辑

#### useMxCadUploadNative.ts
- **路径**: `hooks/useMxCadUploadNative.ts`
- **类型**: hook
- **被引用**: MxCadUploader.tsx
- **API调用**: 无 (直接调用 mxcadManager)
- **Context/Store依赖**: 无
- **mxcad-app通信**: 直接调用 mxcadManager
- **迁移优先级**: P1
- **迁移复杂度**: 高
- **备注**: 本地上传

#### useUppyUpload.ts
- **路径**: `hooks/useUppyUpload.ts`
- **类型**: hook
- **被引用**: MxCadUppyUploader.tsx
- **API调用**: 无
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 中
- **备注**: Uppy 上传封装

#### useExternalReferenceUpload.ts
- **路径**: `hooks/useExternalReferenceUpload.ts`
- **类型**: hook
- **被引用**: MxCadUploader.tsx
- **API调用**: 无
- **Context/Store依赖**: 无
- **mxcad-app通信**: 通过 mxcadManager
- **迁移优先级**: P2
- **迁移复杂度**: 高
- **备注**: 外部参照上传

#### usePermission.ts
- **路径**: `hooks/usePermission.ts`
- **类型**: hook
- **被引用**: 多个需要权限检查的组件
- **API调用**: 无 (前端权限检查)
- **Context/Store依赖**: AuthContext
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 低
- **备注**: 前端权限检查

#### useProjectPermissions.ts
- **路径**: `hooks/useProjectPermissions.ts`
- **类型**: hook
- **被引用**: FileSystemManager.tsx, CADEditorDirect.tsx
- **API调用**: projectApi.checkPermission()
- **Context/Store依赖**: AuthContext
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 中
- **备注**: 项目权限检查

#### useFileSystem.ts
- **路径**: `hooks/file-system/useFileSystem.ts`
- **类型**: hook
- **被引用**: FileSystemManager.tsx
- **API调用**: nodeApi.getNodes()
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 中
- **备注**: 文件系统操作封装

#### useFileSystemData.ts
- **路径**: `hooks/file-system/useFileSystemData.ts`
- **类型**: hook
- **被引用**: FileSystemManager.tsx, useFileSystem.ts
- **API调用**: nodeApi.getNode(), nodeApi.getChildren()
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 中
- **备注**: 文件系统数据获取

---

### 2.5 Services (API 服务)

#### apiClient.ts
- **路径**: `services/apiClient.ts`
- **类型**: service
- **被引用**: 所有其他 services
- **API调用**: 无 (HTTP 客户端封装)
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P0 (基础设施)
- **迁移复杂度**: 低
- **备注**: Axios 封装，统一拦截器

#### authApi.ts
- **路径**: `services/authApi.ts`
- **类型**: service
- **被引用**: AuthContext.tsx, Login.tsx, Register.tsx
- **API调用**: 后端 /auth/* 端点
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P0
- **迁移复杂度**: 低
- **备注**: 认证 API

#### usersApi.ts
- **路径**: `services/usersApi.ts`
- **类型**: service
- **被引用**: UserManagement.tsx, Profile.tsx
- **API调用**: 后端 /users/* 端点
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P0
- **迁移复杂度**: 低
- **备注**: 用户管理 API

#### nodeApi.ts
- **路径**: `services/nodeApi.ts`
- **类型**: service
- **被引用**: FileSystemManager.tsx, useFileSystem.ts
- **API调用**: 后端 /nodes/* 端点
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P0
- **迁移复杂度**: 低
- **备注**: 文件节点 API

#### mxcadManager.ts
- **路径**: `services/mxcadManager.ts`
- **类型**: service
- **被引用**: 多个组件和 hooks
- **API调用**: 无 (CAD 核心管理)
- **Context/Store依赖**: 无
- **mxcad-app通信**: 核心服务
- **迁移优先级**: P0
- **迁移复杂度**: 高
- **备注**: MxCAD 核心管理器，直接操作 CAD 实例

#### filesApi.ts
- **路径**: `services/filesApi.ts`
- **类型**: service
- **被引用**: Dashboard.tsx, FileSystemManager.tsx
- **API调用**: 后端 /files/* 端点
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 低
- **备注**: 文件操作 API

#### projectApi.ts
- **路径**: `services/projectApi.ts`
- **类型**: service
- **被引用**: Dashboard.tsx, FileSystemManager.tsx, ProjectModal.tsx
- **API调用**: 后端 /projects/* 端点
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 低
- **备注**: 项目管理 API

#### rolesApi.ts
- **路径**: `services/rolesApi.ts`
- **类型**: service
- **被引用**: RoleManagement.tsx
- **API调用**: 后端 /roles/* 端点
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P2
- **迁移复杂度**: 低
- **备注**: 角色管理 API

#### libraryApi.ts
- **路径**: `services/libraryApi.ts`
- **类型**: service
- **被引用**: LibraryManager.tsx, ResourceList.tsx
- **API调用**: 后端 /library/* 端点
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P2
- **迁移复杂度**: 低
- **备注**: 资源库 API

#### auditApi.ts
- **路径**: `services/auditApi.ts`
- **类型**: service
- **被引用**: AuditLogPage.tsx
- **API调用**: 后端 /audit/* 端点
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P2
- **迁移复杂度**: 低
- **备注**: 审计日志 API

#### versionApi.ts
- **路径**: `services/versionApi.ts`
- **类型**: service
- **被引用**: CADEditorDirect.tsx
- **API调用**: 后端 /version/* 端点
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 低
- **备注**: 版本控制 API

#### configApi.ts
- **路径**: `services/configApi.ts`
- **类型**: service
- **被引用**: RuntimeConfigContext.tsx, BrandContext.tsx
- **API调用**: 后端 /config/* 端点
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 低
- **备注**: 配置 API

---

### 2.6 Stores (Zustand)

#### fileSystemStore.ts
- **路径**: `stores/fileSystemStore.ts`
- **类型**: store
- **被引用**: FileSystemManager.tsx, useFileSystem.ts
- **API调用**: 无
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P1
- **迁移复杂度**: 中
- **备注**: 文件系统状态

#### uiStore.ts
- **路径**: `stores/uiStore.ts`
- **类型**: store
- **被引用**: 多个组件
- **API调用**: 无
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P1 (可用 Vuetify 替代部分功能)
- **迁移复杂度**: 中
- **备注**: UI 状态（主题、侧边栏、弹窗）

#### notificationStore.ts
- **路径**: `stores/notificationStore.ts`
- **类型**: store
- **被引用**: NotificationContext.tsx
- **API调用**: 无
- **Context/Store依赖**: 无
- **mxcad-app通信**: 无
- **迁移优先级**: P2 (可用 Vuetify 替代)
- **迁移复杂度**: 低
- **备注**: 通知状态，可用 Vuetify Snackbar 替代

---

## 三、迁移优先级排序

### P0 - 立即迁移 (核心基础设施)

| 文件 | 复杂度 | 依赖说明 |
|------|--------|----------|
| apiClient.ts | 低 | 无依赖，其他服务的基础 |
| authApi.ts | 低 | 依赖 apiClient |
| AuthContext.tsx | 高 | 依赖 authApi，涉及 token 管理 |
| Login.tsx | 低 | 依赖 AuthContext |
| Register.tsx | 低 | 依赖 AuthContext |
| ResetPassword.tsx | 低 | 无依赖 |
| ForgotPassword.tsx | 低 | 无依赖 |

### P1 - 尽快迁移 (核心业务)

| 文件 | 复杂度 | 依赖说明 |
|------|--------|----------|
| ThemeContext.tsx | 高 | 与 CAD 同步 |
| useMxCadInstance.ts | 高 | 核心 CAD hook |
| useMxCadEditor.ts | 高 | 依赖 useMxCadInstance |
| mxcadManager.ts | 高 | 核心服务，直接操作 CAD |
| nodeApi.ts | 低 | 依赖 apiClient |
| usersApi.ts | 低 | 依赖 apiClient |
| Profile.tsx | 中 | 依赖多个 API |
| FileSystemManager.tsx | 中 | 依赖多个 hooks 和 API |
| useFileSystem.ts | 中 | 依赖 nodeApi |
| useFileSystemData.ts | 中 | 依赖 nodeApi |
| projectApi.ts | 低 | 依赖 apiClient |

### P2 - 稍后迁移 (扩展功能)

| 文件 | 复杂度 | 依赖说明 |
|------|--------|----------|
| Dashboard.tsx | 中 | 依赖多个 API |
| LibraryManager.tsx | 中 | 依赖 libraryApi |
| UserManagement.tsx | 中 | 依赖 usersApi |
| RoleManagement.tsx | 中 | 依赖 rolesApi |
| AuditLogPage.tsx | 低 | 依赖 auditApi |
| CADEditorDirect.tsx | 高 | 依赖多个 hooks 和服务 |
| MxCadUploader.tsx | 高 | 依赖 mxcadManager |
| MxCadUppyUploader.tsx | 高 | 依赖 Uppy |

---

## 四、迁移依赖图 (关键路径)

```
apiClient.ts
    ↓
authApi.ts ← AuthContext.tsx ← Login.tsx, Register.tsx
    ↓                              ↓
usersApi.ts                   Profile.tsx
    ↓                              ↓
nodeApi.ts ← useFileSystem.ts ← FileSystemManager.tsx
    ↓           ↓                       ↓
projectApi.ts  useFileSystemData.ts     MxCadUploader.tsx
                                            ↓
                                    useMxCadInstance.ts
                                            ↓
                                    useMxCadEditor.ts
                                            ↓
                                    CADEditorDirect.tsx

mxcadManager.ts (独立依赖链)
    ↓
ThemeContext.tsx
    ↓
CADEditorDirect.tsx
```

---

## 五、mxcad-app 通信方式分析

### 直接使用 mxcadManager 的文件

| 文件 | 通信方式 |
|------|----------|
| mxcadManager.ts | 核心服务 |
| useMxCadInstance.ts | 调用 mxcadManager 方法 |
| useMxCadEditor.ts | 通过 useMxCadInstance |
| ThemeContext.tsx | 调用 mxcadManager.setTheme() |
| MxCadUploader.tsx | 调用 mxcadManager.upload() |
| MxCadUppyUploader.tsx | 调用 mxcadManager |
| CADEditorDirect.tsx | 直接使用 |

### 迁移策略

所有 mxcad-app 通信应统一通过 `useCadEvents` Composable，不应直接调用 `window.dispatchEvent`。

---

**报告人**: Trea
