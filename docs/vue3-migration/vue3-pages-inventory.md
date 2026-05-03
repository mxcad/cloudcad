# CloudCAD 前端页面组件清单

> 生成时间: 2026-05-02
> 目录: `apps/frontend/src/pages/`

## 概述

本文档记录了 CloudCAD 前端应用中的所有页面组件，提供了代码行数统计、依赖的 React Hooks 以及使用的 API 服务等信息。

## 页面组件列表（按代码行数降序排列）

| 排名 | 页面组件 | 文件名 | 代码行数 | 主要功能 |
|------|----------|--------|----------|----------|
| 1 | Register | [Register.tsx](file:///d:/project/cloudcad/apps/frontend/src/pages/Register.tsx) | ~1647 | 用户注册页面，支持多种注册方式 |
| 2 | RoleManagement | [RoleManagement.tsx](file:///d:/project/cloudcad/apps/frontend/src/pages/RoleManagement.tsx) | ~1369 | 系统角色和项目角色管理 |
| 3 | Profile | [Profile.tsx](file:///d:/project/cloudcad/apps/frontend/src/pages/Profile.tsx) | ~1296 | 用户个人资料管理 |
| 4 | FileSystemManager | [FileSystemManager.tsx](file:///d:/project/cloudcad/apps/frontend/src/pages/FileSystemManager.tsx) | ~1258 | 文件系统管理，文件和项目管理 |
| 5 | SystemMonitorPage | [SystemMonitorPage.tsx](file:///d:/project/cloudcad/apps/frontend/src/pages/SystemMonitorPage.tsx) | ~1185 | 系统监控和存储清理 |
| 6 | LibraryManager | [LibraryManager.tsx](file:///d:/project/cloudcad/apps/frontend/src/pages/LibraryManager.tsx) | ~1193 | 公共资源库管理 |
| 7 | RuntimeConfigPage | [RuntimeConfigPage.tsx](file:///d:/project/cloudcad/apps/frontend/src/pages/RuntimeConfigPage.tsx) | ~1120 | 运行时配置管理 |
| 8 | Dashboard | [Dashboard.tsx](file:///d:/project/cloudcad/apps/frontend/src/pages/Dashboard.tsx) | ~1100+ | 用户仪表盘 |
| 9 | UserManagement | [UserManagement.tsx](file:///d:/project/cloudcad/apps/frontend/src/pages/UserManagement.tsx) | ~1000+ | 用户管理 |
| 10 | Login | [Login.tsx](file:///d:/project/cloudcad/apps/frontend/src/pages/Login.tsx) | ~900+ | 用户登录页面 |
| 11 | AuditLogPage | [AuditLogPage.tsx](file:///d:/project/cloudcad/apps/frontend/src/pages/AuditLogPage.tsx) | ~539 | 审计日志查看 |

---

## 详细页面分析

### 1. Register (注册页面)

**文件路径**: `apps/frontend/src/pages/Register.tsx`
**代码行数**: ~1647 行

**功能描述**:
用户注册页面，支持多种注册方式（账号注册、手机号注册、微信注册），具有分步表单设计、实时验证、玻璃态效果和动态背景等特性。

**依赖的 React Hooks**:
- `useState` - 管理表单状态
- `useEffect` - 副作用处理（权限检查、倒计时、URL参数解析）
- `useCallback` - 回调函数优化
- `useRef` - 引用 DOM 元素（倒计时定时器）
- `useNavigate` - 路由导航
- `useLocation` - 获取位置信息

**依赖的自定义 Hooks**:
- `useAuth` - 认证上下文
- `useRuntimeConfig` - 运行时配置上下文
- `useBrandConfig` - 品牌配置上下文
- `useTheme` - 主题上下文

**依赖的 API 服务**:
- `authApi` - 认证相关 API
  - `checkField()` - 检查字段唯一性
  - `sendSmsCode()` - 发送短信验证码
  - `registerByPhone()` - 手机号注册
  - `register()` - 账号注册

---

### 2. RoleManagement (角色管理页面)

**文件路径**: `apps/frontend/src/pages/RoleManagement.tsx`
**代码行数**: ~1369 行

**功能描述**:
角色与权限管理页面，支持系统角色和项目角色的创建、编辑、删除和权限配置。采用卡片式布局和精美动画效果。

**依赖的 React Hooks**:
- `useState` - 管理角色列表、模态框状态
- `useEffect` - 初始化加载
- `useCallback` - 回调函数优化

**依赖的自定义 Hooks**:
- `usePermission` - 权限检查
- `useDocumentTitle` - 文档标题设置
- `useTheme` - 主题上下文

**依赖的 API 服务**:
- `rolesApi` - 系统角色 API
  - `list()` - 获取角色列表
  - `create()` - 创建角色
  - `update()` - 更新角色
  - `delete()` - 删除角色
- `projectRolesApi` - 项目角色 API
  - `getSystemRoles()` - 获取系统项目角色
  - `create()` - 创建项目角色
  - `update()` - 更新项目角色
  - `delete()` - 删除项目角色
- `authApi` - 获取当前用户信息

---

### 3. Profile (个人资料页面)

**文件路径**: `apps/frontend/src/pages/Profile.tsx`
**代码行数**: ~1296 行

**功能描述**:
用户个人资料管理页面，支持个人信息查看、密码修改、邮箱绑定、手机绑定、微信绑定和账户注销等功能。采用 Tab 式布局。

**依赖的 React Hooks**:
- `useState` - 管理表单状态和各种 Tab 状态
- `useEffect` - 初始化、倒计时、URL 哈希处理
- `useCallback` - 回调函数优化
- `useRef` - 引用 DOM 元素
- `useLayoutEffect` - 布局相关副作用
- `useNavigate` - 路由导航

**依赖的自定义 Hooks**:
- `useAuth` - 认证上下文
- `useRuntimeConfig` - 运行时配置上下文
- `useWechatAuth` - 微信授权
- `usePermission` - 权限检查
- `useNotification` - 通知上下文
- `useDocumentTitle` - 文档标题设置
- `useTheme` - 主题上下文

**依赖的 API 服务**:
- `usersApi` - 用户 API
  - `changePassword()` - 修改密码
  - `deactivateAccount()` - 注销账户
- `authApi` - 认证 API
  - `bindWechat()` - 绑定微信
  - `unbindWechat()` - 解绑微信
  - `bindPhone()` - 绑定手机
  - `sendSmsCode()` - 发送短信验证码
  - `sendBindEmailCode()` - 发送邮箱绑定验证码
  - `verifyBindEmail()` - 验证邮箱绑定
  - `rebindEmail()` - 换绑邮箱
  - `sendUnbindEmailCode()` - 发送换绑邮箱验证码
  - `verifyUnbindEmailCode()` - 验证换绑邮箱
  - `sendUnbindPhoneCode()` - 发送换绑手机验证码
  - `verifyUnbindPhoneCode()` - 验证换绑手机
  - `rebindPhone()` - 换绑手机
  - `resendVerification()` - 重新发送验证邮件

---

### 4. FileSystemManager (文件系统管理器)

**文件路径**: `apps/frontend/src/pages/FileSystemManager.tsx`
**代码行数**: ~1258 行

**功能描述**:
核心文件管理系统，支持文件和文件夹的浏览、上传、下载、重命名、删除、移动、复制等操作，以及版本历史查看。

**依赖的 React Hooks**:
- `useState` - 管理文件系统状态
- `useCallback` - 回调函数优化
- `useEffect` - 副作用处理
- `useRef` - 引用 DOM 元素（上传组件、面包屑容器）
- `useNavigate` - 路由导航
- `useParams` - 获取路由参数
- `useLocation` - 获取位置信息
- `useSearchParams` - 获取查询参数

**依赖的自定义 Hooks**:
- `useFileSystem` - 文件系统核心操作
- `useProjectManagement` - 项目管理
- `usePermission` - 权限检查
- `useProjectPermissions` - 项目权限检查
- `useFileItemProps` - 文件项权限属性
- `useAuth` - 认证上下文
- `useFileSystemStore` - 文件系统状态存储
- `useDocumentTitle` - 文档标题设置

**依赖的 API 服务**:
- `projectsApi` - 项目 API
  - 多项目管理接口
- `versionControlApi` - 版本控制 API
  - 版本历史查看

---

### 5. SystemMonitorPage (系统监控页面)

**文件路径**: `apps/frontend/src/pages/SystemMonitorPage.tsx`
**代码行数**: ~1185 行

**功能描述**:
系统监控页面，实时显示数据库、存储服务、应用服务的健康状态，支持存储清理功能。

**依赖的 React Hooks**:
- `useState` - 管理监控数据和 UI 状态
- `useEffect` - 自动刷新逻辑
- `useCallback` - 回调函数优化

**依赖的自定义 Hooks**:
- `usePermission` - 权限检查（需要 SYSTEM_MONITOR 权限）
- `useDocumentTitle` - 文档标题设置
- `useTheme` - 主题上下文

**依赖的 API 服务**:
- `healthApi` - 健康检查 API
  - `getHealth()` - 获取系统健康状态
- `adminApi` - 管理员 API
  - `getCleanupStats()` - 获取清理统计
  - `cleanupStorage()` - 执行存储清理

---

### 6. LibraryManager (公共资源库管理页面)

**文件路径**: `apps/frontend/src/pages/LibraryManager.tsx`
**代码行数**: ~1193 行

**功能描述**:
公共资源库管理页面，支持图纸库和图块库的浏览、上传、下载和管理。具有库类型切换、存储配额配置等功能。

**依赖的 React Hooks**:
- `useState` - 管理库节点、分页、模态框状态
- `useCallback` - 回调函数优化
- `useEffect` - 副作用处理
- `useRef` - 引用上传组件
- `useNavigate` - 路由导航
- `useParams` - 获取路由参数

**依赖的自定义 Hooks**:
- `useLibrary` - 资源库核心操作
- `useLibraryOperations` - 资源库操作
- `usePermission` - 权限检查
- `useNotification` - 通知上下文
- `useFileSystemStore` - 文件系统状态存储
- `useDocumentTitle` - 文档标题设置

**依赖的 API 服务**:
- `libraryApi` - 资源库 API
  - `deleteDrawingNode()` - 删除图纸节点
  - `deleteBlockNode()` - 删除图块节点
- `projectsApi` - 项目 API
  - `getQuota()` - 获取配额信息
  - `updateStorageQuota()` - 更新存储配额
- `runtimeConfigApi` - 运行时配置 API
  - `getPublicConfigs()` - 获取公共配置

---

### 7. RuntimeConfigPage (运行时配置页面)

**文件路径**: `apps/frontend/src/pages/RuntimeConfigPage.tsx`
**代码行数**: ~1120 行

**功能描述**:
运行时配置管理页面，以卡片分组形式展示和编辑系统运行参数，支持敏感信息保护和实时保存。

**依赖的 React Hooks**:
- `useState` - 管理配置项和 UI 状态
- `useEffect` - 加载配置数据
- `useCallback` - 回调函数优化

**依赖的自定义 Hooks**:
- `usePermission` - 权限检查（需要 SYSTEM_CONFIG_WRITE 权限）
- `useNotification` - 通知上下文
- `useDocumentTitle` - 文档标题设置
- `useTheme` - 主题上下文

**依赖的 API 服务**:
- `runtimeConfigApi` - 运行时配置 API
  - `getAllConfigs()` - 获取所有配置
  - `updateConfig()` - 更新配置
  - `resetConfig()` - 重置配置

---

### 8. Dashboard (仪表盘页面)

**文件路径**: `apps/frontend/src/pages/Dashboard.tsx`
**代码行数**: ~1100+ 行

**功能描述**:
用户仪表盘，显示项目列表、统计数据、个人空间文件，提供快捷操作入口。

**依赖的 React Hooks**:
- `useState` - 管理项目、文件、统计数据
- `useEffect` - 加载仪表盘数据
- `useMemo` - 计算结果缓存
- `useCallback` - 回调函数优化
- `useSearchParams` - 获取查询参数
- `useNavigate` - 路由导航

**依赖的自定义 Hooks**:
- `useAuth` - 认证上下文
- `useTheme` - 主题上下文
- `useBrandConfig` - 品牌配置上下文
- `useDocumentTitle` - 文档标题设置

**依赖的 API 服务**:
- `projectsApi` - 项目 API
  - `list()` - 获取项目列表
  - `getPersonalSpace()` - 获取个人空间
  - `getChildren()` - 获取子节点
- `usersApi` - 用户 API
  - `getDashboardStats()` - 获取仪表盘统计

---

### 9. UserManagement (用户管理页面)

**文件路径**: `apps/frontend/src/pages/UserManagement.tsx`
**代码行数**: ~1000+ 行

**功能描述**:
用户管理页面，支持用户的增删改查、角色分配、存储配额管理、账户清理等功能。

**依赖的 React Hooks**:
- `useState` - 管理用户列表、筛选、分页、模态框状态
- `useEffect` - 加载用户数据
- `useCallback` - 回调函数优化

**依赖的自定义 Hooks**:
- `usePermission` - 权限检查
- `useTheme` - 主题上下文
- `useDocumentTitle` - 文档标题设置

**依赖的 API 服务**:
- `usersApi` - 用户 API
  - 用户CRUD操作
- `rolesApi` - 角色 API
  - 角色列表
- `runtimeConfigApi` - 运行时配置 API
  - 获取邮件/短信启用状态
- `projectsApi` - 项目 API
  - 存储配额相关
- `userCleanupApi` - 用户清理 API
  - 清理统计

---

### 10. Login (登录页面)

**文件路径**: `apps/frontend/src/pages/Login.tsx`
**代码行数**: ~900+ 行

**功能描述**:
用户登录页面，支持账号登录、手机号登录、微信登录等多种登录方式，具有精美的 UI 设计和动画效果。

**依赖的 React Hooks**:
- `useState` - 管理表单状态、Tab 切换
- `useEffect` - 认证状态监听
- `useCallback` - 回调函数优化
- `useRef` - 引用 DOM 元素
- `useNavigate` - 路由导航
- `useLocation` - 获取位置信息

**依赖的自定义 Hooks**:
- `useAuth` - 认证上下文
- `useTheme` - 主题上下文
- `useBrandConfig` - 品牌配置上下文
- `useRuntimeConfig` - 运行时配置上下文
- `useDocumentTitle` - 文档标题设置

**依赖的 API 服务**:
- `authApi` - 认证 API
  - `login()` - 账号登录
  - `loginByPhone()` - 手机登录
  - `loginWithWechat()` - 微信登录

---

### 11. AuditLogPage (审计日志页面)

**文件路径**: `apps/frontend/src/pages/AuditLogPage.tsx`
**代码行数**: ~539 行

**功能描述**:
审计日志查看页面，显示系统操作日志，支持按用户、操作类型、资源类型、时间等条件筛选。

**依赖的 React Hooks**:
- `useState` - 管理日志列表、筛选条件、分页
- `useEffect` - 加载日志数据
- `useCallback` - 回调函数优化

**依赖的自定义 Hooks**:
- `usePermission` - 权限检查（需要 SYSTEM_ADMIN 权限）
- `useDocumentTitle` - 文档标题设置

**依赖的 API 服务**:
- `auditApi` - 审计日志 API
  - `getLogs()` - 获取日志列表
  - `getStatistics()` - 获取统计信息

---

## 总结

### 页面组件统计

| 指标 | 数值 |
|------|------|
| 页面组件总数 | 11 个 |
| 代码行数范围 | 539 - 1647 行 |
| 总代码行数（估计） | ~12,000+ 行 |

### 最复杂的页面组件

1. **Register** (1647 行) - 多种注册方式、分步表单、微信集成
2. **RoleManagement** (1369 行) - 角色管理、权限配置
3. **Profile** (1296 行) - 多功能 Tab 页面

### 最轻量的页面组件

1. **AuditLogPage** (539 行) - 相对简单的日志列表展示

### API 服务使用频率

| API 服务 | 使用页面数 |
|----------|-----------|
| authApi | 5 (Login, Register, Profile, RoleManagement, Dashboard) |
| usersApi | 3 (UserManagement, Profile, Dashboard) |
| rolesApi | 2 (UserManagement, RoleManagement) |
| projectsApi | 3 (FileSystemManager, LibraryManager, Dashboard) |
| runtimeConfigApi | 3 (Login, LibraryManager, RuntimeConfigPage) |
| auditApi | 1 (AuditLogPage) |
| healthApi | 1 (SystemMonitorPage) |
| adminApi | 1 (SystemMonitorPage) |
