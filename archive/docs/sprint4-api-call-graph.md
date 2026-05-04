# 冲刺四 API 调用关系图

> **项目名称:** CloudCAD 在线 CAD 协同平台  
> **报告时间:** 2026-05-03  
> **分支:** refactor/circular-deps

---

## 概述

本文档梳理了 CloudCAD 前后端 API 调用关系，涵盖 Composable → Service → Controller 的完整调用链路。

---

## 整体架构图

```
┌───────────────────────────────────────────────────────────┐
│                     Vue 3 前端应用                         │
│  ┌──────────────────┐  ┌──────────────────────────────┐  │
│  │   Pages 页面     │  │    Components 组件           │  │
│  │  LoginPage       │  │  CadUploader, UploadManager  │  │
│  │  RegisterPage    │  │                            │  │
│  │  DashboardPage   │  └──────────────────────────────┘  │
│  │  CadEditorPage   │          │                         │
│  └──────────────────┘          │                         │
│          │                     │                         │
│          ▼                     ▼                         │
│  ┌──────────────────────────────────────────┐             │
│  │          Composables 业务逻辑层           │             │
│  │  useAuth          useLogin               │             │
│  │  useRegister      useDashboard          │             │
│  │  useCadEngine     useUpload              │             │
│  │  useCadEvents     useProjectManagement   │             │
│  │  useUppyUpload    useFileSystemCRUD      │             │
│  │                                        │             │
│  └──────────────────────────────────────────┘             │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────┐             │
│  │         Services API 服务层               │             │
│  │  authApi          projectsApi            │             │
│  │  usersApi         mxcadApi               │             │
│  │  publicFileApi    rolesApi               │             │
│  │  filesApi         auditApi               │             │
│  │                                        │             │
│  └──────────────────────────────────────────┘             │
└───────────────────────────────────────────────────────────┘
                          │ HTTP
                          ▼
┌───────────────────────────────────────────────────────────┐
│                    NestJS 后端服务                         │
│  ┌──────────────────────────────────────────┐             │
│  │       Controllers API 控制器层            │             │
│  │  AuthController    FileSystemController  │             │
│  │  MxcadController   UsersController       │             │
│  │  RolesController   AuditController      │             │
│  │  HealthController  PublicFileController  │             │
│  │                                        │             │
│  └──────────────────────────────────────────┘             │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────┐             │
│  │          Services 业务服务层              │             │
│  │  AuthFacadeService  FileSystemService    │             │
│  │  MxcadService      UsersService         │             │
│  │                                        │             │
│  └──────────────────────────────────────────┘             │
└───────────────────────────────────────────────────────────┘
```

---

## 认证模块 API 调用链

### Composables → Services

| Composable 函数 | 调用 Service | API 端点 | 说明 |
|-------------------|--------------|---------|------|
| useAuth.login() | authApi.login() | POST /v1/auth/login | 用户名/邮箱 + 密码登录 |
| useAuth.loginByPhone() | authApi.loginByPhone() | POST /v1/auth/login/phone | 手机验证码登录 |
| useAuth.loginWithWechat() | authApi.getWechatAuthUrl() | GET /v1/auth/wechat/auth-url | 获取微信授权 URL |
| useAuth.register() | authApi.register() | POST /v1/auth/register | 用户注册 |
| useAuth.verifyEmailAndLogin() | authApi.verifyEmailAndLogin() | POST /v1/auth/verify-email | 验证邮箱并登录 |
| useAuth.verifyPhoneAndLogin() | authApi.verifyPhoneAndLogin() | POST /v1/auth/verify-phone | 验证手机并登录 |
| useAuth.logout() | authApi.logout() | POST /v1/auth/logout | 登出 |
| useAuth.getProfile() | authApi.getProfile() | GET /v1/auth/profile | 获取用户信息 |
| useLogin.handleSendCode() | authApi.sendSmsCode() | POST /v1/auth/send-sms-code | 发送短信验证码 |

### 调用链图

```
LoginPage.vue
    ├─ useLogin.handleAccountSubmit()
    │   └─ useAuth.login(account, password)
    │       └─ authApi.login()
    │           └─ POST /v1/auth/login → AuthController.login()
    │
    ├─ useLogin.handlePhoneSubmit()
    │   └─ useAuth.loginByPhone(phone, code)
    │       └─ authApi.loginByPhone()
    │           └─ POST /v1/auth/login/phone → AuthController.loginByPhone()
    │
    └─ useLogin.handleWechatLogin()
        └─ useAuth.loginWithWechat()
            └─ authApi.getWechatAuthUrl()
                └─ GET /v1/auth/wechat/auth-url → AuthController.getWechatAuthUrl()

RegisterPage.vue
    └─ useRegister.handleSubmit()
        └─ useAuth.register(data)
            └─ authApi.register()
                └─ POST /v1/auth/register → AuthController.register()
```

### 后端 Controller

| Controller 方法 | HTTP 方法 | 路由 | Service |
|---------------|----------|-----|---------|
| AuthController.login() | POST | /v1/auth/login | AuthFacadeService.login() |
| AuthController.loginByPhone() | POST | /v1/auth/login/phone | AuthFacadeService.loginByPhone() |
| AuthController.register() | POST | /v1/auth/register | AuthFacadeService.register() |
| AuthController.verifyEmail() | POST | /v1/auth/verify-email | AuthFacadeService.verifyEmail() |
| AuthController.verifyPhone() | POST | /v1/auth/verify-phone | AuthFacadeService.verifyPhone() |
| AuthController.logout() | POST | /v1/auth/logout | AuthFacadeService.logout() |
| AuthController.getProfile() | GET | /v1/auth/profile | AuthFacadeService.getProfile() |

---

## 仪表盘模块 API 调用链

### Composables → Services

| Composable 函数 | 调用 Service | API 端点 | 说明 |
|-------------------|--------------|---------|------|
| useDashboard.loadData() | projectsApi.list() | GET /v1/projects | 获取项目列表 |
| useDashboard.loadData() | usersApi.getDashboardStats() | GET /v1/users/dashboard-stats | 获取仪表盘统计 |
| useDashboard.loadData() | projectsApi.getPersonalSpace() | GET /v1/projects/personal-space | 获取个人空间 |
| useDashboard.loadData() | projectsApi.getChildren() | GET /v1/projects/:parentId/children | 获取子节点 |
| useDashboard.handleCreateProject() | projectsApi.create() | POST /v1/projects | 创建项目 |

### 调用链图

```
DashboardPage.vue
    └─ useDashboard.loadData()
        ├─ projectsApi.list()
        │   └─ GET /v1/projects → FileSystemController.listProjects()
        │
        ├─ usersApi.getDashboardStats()
        │   └─ GET /v1/users/dashboard-stats → UsersController.getDashboardStats()
        │
        ├─ projectsApi.getPersonalSpace()
        │   └─ GET /v1/projects/personal-space → FileSystemController.getPersonalSpace()
        │
        └─ projectsApi.getChildren(parentId, params)
            └─ GET /v1/projects/:parentId/children → FileSystemController.getChildren()

    └─ useDashboard.handleCreateProject()
        └─ projectsApi.create(data)
            └─ POST /v1/projects → FileSystemController.createProject()
```

### 后端 Controller

| Controller 方法 | HTTP 方法 | 路由 | Service |
|---------------|----------|-----|---------|
| FileSystemController.listProjects() | GET | /v1/projects | FileSystemService.listProjects() |
| FileSystemController.getPersonalSpace() | GET | /v1/projects/personal-space | FileSystemService.getPersonalSpace() |
| FileSystemController.getChildren() | GET | /v1/projects/:parentId/children | FileTreeService.getChildren() |
| FileSystemController.createProject() | POST | /v1/projects | ProjectCrudService.createProject() |
| UsersController.getDashboardStats() | GET | /v1/users/dashboard-stats | UsersService.getDashboardStats() |

---

## CAD 编辑器模块 API 调用链

### Composables → Services

| Composable 函数 | 调用 Service | API 端点 | 说明 |
|-------------------|--------------|---------|------|
| useCadEngine.waitForFileReady() | mxcadApi.waitForFileReady() | GET /v1/mxcad/status/:nodeId | 轮询文件就绪状态 |
| useCadEngine.downloadFile() | mxcadApi.downloadFile() | GET /v1/mxcad/download/:nodeId | 下载文件 |
| useCadEngine.openFile() | mxcadApi.checkFileExist() | POST /v1/mxcad/check-file | 检查文件存在 |
| useCadEngine.saveFile() | mxcadApi.saveMxwebFile() | POST /v1/mxcad/save/:nodeId | 保存 mxweb 文件 |
| useCadEngine.saveAs() | mxcadApi.saveMxwebAs() | POST /v1/mxcad/save-as | 另存为 |

### 调用链图

```
CadEditorPage.vue
    ├─ useCadEngine.initialize()
    │   └─ (mxcad 初始化，无 API 调用)
    │
    ├─ useCadEngine.openFile(fileUrl)
    │   ├─ mxcadApi.checkFileExist(params)
    │   │   └─ POST /v1/mxcad/check-file → MxcadController.checkFileExist()
    │   └─ (mxcad 打开文件，直接访问 fileUrl)
    │
    ├─ useCadEngine.saveFile(blob, nodeId)
    │   └─ mxcadApi.saveMxwebFile(blob, nodeId)
    │       └─ POST /v1/mxcad/save/:nodeId → MxcadController.saveMxwebFile()
    │
    ├─ useCadEngine.waitForFileReady(nodeId)
    │   └─ mxcadApi.waitForFileReady(nodeId, maxAttempts, interval)
    │       └─ GET /v1/mxcad/status/:nodeId → MxcadController.checkFileUploadStatus()
    │
    ├─ useCadEngine.downloadFile(nodeId, fileName, format)
    │   └─ mxcadApi.downloadFile(nodeId, format)
    │       └─ GET /v1/mxcad/download/:nodeId → MxcadController.downloadFile()
    │
    └─ useCadEngine.saveAs()
        └─ mxcadApi.saveMxwebAs(blob, targetType, targetParentId, ...)
            └─ POST /v1/mxcad/save-as → MxcadController.saveMxwebAs()
```

### 后端 Controller

| Controller 方法 | HTTP 方法 | 路由 | Service |
|---------------|----------|-----|---------|
| MxcadController.checkFileExist() | POST | /v1/mxcad/check-file | MxcadService.checkFileExist() |
| MxcadController.checkFileUploadStatus() | GET | /v1/mxcad/status/:nodeId | MxcadService.checkFileUploadStatus() |
| MxcadController.saveMxwebFile() | POST | /v1/mxcad/save/:nodeId | MxcadService.saveMxwebFile() |
| MxcadController.saveMxwebAs() | POST | /v1/mxcad/save-as | MxcadService.saveMxwebAs() |
| MxcadController.downloadFile() | GET | /v1/mxcad/download/:nodeId | FileDownloadHandlerService.downloadNode() |
| MxcadController.uploadChunk() | POST | /v1/mxcad/upload-chunk | ChunkUploadService.uploadChunk() |

---

## 上传模块 API 调用链

### Composables → Services

| Composable 函数 | 调用 Service | API 端点 | 说明 |
|-------------------|--------------|---------|------|
| useUpload.uploadAuthenticated() | useUppyUpload.selectFiles() | (使用 Tus 协议，通过 mxcadApi 上传) | 已登录用户上传 |
| useUpload.uploadPublic() | publicFileApi.uploadFile() | POST /v1/public-file/upload | 未登录用户上传 |
| useUpload.uploadPublic() | publicFileApi.getFileAccessUrl() | GET /v1/public-file/access/:hash | 获取文件访问 URL |
| useUppyUpload.selectFiles() | mxcadApi.checkChunkExist() | POST /v1/mxcad/check-chunk | 检查分块存在 |
| useUppyUpload.selectFiles() | mxcadApi.uploadChunk() | POST /v1/mxcad/upload-chunk | 上传分块 |

### 调用链图

```
CadUploader.vue / UploadManager.vue
    └─ useUpload.uploadAuthenticated(file, callbacks)
        └─ useUppyUpload.selectFiles(options)
            ├─ mxcadApi.checkFileExist(params)
            │   └─ POST /v1/mxcad/check-file → MxcadController.checkFileExist()
            ├─ mxcadApi.checkChunkExist(params)
            │   └─ POST /v1/mxcad/check-chunk → MxcadController.checkChunkExist()
            ├─ mxcadApi.uploadChunk(formData)
            │   └─ POST /v1/mxcad/upload-chunk → MxcadController.uploadChunk()
            └─ (分块合并由后端 Tus 服务处理)

    └─ useUpload.uploadPublic(file, callbacks)
        ├─ publicFileApi.uploadFile(file, chunkSize, onProgress)
        │   └─ POST /v1/public-file/upload → PublicFileController.uploadFile()
        └─ publicFileApi.getFileAccessUrl(hash)
            └─ GET /v1/public-file/access/:hash → PublicFileController.getFileAccessUrl()
```

### 后端 Controller

| Controller 方法 | HTTP 方法 | 路由 | Service |
|---------------|----------|-----|---------|
| PublicFileController.uploadFile() | POST | /v1/public-file/upload | PublicFileService.uploadFile() |
| PublicFileController.getFileAccessUrl() | GET | /v1/public-file/access/:hash | PublicFileService.getFileAccessUrl() |
| MxcadController.checkChunkExist() | POST | /v1/mxcad/check-chunk | ChunkUploadService.checkChunkExist() |
| MxcadController.uploadChunk() | POST | /v1/mxcad/upload-chunk | ChunkUploadService.uploadChunk() |

---

## 文件系统模块 API 调用链

### Composables → Services

| Composable 函数 | 调用 Service | API 端点 | 说明 |
|-------------------|--------------|---------|------|
| useProjectManagement.createProject() | projectsApi.create() | POST /v1/projects | 创建项目 |
| useFileSystemCRUD.createFolder() | projectsApi.createFolder() | POST /v1/projects/:parentId/folder | 创建文件夹 |
| useFileSystemCRUD.updateNode() | projectsApi.updateNode() | POST /v1/projects/nodes/:nodeId | 更新节点 |
| useFileSystemCRUD.deleteNode() | projectsApi.deleteNode() | DELETE /v1/projects/nodes/:nodeId | 删除节点 |
| useFileSystemCRUD.restoreNode() | projectsApi.restoreNode() | POST /v1/projects/nodes/:nodeId/restore | 恢复节点 |
| useFileSystemCRUD.moveNode() | projectsApi.moveNode() | POST /v1/projects/nodes/:nodeId/move | 移动节点 |
| useFileSystemCRUD.copyNode() | projectsApi.copyNode() | POST /v1/projects/nodes/:nodeId/copy | 复制节点 |

### 调用链图

```
ProjectsPage.vue / PersonalSpacePage.vue
    ├─ useProjectManagement.createProject()
    │   └─ projectsApi.create(data)
    │       └─ POST /v1/projects → FileSystemController.createProject()
    │
    ├─ useFileSystemCRUD.createFolder(parentId, data)
    │   └─ projectsApi.createFolder(parentId, data)
    │       └─ POST /v1/projects/:parentId/folder → FileSystemController.createFolder()
    │
    ├─ useFileSystemCRUD.updateNode(nodeId, data)
    │   └─ projectsApi.updateNode(nodeId, data)
    │       └─ POST /v1/projects/nodes/:nodeId → FileSystemController.updateNode()
    │
    ├─ useFileSystemCRUD.deleteNode(nodeId, permanently)
    │   └─ projectsApi.deleteNode(nodeId, permanently)
    │       └─ DELETE /v1/projects/nodes/:nodeId → FileSystemController.deleteNode()
    │
    ├─ useFileSystemCRUD.restoreNode(nodeId)
    │   └─ projectsApi.restoreNode(nodeId)
    │       └─ POST /v1/projects/nodes/:nodeId/restore → FileSystemController.restoreNode()
    │
    ├─ useFileSystemCRUD.moveNode(nodeId, targetParentId)
    │   └─ projectsApi.moveNode(nodeId, targetParentId)
    │       └─ POST /v1/projects/nodes/:nodeId/move → FileSystemController.moveNode()
    │
    └─ useFileSystemCRUD.copyNode(nodeId, targetParentId)
        └─ projectsApi.copyNode(nodeId, targetParentId)
            └─ POST /v1/projects/nodes/:nodeId/copy → FileSystemController.copyNode()
```

### 后端 Controller

| Controller 方法 | HTTP 方法 | 路由 | Service |
|---------------|----------|-----|---------|
| FileSystemController.createProject() | POST | /v1/projects | ProjectCrudService.createProject() |
| FileSystemController.createFolder() | POST | /v1/projects/:parentId/folder | FileSystemService.createFolder() |
| FileSystemController.updateNode() | POST | /v1/projects/nodes/:nodeId | FileSystemService.updateNode() |
| FileSystemController.deleteNode() | DELETE | /v1/projects/nodes/:nodeId | FileOperationsService.deleteNode() |
| FileSystemController.restoreNode() | POST | /v1/projects/nodes/:nodeId/restore | FileOperationsService.restoreNode() |
| FileSystemController.moveNode() | POST | /v1/projects/nodes/:nodeId/move | FileOperationsService.moveNode() |
| FileSystemController.copyNode() | POST | /v1/projects/nodes/:nodeId/copy | FileOperationsService.copyNode() |

---

## Composables 完整清单

| Composable 文件 | 主要功能 | 调用的 Services |
|---------------|---------|--------------|
| useAuth.ts | 认证逻辑（登录、注册、登出） | authApi |
| useLogin.ts | 登录页面业务逻辑 | authApi, useAuth |
| useRegister.ts | 注册页面业务逻辑 | authApi, useAuth |
| useDashboard.ts | 仪表盘页面业务逻辑 | projectsApi, usersApi |
| useCadEngine.ts | CAD 引擎核心逻辑 | mxcadApi |
| useCadEngineInit.ts | CAD 引擎初始化 | mxcadApi |
| useCadFileOperations.ts | CAD 文件操作 | mxcadApi |
| useCadFileStorage.ts | CAD 文件存储 | mxcadApi |
| useCadViewState.ts | CAD 视图状态管理 | (无 API) |
| useCadEvents.ts | CAD 事件通信 | (无 API) |
| useCadCommands.ts | CAD 命令处理 | (无 API) |
| useUpload.ts | 上传流程控制 | mxcadApi, publicFileApi |
| useUppyUpload.ts | Uppy 上传组件集成 | mxcadApi |
| useProjectManagement.ts | 项目管理逻辑 | projectsApi |
| useFileSystemCRUD.ts | 文件系统 CRUD | projectsApi, filesApi |
| useFileSystemNavigation.ts | 文件系统导航 | projectsApi |
| useFileSystemData.ts | 文件系统数据加载 | projectsApi |
| useFileSystemSelection.ts | 文件选择管理 | (无 API) |
| useProgress.ts | 进度条管理 | (无 API) |
| useTheme.ts | 主题状态管理 | (无 API) |
| useI18n.ts | 国际化逻辑 | (无 API) |
| useDocumentTitle.ts | 文档标题管理 | (无 API) |
| useRuntimeConfig.ts | 运行时配置 | runtimeConfigApi |
| useBrandConfig.ts | 品牌配置 | (无 API) |

---

## Services 完整清单

| Service 文件 | 主要功能 | 对应后端 Controller |
|------------|---------|-------------------|
| authApi.ts | 认证相关 API | AuthController |
| projectsApi.ts | 项目和文件系统 API | FileSystemController |
| usersApi.ts | 用户管理 API | UsersController |
| mxcadApi.ts | CAD 相关 API | MxcadController |
| filesApi.ts | 文件操作 API | FileSystemController |
| publicFileApi.ts | 公开文件 API | PublicFileController |
| rolesApi.ts | 角色权限 API | RolesController |
| auditApi.ts | 审计日志 API | AuditController |
| fontsApi.ts | 字体库 API | FontsController |
| healthApi.ts | 健康检查 API | HealthController |
| adminApi.ts | 管理员 API | AdminController |
| userCleanupApi.ts | 用户清理 API | UserCleanupController |
| runtimeConfigApi.ts | 运行时配置 API | RuntimeConfigController |
| trashApi.ts | 回收站 API | FileSystemController |
| libraryApi.ts | 资源库 API | LibraryController |

---

## Controllers 完整清单

| Controller 文件 | 主要功能 | 路由前缀 |
|---------------|---------|---------|
| AuthController | 认证相关 | /v1/auth |
| FileSystemController | 文件系统、项目管理 | /v1/projects, /v1/nodes |
| MxcadController | CAD 文件上传、转换、下载 | /v1/mxcad |
| UsersController | 用户管理 | /v1/users |
| RolesController | 角色权限管理 | /v1/roles |
| AuditController | 审计日志 | /v1/audit |
| LibraryController | 资源库 | /v1/library |
| FontsController | 字体库 | /v1/fonts |
| PublicFileController | 公开文件 | /v1/public-file |
| HealthController | 健康检查 | /v1/health |
| AdminController | 管理员功能 | /v1/admin |
| RuntimeConfigController | 运行时配置 | /v1/runtime-config |
| VersionControlController | 版本控制 | /v1/version-control |

---

## 关键 API 端点汇总

### 认证模块

| HTTP 方法 | 路由 | 功能 |
|---------|-----|------|
| POST | /v1/auth/login | 用户登录 |
| POST | /v1/auth/login/phone | 手机验证码登录 |
| POST | /v1/auth/register | 用户注册 |
| POST | /v1/auth/verify-email | 验证邮箱并登录 |
| POST | /v1/auth/verify-phone | 验证手机并登录 |
| POST | /v1/auth/logout | 登出 |
| GET | /v1/auth/profile | 获取当前用户信息 |

### 项目和文件系统

| HTTP 方法 | 路由 | 功能 |
|---------|-----|------|
| GET | /v1/projects | 获取项目列表 |
| POST | /v1/projects | 创建项目 |
| GET | /v1/projects/personal-space | 获取个人空间 |
| GET | /v1/projects/:parentId/children | 获取子节点 |
| POST | /v1/projects/:parentId/folder | 创建文件夹 |
| GET | /v1/projects/nodes/:nodeId | 获取节点详情 |
| POST | /v1/projects/nodes/:nodeId | 更新节点 |
| DELETE | /v1/projects/nodes/:nodeId | 删除节点 |
| POST | /v1/projects/nodes/:nodeId/restore | 恢复节点 |
| POST | /v1/projects/nodes/:nodeId/move | 移动节点 |
| POST | /v1/projects/nodes/:nodeId/copy | 复制节点 |

### CAD 相关

| HTTP 方法 | 路由 | 功能 |
|---------|-----|------|
| POST | /v1/mxcad/check-file | 检查文件是否存在 |
| POST | /v1/mxcad/check-chunk | 检查分块是否存在 |
| POST | /v1/mxcad/upload-chunk | 上传文件分块 |
| GET | /v1/mxcad/status/:nodeId | 检查文件上传状态 |
| GET | /v1/mxcad/preloading/:nodeId | 获取预加载数据 |
| POST | /v1/mxcad/save/:nodeId | 保存 mxweb 文件 |
| POST | /v1/mxcad/save-as | 另存为新文件 |
| GET | /v1/mxcad/download/:nodeId | 下载文件 |
| GET | /v1/mxcad/thumbnail/:nodeId/check | 检查缩略图 |

### 用户管理

| HTTP 方法 | 路由 | 功能 |
|---------|-----|------|
| GET | /v1/users/dashboard-stats | 获取仪表盘统计数据 |
| GET | /v1/users/profile | 获取当前用户信息 |
| POST | /v1/users/profile | 更新用户信息 |
| POST | /v1/users/change-password | 修改密码 |

---

## 总结

本文档梳理了冲刺四完成的 Vue 3 前端与 NestJS 后端之间的完整 API 调用关系，涵盖：

1. **认证模块**：登录、注册、登出等流程
2. **仪表盘模块**：项目列表、统计数据等
3. **CAD 编辑器模块**：文件打开、保存、下载等
4. **上传模块**：已登录和未登录用户的上传流程
5. **文件系统模块**：项目、文件、文件夹的 CRUD 操作

所有 API 调用遵循统一的规范：Composables 负责业务逻辑，Services 负责 API 封装，Controllers 负责后端路由处理。

---

**报告生成时间:** 2026-05-03
