
# 前端 API 调用点扫描报告

## 概述

本报告扫描了 `apps/frontend/src/services/` 目录下的所有 API 文件，分析了每个 API 方法的调用位置，并检查了前后端 API 路径版本化的一致性。

---

## 一、API 文件清单及方法列表

### 1.1 authApi.ts - 认证服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `login` | 邮箱密码登录 | `AuthController_login` |
| `register` | 用户注册 | `AuthController_register` |
| `refreshToken` | 刷新访问令牌 | `AuthController_refreshToken` |
| `logout` | 退出登录 | `AuthController_logout` |
| `getProfile` | 获取用户信息 | `AuthController_getProfile` |
| `resendVerification` | 重发验证邮件 | `AuthController_resendVerification` |
| `forgotPassword` | 忘记密码 | `AuthController_forgotPassword` |
| `resetPassword` | 重置密码 | `AuthController_resetPassword` |
| `sendBindEmailCode` | 发送绑定邮箱验证码 | `AuthController_sendBindEmailCode` |
| `verifyBindEmail` | 验证绑定邮箱 | `AuthController_verifyBindEmail` |
| `sendUnbindEmailCode` | 发送解绑邮箱验证码 | `AuthController_sendUnbindEmailCode` |
| `verifyUnbindEmailCode` | 验证解绑邮箱验证码 | `AuthController_verifyUnbindEmailCode` |
| `rebindEmail` | 换绑新邮箱 | `AuthController_rebindEmail` |
| `sendSmsCode` | 发送短信验证码 | `AuthController_sendSmsCode` |
| `verifySmsCode` | 验证短信验证码 | `AuthController_verifySmsCode` |
| `loginByPhone` | 手机号验证码登录 | `AuthController_loginByPhone` |
| `registerByPhone` | 手机号注册 | `AuthController_registerByPhone` |
| `verifyPhone` | 验证手机号 | `AuthController_verifyPhone` |
| `bindEmailAndLogin` | 绑定邮箱并登录 | `AuthController_bindEmailAndLogin` |
| `bindPhoneAndLogin` | 绑定手机号并登录 | `AuthController_bindPhoneAndLogin` |
| `bindPhone` | 绑定手机号 | `AuthController_bindPhone` |
| `sendUnbindPhoneCode` | 发送解绑手机号验证码 | `AuthController_sendUnbindPhoneCode` |
| `verifyUnbindPhoneCode` | 验证解绑手机号验证码 | `AuthController_verifyUnbindPhoneCode` |
| `rebindPhone` | 换绑新手机号 | `AuthController_rebindPhone` |
| `checkField` | 检查字段唯一性 | `AuthController_checkFieldUniqueness` |
| `verifyEmailAndRegisterPhone` | 验证邮箱并完成手机号注册 | `AuthController_verifyEmailAndRegisterPhone` |
| `getWechatAuthUrl` | 获取微信授权URL | `AuthController_getWechatAuthUrl` |
| `wechatCallback` | 微信登录回调 | `AuthController_wechatCallback` |
| `bindWechat` | 绑定微信 | `AuthController_bindWechat` |
| `unbindWechat` | 解绑微信 | `AuthController_unbindWechat` |

### 1.2 projectApi.ts - 项目操作服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `list` | 获取项目列表 | `FileSystemController_getProjects` |
| `getDeleted` | 获取已删除项目 | `FileSystemController_getDeletedProjects` |
| `create` | 创建项目 | `FileSystemController_createProject` |
| `get` | 获取项目详情 | `FileSystemController_getProject` |
| `update` | 更新项目 | `FileSystemController_updateProject` |
| `delete` | 删除项目 | `FileSystemController_deleteProject` |
| `restore` | 恢复项目 | `FileSystemController_restoreTrashItems` |
| `getStorageInfo` | 获取存储信息 | `FileSystemController_getStorageQuota` |
| `getQuota` | 获取配额 | `FileSystemController_getStorageQuota` |
| `updateStorageQuota` | 更新存储配额 | `FileSystemController_updateStorageQuota` |
| `getPersonalSpace` | 获取私人空间 | `FileSystemController_getPersonalSpace` |
| `getUserPersonalSpace` | 获取指定用户私人空间 | `FileSystemController_getUserPersonalSpace` |

### 1.3 nodeApi.ts - 节点操作服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `createFolder` | 创建文件夹 | `FileSystemController_createFolder` |
| `getNode` | 获取节点详情 | `FileSystemController_getNode` |
| `getChildren` | 获取子节点列表 | `FileSystemController_getChildren` |
| `updateNode` | 更新节点 | `FileSystemController_updateNode` |
| `renameNode` | 重命名节点 | `FileSystemController_updateNode` |
| `deleteNode` | 删除节点 | `FileSystemController_deleteNode` |
| `moveNode` | 移动节点 | `FileSystemController_moveNode` |
| `copyNode` | 复制节点 | `FileSystemController_copyNode` |

### 1.4 usersApi.ts - 用户管理服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `list` | 获取用户列表 | `UsersController_findAll` |
| `search` | 搜索用户 | `UsersController_searchUsers` |
| `searchByEmail` | 按邮箱搜索 | `UsersController_searchByEmail` |
| `create` | 创建用户 | `UsersController_create` |
| `update` | 更新用户 | `UsersController_update` |
| `delete` | 删除用户 | `UsersController_remove` |
| `deleteImmediately` | 立即删除用户 | `UsersController_deleteImmediately` |
| `getProfile` | 获取用户信息 | `UsersController_getProfile` |
| `updateProfile` | 更新用户信息 | `UsersController_updateProfile` |
| `changePassword` | 修改密码 | `UsersController_changePassword` |
| `getDashboardStats` | 获取仪表板统计 | `UsersController_getDashboardStats` |
| `deactivateAccount` | 停用账号 | `UsersController_deactivateAccount` |
| `getWechatDeactivateQr` | 获取微信注销二维码 | 直接HTTP调用 `/users/me/deactivate/wechat-qr` |

### 1.5 mxcadApi.ts - MxCAD 操作服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `checkFileExist` | 检查文件是否存在 | `MxCadController_checkFileExist` |
| `checkDuplicateFile` | 检查重复文件 | `MxCadController_checkDuplicateFile` |
| `checkChunkExist` | 检查分片是否存在 | `MxCadController_checkChunkExist` |
| `uploadChunk` | 上传分片 | `MxCadController_uploadFile` |
| `getPreloadingData` | 获取预加载数据 | `MxCadController_getPreloadingData` |
| `checkThumbnail` | 检查缩略图是否存在 | `MxCadController_checkThumbnail` |
| `uploadThumbnail` | 上传缩略图 | `MxCadController_uploadThumbnail` |
| `checkExternalReferenceExists` | 检查外部参照是否存在 | `MxCadController_checkExternalReference` |
| `refreshExternalReferences` | 刷新外部参照 | `MxCadController_refreshExternalReferences` |
| `uploadExtReferenceDwg` | 上传外部参照DWG文件 | `MxCadController_uploadExtReferenceDwg` |
| `uploadExtReferenceImage` | 上传外部参照图片 | `MxCadController_uploadExtReferenceImage` |
| `saveMxwebFile` | 保存mxweb文件 | `MxCadController_saveMxwebToNode` |
| `saveMxwebAs` | 另存为mxweb文件 | `MxCadController_saveMxwebAs` |

### 1.6 libraryApi.ts - 公共资源库服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `getDrawingLibrary` | 获取图纸库详情 | `LibraryController_getDrawingLibrary` |
| `getDrawingChildren` | 获取图纸库子节点 | `LibraryController_getDrawingChildren` |
| `getDrawingAllFiles` | 获取图纸库所有文件 | `LibraryController_getDrawingAllFiles` |
| `getDrawingNode` | 获取图纸库节点详情 | `LibraryController_getDrawingNode` |
| `downloadDrawingNode` | 下载图纸库文件 | `LibraryController_downloadDrawingNode` |
| `getDrawingThumbnailUrl` | 获取图纸缩略图URL | 直接拼接URL |
| `createDrawingFolder` | 创建图纸库文件夹 | `LibraryController_createDrawingFolder` |
| `uploadDrawingChunk` | 上传图纸库文件分片 | 复用 `mxcadApi.uploadChunk` |
| `checkDrawingFileExist` | 检查图纸库文件是否存在 | 复用 `mxcadApi.checkFileExist` |
| `checkDrawingChunkExist` | 检查图纸库分片是否存在 | 复用 `mxcadApi.checkChunkExist` |
| `deleteDrawingNode` | 删除图纸库节点 | `LibraryController_deleteDrawingNode` |
| `renameDrawingNode` | 重命名图纸库节点 | `LibraryController_renameDrawingNode` |
| `moveDrawingNode` | 移动图纸库节点 | `LibraryController_moveDrawingNode` |
| `copyDrawingNode` | 复制图纸库节点 | `LibraryController_copyDrawingNode` |
| `getBlockLibrary` | 获取图块库详情 | `LibraryController_getBlockLibrary` |
| `getBlockChildren` | 获取图块库子节点 | `LibraryController_getBlockChildren` |
| `getBlockAllFiles` | 获取图块库所有文件 | `LibraryController_getBlockAllFiles` |
| `getBlockNode` | 获取图块库节点详情 | `LibraryController_getBlockNode` |
| `downloadBlockNode` | 下载图块库文件 | `LibraryController_downloadBlockNode` |
| `getBlockThumbnailUrl` | 获取图块缩略图URL | 直接拼接URL |
| `createBlockFolder` | 创建图块库文件夹 | `LibraryController_createBlockFolder` |
| `uploadBlockChunk` | 上传图块库文件分片 | 复用 `mxcadApi.uploadChunk` |
| `checkBlockFileExist` | 检查图块库文件是否存在 | 复用 `mxcadApi.checkFileExist` |
| `checkBlockChunkExist` | 检查图块库分片是否存在 | 复用 `mxcadApi.checkChunkExist` |
| `deleteBlockNode` | 删除图块库节点 | `LibraryController_deleteBlockNode` |
| `renameBlockNode` | 重命名图块库节点 | `LibraryController_renameBlockNode` |
| `moveBlockNode` | 移动图块库节点 | `LibraryController_moveBlockNode` |
| `copyBlockNode` | 复制图块库节点 | `LibraryController_copyBlockNode` |
| `saveDrawing` | 保存图纸到图纸库 | `LibraryController_saveDrawing` |
| `saveDrawingAs` | 另存为图纸到图纸库 | `LibraryController_saveDrawingAs` |
| `saveBlock` | 保存图块到图块库 | `LibraryController_saveBlock` |
| `saveBlockAs` | 另存为图块到图块库 | `LibraryController_saveBlockAs` |
| `createFolder` | 创建文件夹（统一接口） | `LibraryController_createDrawingFolder/BlockFolder` |
| `deleteNode` | 删除节点（统一接口） | `LibraryController_deleteDrawingNode/BlockNode` |
| `getChildren` | 获取子节点（统一接口） | `LibraryController_getDrawingChildren/BlockChildren` |

### 1.7 projectsApi.ts - 综合项目服务（已弃用）

> **注意**: 此服务已弃用，是对其他模块化API的包装

| 方法名 | 功能描述 | 实际调用 |
|--------|----------|----------|
| `list` | 获取项目列表 | `projectApi.list` |
| `getDeletedProjects` | 获取已删除项目 | `projectApi.getDeleted` |
| `getDeleted` | 获取已删除项目 | `projectApi.getDeleted` |
| `create` | 创建项目 | `projectApi.create` |
| `get` | 获取项目详情 | `projectApi.get` |
| `update` | 更新项目 | `projectApi.update` |
| `delete` | 删除项目 | `projectApi.delete` |
| `restoreProject` | 恢复项目 | `projectApi.restore` |
| `getStorageInfo` | 获取存储信息 | `projectApi.getStorageInfo` |
| `getQuota` | 获取配额 | `projectApi.getQuota` |
| `updateStorageQuota` | 更新存储配额 | `projectApi.updateStorageQuota` |
| `getPersonalSpace` | 获取私人空间 | `projectApi.getPersonalSpace` |
| `getUserPersonalSpace` | 获取指定用户私人空间 | `projectApi.getUserPersonalSpace` |
| `createNode` | 创建节点 | `nodeApi.createFolder` |
| `createFolder` | 创建文件夹 | `nodeApi.createFolder` |
| `getNode` | 获取节点详情 | `nodeApi.getNode` |
| `getChildren` | 获取子节点 | `nodeApi.getChildren` |
| `updateNode` | 更新节点 | `nodeApi.updateNode` |
| `renameNode` | 重命名节点 | `nodeApi.renameNode` |
| `deleteNode` | 删除节点 | `nodeApi.deleteNode` |
| `moveNode` | 移动节点 | `nodeApi.moveNode` |
| `copyNode` | 复制节点 | `nodeApi.copyNode` |
| `restoreNode` | 恢复节点 | `nodeApi.restoreNode` |
| `getMembers` | 获取项目成员 | `projectMemberApi.getMembers` |
| `addMember` | 添加成员 | `projectMemberApi.addMember` |
| `removeMember` | 移除成员 | `projectMemberApi.removeMember` |
| `updateMember` | 更新成员 | `projectMemberApi.updateMember` |
| `transferOwnership` | 转移所有权 | `projectMemberApi.transferOwnership` |
| `getPermissions` | 获取权限 | `projectPermissionApi.getPermissions` |
| `checkPermission` | 检查权限 | `projectPermissionApi.checkPermission` |
| `getRole` | 获取角色 | `projectPermissionApi.getRole` |
| `getProjectTrash` | 获取项目回收站 | `projectTrashApi.getProjectTrash` |
| `clearProjectTrash` | 清空项目回收站 | `projectTrashApi.clearProjectTrash` |
| `search` | 搜索 | `searchApi.search` |

### 1.8 filesApi.ts - 文件服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `list` | 获取项目列表 | `FileSystemController_getProjects` |
| `get` | 获取节点详情 | `FileSystemController_getNode` |
| `download` | 下载节点 | `FileSystemController_downloadNode` |
| `downloadWithFormat` | 下载并转换格式 | `FileSystemController_downloadNodeWithFormat` |
| `update` | 更新节点 | `FileSystemController_updateNode` |
| `delete` | 删除节点 | `FileSystemController_deleteNode` |
| `createFolder` | 创建文件夹 | `FileSystemController_createFolder` |
| `moveNode` | 移动节点 | `FileSystemController_moveNode` |
| `copyNode` | 复制节点 | `FileSystemController_copyNode` |
| `getThumbnailUrl` | 获取缩略图URL | 直接拼接URL |

### 1.9 searchApi.ts - 搜索服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `search` | 统一搜索接口 | `FileSystemController_search` |

### 1.10 trashApi.ts - 回收站服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `getList` | 获取回收站列表 | `FileSystemController_getTrash` |
| `restoreItems` | 恢复项目 | `FileSystemController_restoreTrashItems` |
| `permanentlyDeleteItems` | 永久删除项目 | `FileSystemController_permanentlyDeleteTrashItems` |
| `clear` | 清空回收站 | `FileSystemController_clearTrash` |

### 1.11 projectMemberApi.ts - 项目成员服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `getMembers` | 获取项目成员列表 | `FileSystemController_getProjectMembers` |
| `addMember` | 添加成员 | `FileSystemController_addProjectMember` |
| `removeMember` | 移除成员 | `FileSystemController_removeProjectMember` |
| `updateMember` | 更新成员角色 | `FileSystemController_updateProjectMember` |
| `transferOwnership` | 转移项目所有权 | `FileSystemController_transferProjectOwnership` |

### 1.12 projectPermissionApi.ts - 项目权限服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `getPermissions` | 获取用户项目权限 | `FileSystemController_getUserProjectPermissions` |
| `checkPermission` | 检查特定权限 | `FileSystemController_checkProjectPermission` |
| `getRole` | 获取用户项目角色 | `FileSystemController_getUserProjectRole` |

### 1.13 projectTrashApi.ts - 项目回收站服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `getProjectTrash` | 获取项目回收站 | `FileSystemController_getProjectTrash` |
| `clearProjectTrash` | 清空项目回收站 | `FileSystemController_clearProjectTrash` |

### 1.14 rolesApi.ts - 角色管理服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `list` | 获取角色列表 | `RolesController_findAll` |
| `get` | 获取角色详情 | `RolesController_findOne` |
| `create` | 创建角色 | `RolesController_create` |
| `update` | 更新角色 | `RolesController_update` |
| `delete` | 删除角色 | `RolesController_remove` |
| `getPermissions` | 获取角色权限 | `RolesController_getRolePermissions` |
| `addPermissions` | 添加权限 | `RolesController_addPermissions` |
| `removePermissions` | 移除权限 | `RolesController_removePermissions` |

### 1.15 projectRolesApi.ts - 项目角色服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `list` | 获取所有项目角色 | `RolesController_getAllProjectRoles` |
| `getSystemRoles` | 获取系统项目角色 | `RolesController_getSystemProjectRoles` |
| `getByProject` | 获取项目自定义角色 | `RolesController_getProjectRolesByProject` |
| `create` | 创建项目角色 | `RolesController_createProjectRole` |
| `update` | 更新项目角色 | `RolesController_updateProjectRole` |
| `delete` | 删除项目角色 | `RolesController_deleteProjectRole` |
| `getPermissions` | 获取项目角色权限 | `RolesController_getProjectRolePermissions` |
| `addPermissions` | 添加项目角色权限 | `RolesController_addProjectRolePermissions` |
| `removePermissions` | 移除项目角色权限 | `RolesController_removeProjectRolePermissions` |

### 1.16 publicFileApi.ts - 公开文件服务

| 方法名 | 功能描述 | 路径 |
|--------|----------|------|
| `checkFile` | 检查文件是否存在 | `/api/public-file/file/check` |
| `checkChunk` | 检查分片是否存在 | `/api/public-file/chunk/check` |
| `uploadChunk` | 上传分片 | `/api/public-file/chunk/upload` |
| `mergeChunks` | 合并分片 | `/api/public-file/chunk/merge` |
| `getFileAccessUrl` | 获取文件访问URL | `/api/public-file/access/{hash}/{filename}` |
| `uploadFile` | 完整分片上传流程 | 组合调用 |
| `uploadExtReference` | 上传外部参照 | `/api/public-file/ext-reference/upload` |
| `checkExtReference` | 检查外部参照 | `/api/public-file/ext-reference/check` |
| `getPreloadingData` | 获取预加载数据 | `/api/public-file/preloading/{hash}` |

### 1.17 adminApi.ts - 管理员服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `getStats` | 获取管理员统计 | `AdminController_getAdminStats` |
| `getCleanupStats` | 获取清理统计 | `AdminController_getCleanupStats` |
| `cleanupStorage` | 清理存储 | `AdminController_cleanupStorage` |

### 1.18 auditApi.ts - 审计日志服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `getLogs` | 获取审计日志 | `AuditLogController_findAll` |
| `getLogById` | 获取日志详情 | `AuditLogController_findOne` |
| `getStatistics` | 获取统计信息 | `AuditLogController_getStatistics` |
| `cleanup` | 清理旧日志 | `AuditLogController_cleanupOldLogs` |

### 1.19 fontsApi.ts - 字体管理服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `getFonts` | 获取字体列表 | `FontsController_getFonts` |
| `uploadFont` | 上传字体 | `FontsController_uploadFont` |
| `deleteFont` | 删除字体 | `FontsController_deleteFont` |
| `downloadFont` | 下载字体 | `FontsController_downloadFont` |

### 1.20 healthApi.ts - 健康检查服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `getHealth` | 获取系统健康状态 | `HealthController_check` |
| `checkDatabase` | 检查数据库健康 | `HealthController_checkDatabase` |
| `checkStorage` | 检查存储服务健康 | `HealthController_checkStorage` |

### 1.21 runtimeConfigApi.ts - 运行时配置服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `getPublicConfigs` | 获取公开配置 | `RuntimeConfigController_getPublicConfigs` |
| `getAllConfigs` | 获取所有配置 | `RuntimeConfigController_getAllConfigs` |
| `getDefinitions` | 获取配置定义 | `RuntimeConfigController_getDefinitions` |
| `getConfig` | 获取单个配置 | `RuntimeConfigController_getConfig` |
| `updateConfig` | 更新配置 | `RuntimeConfigController_updateConfig` |
| `resetConfig` | 重置配置 | `RuntimeConfigController_resetConfig` |

### 1.22 userCleanupApi.ts - 用户清理服务

| 方法名 | 功能描述 | 后端控制器 |
|--------|----------|------------|
| `getStats` | 获取清理统计 | `UserCleanupController_getStats` |
| `trigger` | 触发清理任务 | `UserCleanupController_triggerCleanup` |

### 1.23 cacheApi.ts - 缓存服务

> **注意**: 此文件为空对象，未实现任何方法

---

## 二、API 调用组件映射

### 2.1 authApi 调用位置

| 调用文件 | 用途 |
|----------|------|
| `src/pages/Login.tsx` | 用户登录 |
| `src/pages/Register.tsx` | 用户注册 |
| `src/pages/Profile.tsx` | 用户资料管理 |
| `src/pages/Profile/ProfileAccountTab.tsx` | 账户设置 |
| `src/pages/Profile/hooks/useEmailTab.ts` | 邮箱绑定 |
| `src/pages/Profile/WechatDeactivateConfirm.tsx` | 微信注销 |
| `src/pages/ForgotPassword.tsx` | 忘记密码 |
| `src/pages/ResetPassword.tsx` | 重置密码 |
| `src/pages/EmailVerification.tsx` | 邮箱验证 |
| `src/pages/PhoneVerification.tsx` | 手机验证 |
| `src/pages/RoleManagement.tsx` | 角色管理 |
| `src/hooks/useWechatAuth.ts` | 微信授权 |
| `src/contexts/AuthContext.tsx` | 认证上下文 |

### 2.2 usersApi 调用位置

| 调用文件 | 用途 |
|----------|------|
| `src/pages/UserManagement.tsx` | 用户管理页面 |
| `src/pages/Profile.tsx` | 用户资料 |
| `src/pages/Profile/ProfileAccountTab.tsx` | 账户信息 |
| `src/pages/components/ProfileInfoTab.tsx` | 资料标签页 |
| `src/pages/Dashboard.tsx` | 仪表板统计 |
| `src/components/modals/MembersModal.tsx` | 成员管理弹窗 |

### 2.3 projectsApi 调用位置（主要入口）

| 调用文件 | 用途 |
|----------|------|
| `src/pages/FileSystemManager.tsx` | 文件系统管理 |
| `src/pages/LibraryManager.tsx` | 资源库管理 |
| `src/pages/Dashboard.tsx` | 仪表板 |
| `src/pages/CADEditorDirect.tsx` | CAD编辑器 |
| `src/pages/UserManagement.tsx` | 用户管理 |
| `src/hooks/file-system/useFileSystemData.ts` | 文件系统数据 |
| `src/hooks/file-system/useFileSystemCRUD.ts` | 文件系统操作 |
| `src/hooks/useProjectPermission.ts` | 项目权限 |
| `src/components/modals/SaveAsModal.tsx` | 另存为弹窗 |
| `src/components/modals/MembersModal.tsx` | 成员管理 |
| `src/components/modals/SelectFolderModal.tsx` | 选择文件夹 |
| `src/components/file-system-manager/useFileSystemDragDrop.ts` | 拖拽操作 |
| `src/components/ProjectDrawingsPanel.tsx` | 图纸面板 |
| `src/services/mxcadManager.ts` | MxCAD管理器 |
| `src/utils/permissionUtils.ts` | 权限工具 |

### 2.4 mxcadApi 调用位置

| 调用文件 | 用途 |
|----------|------|
| `src/hooks/useExternalReferenceUpload.ts` | 外部参照上传 |
| `src/utils/mxcadUploadUtils.ts` | 上传工具 |
| `src/services/mxcadManager.ts` | MxCAD管理器 |
| `src/services/libraryApi.ts` | 资源库服务 |
| `src/components/modals/SaveAsModal.tsx` | 另存为弹窗 |

### 2.5 libraryApi 调用位置

| 调用文件 | 用途 |
|----------|------|
| `src/pages/LibraryManager.tsx` | 资源库管理 |
| `src/pages/CADEditorDirect.tsx` | CAD编辑器 |
| `src/hooks/useLibrary.ts` | 资源库Hook |
| `src/hooks/useLibraryPanel.ts` | 资源库面板Hook |
| `src/hooks/library/useLibraryOperations.ts` | 资源库操作 |
| `src/hooks/useDirectoryImport.ts` | 目录导入 |
| `src/services/mxcadManager.ts` | MxCAD管理器 |
| `src/components/modals/SaveAsModal.tsx` | 另存为弹窗 |
| `src/components/modals/LibrarySelectFolderModal.tsx` | 选择文件夹弹窗 |
| `src/components/ProjectDrawingsPanel.tsx` | 图纸面板 |

### 2.6 filesApi 调用位置

| 调用文件 | 用途 |
|----------|------|
| `src/pages/CADEditorDirect.tsx` | CAD编辑器 |
| `src/hooks/file-system/useFileSystemData.ts` | 文件系统数据 |
| `src/hooks/file-system/useFileSystemNavigation.ts` | 文件系统导航 |
| `src/hooks/useMxCadEditor.ts` | MxCAD编辑器Hook |
| `src/services/mxcadManager.ts` | MxCAD管理器 |
| `src/components/sidebar/SidebarContainer.tsx` | 侧边栏 |
| `src/components/ProjectDrawingsPanel.tsx` | 图纸面板 |

### 2.7 rolesApi 调用位置

| 调用文件 | 用途 |
|----------|------|
| `src/pages/RoleManagement.tsx` | 角色管理 |
| `src/pages/UserManagement.tsx` | 用户管理 |

### 2.8 runtimeConfigApi 调用位置

| 调用文件 | 用途 |
|----------|------|
| `src/pages/RuntimeConfigPage.tsx` | 运行时配置页面 |
| `src/pages/UserManagement.tsx` | 用户管理 |
| `src/pages/LibraryManager.tsx` | 资源库管理 |
| `src/contexts/RuntimeConfigContext.tsx` | 配置上下文 |

### 2.9 其他 API 调用位置

| API | 调用文件 | 用途 |
|-----|----------|------|
| `adminApi` | `src/pages/SystemMonitorPage.tsx` | 系统监控 |
| `auditApi` | `src/pages/AuditLogPage.tsx` | 审计日志 |
| `fontsApi` | `src/pages/FontLibrary.tsx` | 字体库 |
| `healthApi` | `src/pages/SystemMonitorPage.tsx` | 系统健康 |
| `trashApi` | `src/hooks/file-system/useFileSystemCRUD.ts` | 回收站操作 |

---

## 三、API 路径版本化一致性检查

### 3.1 后端控制器版本化情况

后端全局前缀为 `/api`，各控制器路径配置如下：

| 控制器 | 路径前缀 | 是否包含 v1 |
|--------|----------|-------------|
| AuthController | `v1/auth` | ✅ 是 |
| FileSystemController | `v1/file-system` | ✅ 是 |
| MxCadController | `v1/mxcad` | ✅ 是 |
| UsersController | `v1/users` | ✅ 是 |
| RolesController | `v1/roles` | ✅ 是 |
| LibraryController | `v1/library` | ✅ 是 |
| FontsController | `v1/font-management` | ✅ 是 |
| AdminController | `v1/admin` | ✅ 是 |
| RuntimeConfigController | `v1/runtime-config` | ✅ 是 |
| VersionControlController | `v1/version-control` | ✅ 是 |
| CacheMonitorController | `v1/cache-monitor` | ✅ 是 |
| UserCleanupController | `v1/user-cleanup` | ✅ 是 |
| PolicyConfigController | `v1/policy-config` | ✅ 是 |
| **PublicFileController** | `public-file` | ❌ 否 |
| **AuditLogController** | `audit` | ❌ 否 |
| **HealthController** | `health` | ❌ 否 |

### 3.2 前端硬编码路径检查

前端存在以下硬编码的 API 路径：

| 文件 | 路径 | 版本化 | 问题 |
|------|------|--------|------|
| `services/filesApi.ts:78` | `/api/v1/file-system/nodes/{nodeId}/thumbnail` | ✅ v1 | 正确 |
| `utils/fileUtils.ts:124` | `/api/v1/file-system/nodes/{nodeId}/thumbnail` | ✅ v1 | 正确 |
| `utils/fileUtils.ts:141` | `/api/v1/file-system/nodes/{nodeId}/thumbnail` | ✅ v1 | 正确 |
| `utils/fileUtils.ts:156` | `/api/v1/file-system/nodes/{nodeId}/thumbnail` | ✅ v1 | 正确 |
| `utils/fileUtils.ts:160` | `/api/v1/file-system/nodes/{nodeId}/download` | ✅ v1 | 正确 |
| `services/publicFileApi.ts` | `/api/public-file/...` | ❌ 无版本 | 后端未版本化 |
| `services/mxcadManager.ts:2692` | `/api/public-file/access/{hash}/{fileName}` | ❌ 无版本 | 后端未版本化 |

### 3.3 版本化一致性结论

**已版本化（符合预期）**:
- 主要业务 API 均已使用 `/api/v1/` 前缀
- OpenAPI 客户端自动使用 swagger 定义的路径

**未版本化（需确认）**:
- `public-file` - 公开文件接口，用于未认证场景
- `audit` - 审计日志接口
- `health` - 健康检查接口

> **说明**: 这三个未版本化的接口可能是有意为之，因为它们是公开接口或基础服务接口，不涉及业务逻辑变更。

---

## 四、问题与建议

### 4.1 发现的问题

1. **硬编码路径存在**：部分 API 路径通过字符串拼接方式硬编码，而非通过 OpenAPI 客户端调用
2. **公共文件接口未版本化**：`publicFileApi` 使用 `/api/public-file/` 路径，后端控制器也未添加 v1 前缀
3. **已弃用 API 仍被广泛使用**：`projectsApi` 已标记为弃用，但仍有 15 个文件依赖它

### 4.2 建议

1. **统一 API 调用方式**：建议所有 API 调用通过 OpenAPI 客户端进行，减少硬编码路径
2. **评估公共接口版本化**：考虑是否需要为 `public-file`、`audit`、`health` 添加版本化前缀
3. **逐步迁移到模块化 API**：建议新项目代码使用 `projectApi`、`nodeApi` 等新的模块化 API，逐步淘汰 `projectsApi`
4. **完善缓存服务**：`cacheApi.ts` 为空对象，建议补充实现或删除该文件

---

## 五、总结

| 统计项 | 数量 |
|--------|------|
| API 文件总数 | 24 |
| API 方法总数 | 约 150+ |
| 调用组件数 | 约 50+ |
| 已版本化控制器 | 13 |
| 未版本化控制器 | 3 |
| 硬编码路径文件 | 3 |

前端 API 架构整体清晰，采用了模块化设计。大部分 API 通过 OpenAPI 客户端调用，保证了类型安全和路径一致性。建议关注上述提到的问题，逐步优化代码质量。
