# CloudCAD API 完整参考手册

**汇报人：** Trae
**生成日期：** 2026-05-02
**文档说明：** 本文档由 `api-inventory.md`、`api-final-status.md` 和 `api-trace-results.md` 整合而成，提供完整的 API 接口清单、状态追踪和使用建议。

---

## 一、API 接口完整清单

> 后端地址: `packages/backend/src/`
> 共扫描 19 个 Controller 文件

### 1.1 模块：auth（认证）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| POST | /api/auth/register | Body: {username, email, password, nickname?} | 用户注册 | ✅ 已使用 |
| POST | /api/auth/login | Body: {email/username, password} | 用户登录 | ✅ 已使用 |
| POST | /api/auth/refresh | Body: {refreshToken} | 刷新Token | ✅ 已使用 |
| POST | /api/auth/logout | Header: Authorization | 用户登出 | ✅ 已使用 |
| GET | /api/auth/profile | Header: Authorization | 获取用户信息 | ✅ 已使用 |
| POST | /api/auth/send-verification | Body: {email} | 发送邮箱验证码 | ✅ 已使用 |
| POST | /api/auth/verify-email | Body: {email, code} | 验证邮箱 | ✅ 已使用 |
| POST | /api/auth/verify-email-and-register-phone | Body: {email, code, phone, phoneCode, username, password, nickname?} | 验证邮箱并注册手机号 | ✅ 已使用 |
| POST | /api/auth/resend-verification | Body: {email} | 重发验证码 | ✅ 已使用 |
| POST | /api/auth/bind-email-and-login | Body: {tempToken, email, code} | 绑定邮箱并登录 | ✅ 已使用 |
| POST | /api/auth/bind-phone-and-login | Body: {tempToken, phone, code} | 绑定手机号并登录 | ✅ 已使用 |
| POST | /api/auth/verify-phone | Body: {phone, code} | 验证手机号 | ✅ 已使用 |
| POST | /api/auth/forgot-password | Body: {email, phone?} | 忘记密码 | ✅ 已使用 |
| POST | /api/auth/reset-password | Body: {email, phone?, code, newPassword} | 重置密码 | ✅ 已使用 |
| POST | /api/auth/bind-email | Body: {email, isRebind?} | 发送绑定邮箱验证码 | ✅ 已使用 |
| POST | /api/auth/verify-bind-email | Body: {email, code} | 验证并绑定邮箱 | ✅ 已使用 |
| POST | /api/auth/send-unbind-email-code | - | 发送解绑邮箱验证码 | ✅ 已使用 |
| POST | /api/auth/verify-unbind-email-code | Body: {code} | 验证解绑邮箱验证码 | ✅ 已使用 |
| POST | /api/auth/rebind-email | Body: {email, code, token} | 换绑邮箱 | ✅ 已使用 |
| POST | /api/auth/send-sms-code | Body: {phone} | 发送短信验证码 | ✅ 已使用 |
| POST | /api/auth/verify-sms-code | Body: {phone, code} | 验证短信验证码 | ✅ 已使用 |
| POST | /api/auth/register-phone | Body: {phone, code, username, password, nickname?} | 手机号注册 | ✅ 已使用 |
| POST | /api/auth/login-phone | Body: {phone, code} | 手机号验证码登录 | ✅ 已使用 |
| POST | /api/auth/bind-phone | Body: {phone, code} | 绑定手机号 | ✅ 已使用 |
| POST | /api/auth/send-unbind-phone-code | - | 发送解绑手机号验证码 | ✅ 已使用 |
| POST | /api/auth/verify-unbind-phone-code | Body: {code} | 验证解绑手机号验证码 | ✅ 已使用 |
| POST | /api/auth/rebind-phone | Body: {phone, code, token} | 换绑手机号 | ✅ 已使用 |
| POST | /api/auth/check-field | Body: {username?, email?, phone?} | 检查字段唯一性 | ✅ 已使用 |
| GET | /api/auth/wechat/login | Query: {origin, isPopup, purpose} | 获取微信授权URL | ✅ 已使用 |
| GET | /api/auth/wechat/callback | Query: {code, state} | 微信授权回调 | ✅ 已使用 |
| POST | /api/auth/wechat/bind | Body: {code, state} | 绑定微信 | ✅ 已使用 |
| POST | /api/auth/wechat/unbind | - | 解绑微信 | ✅ 已使用 |

**Controller**: `auth.controller.ts` (路由前缀: `/auth`)

---

### 1.2 模块：session（会话）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| POST | /api/session/create | Body: {user: {id, email, username, role}} | 设置用户Session | ❌ 已废弃 |
| GET | /api/session/user | - | 获取当前Session用户信息 | ❌ 已废弃 |
| POST | /api/session/destroy | - | 清除Session | ❌ 已废弃 |

**Controller**: `session.controller.ts` (路由前缀: `/session`)
**状态说明**: Session Controller 未被前端使用，已被 JWT 认证替代

---

### 1.3 模块：users（用户管理）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| POST | /api/users | Body: CreateUserDto | 创建用户 | ✅ 已使用 |
| GET | /api/users | Query: QueryUsersDto | 获取用户列表 | ✅ 已使用 |
| GET | /api/users/search/by-email | Query: {email} | 根据邮箱搜索用户 | ⚠️ 预留 |
| GET | /api/users/search | Query: QueryUsersDto | 搜索用户 | ✅ 已使用 |
| GET | /api/users/profile/me | - | 获取当前用户信息 | ✅ 已使用 |
| GET | /api/users/stats/me | - | 获取当前用户仪表盘统计 | ✅ 已使用 |
| PATCH | /api/users/profile/me | Body: UpdateUserDto | 更新当前用户信息 | ✅ 已使用 |
| GET | /api/users/{id} | Param: {id} | 根据ID获取用户 | ✅ 已使用 |
| PATCH | /api/users/{id} | Param: {id}, Body: UpdateUserDto | 更新用户 | ✅ 已使用 |
| DELETE | /api/users/{id} | Param: {id} | 注销用户账户（软删除） | ✅ 已使用 |
| POST | /api/users/{id}/delete-immediately | Param: {id} | 立即注销用户 | ✅ 已使用 |
| POST | /api/users/{id}/restore | Param: {id} | 恢复已注销用户 | ✅ 已使用 |
| PATCH | /api/users/{id}/status | Param: {id}, Body: {status} | 更新用户状态 | ❌ 待删除 |
| POST | /api/users/deactivate-account | Body: {password, phoneCode?, emailCode?, wechatConfirm?} | 注销用户账户 | ✅ 已使用 |
| POST | /api/users/me/restore | Body: {verificationMethod, code} | 恢复已注销账户 | ❌ 待删除 |
| POST | /api/users/change-password | Body: {oldPassword, newPassword} | 修改密码 | ✅ 已使用 |

**Controller**: `users.controller.ts` (路由前缀: `/users`)

---

### 1.4 模块：roles（角色管理）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/roles | - | 获取所有角色 | ✅ 已使用 |
| GET | /api/roles/category/{category} | Param: {category} | 根据类别获取角色 | ❌ 待删除 |
| GET | /api/roles/{id} | Param: {id} | 根据ID获取角色 | ✅ 已使用 |
| GET | /api/roles/{id}/permissions | Param: {id} | 获取角色所有权限 | ✅ 已使用 |
| POST | /api/roles/{id}/permissions | Param: {id}, Body: {permissions[]} | 为角色分配权限 | ✅ 已使用 |
| DELETE | /api/roles/{id}/permissions | Param: {id}, Body: {permissions[]} | 从角色移除权限 | ✅ 已使用 |
| POST | /api/roles | Body: CreateRoleDto | 创建新角色 | ✅ 已使用 |
| PATCH | /api/roles/{id} | Param: {id}, Body: UpdateRoleDto | 更新角色 | ✅ 已使用 |
| DELETE | /api/roles/{id} | Param: {id} | 删除角色 | ✅ 已使用 |
| GET | /api/roles/project-roles/all | - | 获取所有项目角色 | ✅ 已使用 |
| GET | /api/roles/project-roles/system | - | 获取系统默认项目角色 | ✅ 已使用 |
| GET | /api/roles/project-roles/project/{projectId} | Param: {projectId} | 获取特定项目角色列表 | ✅ 已使用 |
| GET | /api/roles/project-roles/{id} | Param: {id} | 获取项目角色详情 | ❌ 待删除 |
| GET | /api/roles/project-roles/{id}/permissions | Param: {id} | 获取项目角色权限 | ❌ 待删除 |
| POST | /api/roles/project-roles | Body: CreateProjectRoleDto | 创建项目角色 | ✅ 已使用 |
| PATCH | /api/roles/project-roles/{id} | Param: {id}, Body: UpdateProjectRoleDto | 更新项目角色 | ✅ 已使用 |
| DELETE | /api/roles/project-roles/{id} | Param: {id} | 删除项目角色 | ✅ 已使用 |
| POST | /api/roles/project-roles/{id}/permissions | Param: {id}, Body: PermissionsDto | 为项目角色分配权限 | ✅ 已使用 |
| DELETE | /api/roles/project-roles/{id}/permissions | Param: {id}, Body: PermissionsDto | 从项目角色移除权限 | ✅ 已使用 |

**Controller**: `roles.controller.ts` (路由前缀: `/roles`)

---

### 1.5 模块：file-system（文件系统）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| POST | /api/file-system/projects | Body: CreateProjectDto | 创建项目 | ✅ 已使用 |
| GET | /api/file-system/projects | Query: QueryProjectsDto | 获取项目列表 | ✅ 已使用 |
| GET | /api/file-system/personal-space | - | 获取当前用户私人空间 | ✅ 已使用 |
| GET | /api/file-system/personal-space/by-user/{userId} | Param: {userId} | 获取指定用户私人空间 | ❌ 待删除 |
| GET | /api/file-system/projects/trash | Query: QueryProjectsDto | 获取已删除项目列表 | ❌ 待删除 |
| GET | /api/file-system/projects/{projectId} | Param: {projectId} | 获取项目详情 | ✅ 已使用 |
| PATCH | /api/file-system/projects/{projectId} | Param: {projectId}, Body: UpdateNodeDto | 更新项目信息 | ❌ 待删除 |
| DELETE | /api/file-system/projects/{projectId} | Param: {projectId}, Query: {permanently?} | 删除项目 | ❌ 待删除 |
| GET | /api/file-system/trash | - | 获取回收站列表 | ✅ 已使用 |
| POST | /api/file-system/trash/restore | Body: {itemIds[]} | 恢复回收站项目 | ✅ 已使用 |
| DELETE | /api/file-system/trash/items | Body: {itemIds[]} | 永久删除回收站项目 | ✅ 已使用 |
| DELETE | /api/file-system/trash | - | 清空回收站 | ✅ 已使用 |
| GET | /api/file-system/projects/{projectId}/trash | Param: {projectId}, Query: QueryChildrenDto | 获取项目内回收站 | ❌ 待删除 |
| POST | /api/file-system/nodes/{nodeId}/restore | Param: {nodeId} | 恢复已删除节点 | ❌ 待删除 |
| DELETE | /api/file-system/projects/{projectId}/trash | Param: {projectId} | 清空项目回收站 | ❌ 待删除 |
| POST | /api/file-system/nodes | Body: CreateNodeDto | 创建节点 | ❌ 待删除 |
| POST | /api/file-system/nodes/{parentId}/folders | Param: {parentId}, Body: CreateFolderDto | 创建文件夹 | ❌ 待删除 |
| GET | /api/file-system/nodes/{nodeId} | Param: {nodeId} | 获取节点详情 | ✅ 已使用 |
| GET | /api/file-system/nodes/{nodeId}/root | Param: {nodeId} | 获取根节点 | ❌ 待删除 |
| GET | /api/file-system/nodes/{nodeId}/children | Param: {nodeId}, Query: QueryChildrenDto | 获取子节点列表 | ✅ 已使用 |
| PATCH | /api/file-system/nodes/{nodeId} | Param: {nodeId}, Body: UpdateNodeDto | 更新节点 | ✅ 已使用 |
| DELETE | /api/file-system/nodes/{nodeId} | Param: {nodeId}, Body/Query: {permanently?} | 删除节点 | ✅ 已使用 |
| POST | /api/file-system/nodes/{nodeId}/move | Param: {nodeId}, Body: MoveNodeDto | 移动节点 | ✅ 已使用 |
| POST | /api/file-system/nodes/{nodeId}/copy | Param: {nodeId}, Body: CopyNodeDto | 复制节点 | ✅ 已使用 |
| POST | /api/file-system/files/upload | Body: UploadFileDto | 上传文件 | ❌ 待删除 |
| GET | /api/file-system/quota | Query: {nodeId?} | 获取存储配额信息 | ✅ 已使用 |
| POST | /api/file-system/quota/update | Body: UpdateStorageQuotaDto | 更新节点存储配额 | ✅ 已使用 |
| GET | /api/file-system/projects/{projectId}/members | Param: {projectId} | 获取项目成员列表 | ✅ 已使用 |
| POST | /api/file-system/projects/{projectId}/members | Param: {projectId}, Body: {userId, projectRoleId} | 添加项目成员 | ✅ 已使用 |
| PATCH | /api/file-system/projects/{projectId}/members/{userId} | Param: {projectId, userId}, Body: UpdateProjectMemberDto | 更新项目成员角色 | ✅ 已使用 |
| DELETE | /api/file-system/projects/{projectId}/members/{userId} | Param: {projectId, userId} | 移除项目成员 | ✅ 已使用 |
| POST | /api/file-system/projects/{projectId}/transfer | Param: {projectId}, Body: {newOwnerId} | 转移项目所有权 | ❌ 待删除 |
| POST | /api/file-system/projects/{projectId}/members/batch | Param: {projectId}, Body: {members[]} | 批量添加项目成员 | ❌ 待删除 |
| PATCH | /api/file-system/projects/{projectId}/members/batch | Param: {projectId}, Body: {updates[]} | 批量更新项目成员角色 | ❌ 待删除 |
| GET | /api/file-system/nodes/{nodeId}/thumbnail | Param: {nodeId} | 获取文件节点缩略图 | ✅ 已使用 |
| GET | /api/file-system/nodes/{nodeId}/download | Param: {nodeId} | 下载节点 | ✅ 已使用 |
| GET | /api/file-system/nodes/{nodeId}/download-with-format | Param: {nodeId}, Query: {format, width, height, colorPolicy} | 下载节点（支持格式转换） | ✅ 已使用 |
| GET | /api/file-system/projects/{projectId}/permissions | Param: {projectId} | 获取用户在项目中的权限列表 | ✅ 已使用 |
| GET | /api/file-system/projects/{projectId}/permissions/check | Param: {projectId}, Query: {permission} | 检查用户是否具有特定权限 | ✅ 已使用 |
| GET | /api/file-system/projects/{projectId}/role | Param: {projectId} | 获取用户在项目中的角色 | ✅ 已使用 |
| GET | /api/file-system/search | Query: SearchDto | 统一搜索接口 | ✅ 已使用 |

**Controller**: `file-system.controller.ts` (路由前缀: `/file-system`)

---

### 1.6 模块：library（公共资源库）

#### 图纸库 (drawing)

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/library/drawing | - | 获取图纸库详情 | ✅ 已使用 |
| GET | /api/library/drawing/children/{nodeId} | Param: {nodeId}, Query: QueryChildrenDto | 获取图纸库子节点列表 | ✅ 已使用 |
| GET | /api/library/drawing/all-files/{nodeId} | Param: {nodeId}, Query: QueryChildrenDto | 递归获取图纸库节点下所有文件 | ✅ 已使用 |
| GET | /api/library/drawing/filesData/*path | Path: *path | 获取图纸库文件（统一入口） | ✅ 已使用 |
| GET | /api/library/drawing/nodes/{nodeId} | Param: {nodeId} | 获取图纸库节点详情 | ✅ 已使用 |
| GET | /api/library/drawing/nodes/{nodeId}/download | Param: {nodeId} | 下载图纸库文件 | ✅ 已使用 |
| GET | /api/library/drawing/nodes/{nodeId}/thumbnail | Param: {nodeId} | 获取图纸库文件缩略图 | ✅ 已使用 |
| POST | /api/library/drawing/folders | Body: CreateFolderDto | 创建图纸库文件夹 | ✅ 已使用 |
| DELETE | /api/library/drawing/nodes/{nodeId} | Param: {nodeId}, Query: {permanently} | 删除图纸库节点 | ✅ 已使用 |
| PATCH | /api/library/drawing/nodes/{nodeId} | Param: {nodeId}, Body: UpdateNodeDto | 重命名图纸库节点 | ✅ 已使用 |
| POST | /api/library/drawing/nodes/{nodeId}/move | Param: {nodeId}, Body: MoveNodeDto | 移动图纸库节点 | ✅ 已使用 |
| POST | /api/library/drawing/nodes/{nodeId}/copy | Param: {nodeId}, Body: MoveNodeDto | 复制图纸库节点 | ✅ 已使用 |
| POST | /api/library/drawing/save/{nodeId} | Param: {nodeId}, Form: {file, commitMessage?} | 保存图纸到图纸库 | ✅ 已使用 |
| POST | /api/library/drawing/save-as | Form: SaveLibraryAsDto | 另存为图纸到图纸库 | ✅ 已使用 |

#### 图块库 (block)

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/library/block | - | 获取图块库详情 | ✅ 已使用 |
| GET | /api/library/block/children/{nodeId} | Param: {nodeId}, Query: QueryChildrenDto | 获取图块库子节点列表 | ✅ 已使用 |
| GET | /api/library/block/all-files/{nodeId} | Param: {nodeId}, Query: QueryChildrenDto | 递归获取图块库节点下所有文件 | ✅ 已使用 |
| GET | /api/library/block/filesData/*path | Path: *path | 获取图块库文件（统一入口） | ✅ 已使用 |
| GET | /api/library/block/nodes/{nodeId} | Param: {nodeId} | 获取图块库节点详情 | ✅ 已使用 |
| GET | /api/library/block/nodes/{nodeId}/download | Param: {nodeId} | 下载图块库文件 | ✅ 已使用 |
| GET | /api/library/block/nodes/{nodeId}/thumbnail | Param: {nodeId} | 获取图块库文件缩略图 | ✅ 已使用 |
| DELETE | /api/library/block/nodes/{nodeId} | Param: {nodeId}, Query: {permanently} | 删除图块库节点 | ✅ 已使用 |
| PATCH | /api/library/block/nodes/{nodeId} | Param: {nodeId}, Body: UpdateNodeDto | 重命名图块库节点 | ✅ 已使用 |
| POST | /api/library/block/nodes/{nodeId}/move | Param: {nodeId}, Body: MoveNodeDto | 移动图块库节点 | ✅ 已使用 |
| POST | /api/library/block/nodes/{nodeId}/copy | Param: {nodeId}, Body: MoveNodeDto | 复制图块库节点 | ✅ 已使用 |
| POST | /api/library/block/folders | Body: CreateFolderDto | 创建图块库文件夹 | ✅ 已使用 |
| POST | /api/library/block/save/{nodeId} | Param: {nodeId}, Form: {file, commitMessage?} | 保存图块到图块库 | ✅ 已使用 |
| POST | /api/library/block/save-as | Form: SaveLibraryAsDto | 另存为图块到图块库 | ✅ 已使用 |

**Controller**: `library.controller.ts` (路由前缀: `/library`)

---

### 1.7 模块：version-control（版本控制）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/version-control/history | Query: {projectId, filePath, limit?} | 获取节点SVN提交历史 | ✅ 已使用 |
| GET | /api/version-control/file/{revision} | Param: {revision}, Query: {projectId, filePath} | 获取指定版本的文件内容 | ✅ 已使用 |

**Controller**: `version-control.controller.ts` (路由前缀: `/version-control`)

---

### 1.8 模块：mxcad（CAD文件处理）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| POST | /api/mxcad/files/chunkisExist | Body: CheckChunkExistDto | 检查分片是否存在 | ✅ 已使用 |
| POST | /api/mxcad/files/fileisExist | Body: CheckFileExistDto | 检查文件是否存在 | ✅ 已使用 |
| POST | /api/mxcad/files/checkDuplicate | Body: CheckDuplicateFileDto | 检查目录中是否存在重复文件 | ✅ 已使用 |
| GET | /api/mxcad/file/{nodeId}/preloading | Param: {nodeId} | 获取外部参照预加载数据 | ✅ 已使用 |
| POST | /api/mxcad/file/{nodeId}/check-reference | Param: {nodeId}, Body: {fileName} | 检查外部参照文件是否存在 | ✅ 已使用 |
| POST | /api/mxcad/file/{nodeId}/refresh-external-references | Param: {nodeId} | 手动刷新文件的外部参照信息 | ✅ 已使用 |
| POST | /api/mxcad/files/uploadFiles | Body/Form: UploadFilesDto | 上传文件（支持分片） | ✅ 已使用 |
| POST | /api/mxcad/savemxweb/{nodeId} | Param: {nodeId}, Form: {file, commitMessage?} | 保存mxweb文件到指定节点 | ✅ 已使用 |
| POST | /api/mxcad/save-as | Form: SaveMxwebAsDto | 保存mxweb文件为新文件 | ✅ 已使用 |
| POST | /api/mxcad/up_ext_reference_dwg/{nodeId} | Param: {nodeId}, Form: UploadExtReferenceFileDto | 上传外部参照DWG | ✅ 已使用 |
| POST | /api/mxcad/up_ext_reference_image | Form: UploadExtReferenceFileDto | 上传外部参照图片 | ✅ 已使用 |
| GET | /api/mxcad/thumbnail/{nodeId} | Param: {nodeId} | 查询缩略图是否存在 | ❌ 待删除 |
| POST | /api/mxcad/thumbnail/{nodeId} | Param: {nodeId}, Form: {file} | 上传缩略图 | ❌ 待删除 |
| GET | /api/mxcad/files/{storageKey} | Param: {storageKey} | 访问非CAD文件 | ❌ 待删除 |
| GET | /api/mxcad/filesData/*path | Path: *path, Query: {v?} | 访问filesData目录中的文件 | ✅ 已使用 |
| GET | /api/mxcad/file/*path | Path: *path | 访问转换后的mxweb文件 | ✅ 已使用 |

**Controller**: `mxcad.controller.ts` (路由前缀: `/mxcad`)

---

### 1.9 模块：admin（管理员）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/admin/stats | - | 获取管理员统计信息 | ✅ 已使用 |
| GET | /api/admin/permissions/cache | - | 获取权限缓存统计 | ❌ 待删除 |
| POST | /api/admin/permissions/cache/cleanup | - | 清理权限缓存 | ❌ 待删除 |
| DELETE | /api/admin/permissions/cache/user/{userId} | Param: {userId} | 清除用户权限缓存 | ❌ 待删除 |
| GET | /api/admin/permissions/user/{userId} | Param: {userId} | 获取用户权限信息 | ❌ 待删除 |
| POST | /api/admin/storage/cleanup | Query: {delayDays?} | 手动触发存储清理 | ✅ 已使用 |
| GET | /api/admin/storage/cleanup/stats | - | 获取待清理存储统计 | ✅ 已使用 |

**Controller**: `admin.controller.ts` (路由前缀: `/admin`)

---

### 1.10 模块：public-file（公开文件服务）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| POST | /api/public-file/chunk/check | Body: CheckChunkDto | 检查分片是否存在 | ✅ 已使用 |
| POST | /api/public-file/file/check | Body: CheckFileDto | 检查文件是否已存在 | ✅ 已使用 |
| POST | /api/public-file/chunk/upload | Body/Form: {hash, chunk, chunks, file} | 上传分片 | ✅ 已使用 |
| POST | /api/public-file/chunk/merge | Body: MergeChunksDto | 合并分片并获取文件访问信息 | ✅ 已使用 |
| GET | /api/public-file/access/{hash}/{filename} | Param: {hash, filename} | 通过文件哈希访问目录下的文件 | ✅ 已使用 |
| GET | /api/public-file/access/{filename} | Param: {filename} | 在uploads目录下查找mxweb文件 | ❌ 待删除 |
| POST | /api/public-file/ext-reference/upload | Body/Form: UploadExtReferenceDto | 上传外部参照文件（公开接口） | ✅ 已使用 |
| GET | /api/public-file/ext-reference/check | Query: {srcHash, fileName} | 检查外部参照文件是否存在 | ✅ 已使用 |
| GET | /api/public-file/preloading/{hash} | Param: {hash} | 获取预加载数据 | ✅ 已使用 |

**Controller**: `public-file.controller.ts` (路由前缀: `/public-file`)

---

### 1.11 模块：fonts（字体管理）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/font-management | Query: {location?} | 获取字体列表 | ✅ 已使用 |
| POST | /api/font-management/upload | Form: {file, target?} | 上传字体文件 | ✅ 已使用 |
| DELETE | /api/font-management/{fileName} | Param: {fileName}, Query: {target?} | 删除字体文件 | ✅ 已使用 |
| GET | /api/font-management/download/{fileName} | Param: {fileName}, Query: {location} | 下载字体文件 | ✅ 已使用 |

**Controller**: `fonts.controller.ts` (路由前缀: `/font-management`)

---

### 1.12 模块：health（健康检查）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/health/live | - | 存活检查（Docker健康检查） | ✅ 已使用 |
| GET | /api/health | - | 系统健康检查 | ✅ 已使用 |
| GET | /api/health/db | - | 数据库健康检查 | ✅ 已使用 |
| GET | /api/health/storage | - | 存储服务健康检查 | ✅ 已使用 |

**Controller**: `health.controller.ts` (路由前缀: `/health`)

---

### 1.13 模块：audit（审计日志）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/audit/logs | Query: {userId?, action?, resourceType?, startDate?, endDate?, success?, page?, limit?} | 查询审计日志 | ✅ 已使用 |
| GET | /api/audit/logs/{id} | Param: {id} | 获取审计日志详情 | ✅ 已使用 |
| GET | /api/audit/statistics | Query: {startDate?, endDate?, userId?} | 获取审计统计信息 | ✅ 已使用 |
| POST | /api/audit/cleanup | Body: {daysToKeep} | 清理旧审计日志 | ✅ 已使用 |

**Controller**: `audit-log.controller.ts` (路由前缀: `/audit`)

---

### 1.14 模块：cache-monitor（缓存监控）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/cache-monitor/summary | - | 获取缓存监控摘要 | ⚠️ 预留 |
| GET | /api/cache-monitor/stats | Query: {level?, includeHotData?, includePerformance?} | 获取缓存统计信息 | ⚠️ 预留 |
| GET | /api/cache-monitor/health | - | 获取缓存健康状态 | ⚠️ 预留 |
| GET | /api/cache-monitor/performance | - | 获取缓存性能指标 | ⚠️ 预留 |
| GET | /api/cache-monitor/hot-data | Query: {limit?} | 获取热点数据 | ⚠️ 预留 |
| GET | /api/cache-monitor/performance-trend | Query: {level, minutes?} | 获取性能趋势 | ⚠️ 预留 |
| GET | /api/cache-monitor/size-trend | Query: {minutes?} | 获取缓存大小趋势 | ⚠️ 预留 |
| GET | /api/cache-monitor/warnings | - | 获取缓存警告 | ⚠️ 预留 |
| GET | /api/cache-monitor/value | Query: {key} | 获取缓存值 | ⚠️ 预留 |
| POST | /api/cache-monitor/value | Body: CacheOperationDto | 设置缓存值 | ⚠️ 预留 |
| DELETE | /api/cache-monitor/value | Query: {key} | 删除缓存 | ⚠️ 预留 |
| DELETE | /api/cache-monitor/values | Body: {keys[]} | 批量删除缓存 | ⚠️ 预留 |
| DELETE | /api/cache-monitor/pattern | Query: {pattern} | 根据模式删除缓存 | ⚠️ 预留 |
| POST | /api/cache-monitor/refresh | Body: {key} | 刷新缓存 | ⚠️ 预留 |
| POST | /api/cache-monitor/cleanup | Body: {pattern?, level?} | 清理缓存 | ⚠️ 预留 |
| GET | /api/cache-monitor/warmup/config | - | 获取预热配置 | ⚠️ 预留 |
| POST | /api/cache-monitor/warmup/config | Body: UpdateWarmupConfigDto | 更新预热配置 | ⚠️ 预留 |
| POST | /api/cache-monitor/warmup/trigger | Body: TriggerWarmupDto? | 触发预热 | ⚠️ 预留 |
| GET | /api/cache-monitor/warmup/history | - | 获取预热历史 | ⚠️ 预留 |
| GET | /api/cache-monitor/warmup/stats | - | 获取预热统计 | ⚠️ 预留 |
| DELETE | /api/cache-monitor/warmup/history | - | 清除预热历史 | ⚠️ 预留 |

**Controller**: `cache-monitor.controller.ts` (路由前缀: `/cache-monitor`)

---

### 1.15 模块：cache（Redis缓存）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/cache/stats | - | 获取缓存统计信息 | ❌ 待删除 |
| POST | /api/cache/clear | - | 清理所有缓存 | ❌ 待删除 |
| POST | /api/cache/warmup | - | 手动触发缓存预热 | ❌ 待删除 |
| POST | /api/cache/warmup/user/{userId} | Param: {userId} | 预热指定用户的缓存 | ❌ 待删除 |
| POST | /api/cache/warmup/project/{projectId} | Param: {projectId} | 预热指定项目的缓存 | ❌ 待删除 |

**Controller**: `common/controllers/cache-monitor.controller.ts` (路由前缀: `/cache`)

---

### 1.16 模块：user-cleanup（用户清理）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/user-cleanup/stats | - | 获取待清理用户统计 | ✅ 已使用 |
| POST | /api/user-cleanup/trigger | Body: {delayDays?} | 手动触发用户数据清理 | ✅ 已使用 |

**Controller**: `user-cleanup.controller.ts` (路由前缀: `/user-cleanup`)

---

### 1.17 模块：runtime-config（运行时配置）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/runtime-config/public | - | 获取公开配置（前端初始化使用） | ✅ 已使用 |
| GET | /api/runtime-config | - | 获取所有运行时配置 | ✅ 已使用 |
| GET | /api/runtime-config/definitions | - | 获取配置项定义 | ✅ 已使用 |
| GET | /api/runtime-config/{key} | Param: {key} | 获取单个配置项 | ✅ 已使用 |
| PUT | /api/runtime-config/{key} | Param: {key}, Body: UpdateRuntimeConfigDto | 更新配置项 | ✅ 已使用 |
| POST | /api/runtime-config/{key}/reset | Param: {key} | 重置配置为默认值 | ✅ 已使用 |

**Controller**: `runtime-config.controller.ts` (路由前缀: `/runtime-config`)

---

### 1.18 模块：policy-config（权限策略配置）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| POST | /api/policy-config | Body: CreatePolicyDto | 创建策略配置 | ❌ 待删除 |
| PUT | /api/policy-config/{id} | Param: {id}, Body: UpdatePolicyDto | 更新策略配置 | ❌ 待删除 |
| DELETE | /api/policy-config/{id} | Param: {id} | 删除策略配置 | ❌ 待删除 |
| GET | /api/policy-config/{id} | Param: {id} | 获取策略配置 | ❌ 待删除 |
| GET | /api/policy-config | - | 获取所有策略配置 | ❌ 待删除 |
| PUT | /api/policy-config/{id}/enable | Param: {id} | 启用策略配置 | ❌ 待删除 |
| PUT | /api/policy-config/{id}/disable | Param: {id} | 禁用策略配置 | ❌ 待删除 |

**Controller**: `policy-config.controller.ts` (路由前缀: `/policy-config`)

---

### 1.19 模块：app（应用根）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | / | - | 应用根路径 | ❌ 已废弃 |

**Controller**: `app.controller.ts` (路由前缀: `/`)

---

## 二、API 统计摘要

### 2.1 按模块统计

| 模块 | 总接口数 | 已使用 | 预留 | 待删除/废弃 |
|------|----------|--------|------|-------------|
| auth | 32 | 32 | 0 | 0 |
| session | 3 | 0 | 0 | 3 |
| users | 16 | 13 | 1 | 2 |
| roles | 19 | 15 | 0 | 4 |
| file-system | 39 | 21 | 0 | 18 |
| library | 27 | 27 | 0 | 0 |
| version-control | 2 | 2 | 0 | 0 |
| mxcad | 16 | 13 | 0 | 3 |
| admin | 7 | 3 | 0 | 4 |
| public-file | 9 | 8 | 0 | 1 |
| fonts | 4 | 4 | 0 | 0 |
| health | 4 | 4 | 0 | 0 |
| audit | 4 | 4 | 0 | 0 |
| cache-monitor | 21 | 0 | 21 | 0 |
| cache | 5 | 0 | 0 | 5 |
| user-cleanup | 2 | 2 | 0 | 0 |
| runtime-config | 6 | 6 | 0 | 0 |
| policy-config | 7 | 0 | 0 | 7 |
| app | 1 | 0 | 0 | 1 |
| **总计** | **224** | **154** | **22** | **48** |

### 2.2 接口状态说明

- **✅ 已使用**: 前端代码中确认调用
- **⚠️ 预留**: 前端未调用但建议保留（监控、备用功能）
- **❌ 待删除**: 前端未调用，建议删除
- **❌ 已废弃**: 已被替代或完全未使用

---

## 三、废弃接口清单

### 3.1 确认废弃（可直接删除）

| 模块 | 接口路径 | 废弃原因 |
|------|---------|---------|
| session | POST /api/session/create | Session 模块已被 JWT 认证替代 |
| session | GET /api/session/user | Session 模块已被 JWT 认证替代 |
| session | POST /api/session/destroy | Session 模块已被 JWT 认证替代 |
| app | GET / | 应用根路径无实际功能 |

### 3.2 建议删除的端点（共 44 个）

#### 用户 & 角色模块 (6个)
- PATCH /api/users/{id}/status
- POST /api/users/me/restore
- GET /api/roles/category/{category}
- GET /api/roles/project-roles/{id}
- GET /api/roles/project-roles/{id}/permissions

#### 文件系统模块 (13个)
- GET /api/file-system/personal-space/by-user/{userId}
- GET /api/file-system/projects/trash
- PATCH /api/file-system/projects/{projectId}
- DELETE /api/file-system/projects/{projectId}
- GET /api/file-system/projects/{projectId}/trash
- POST /api/file-system/nodes/{nodeId}/restore
- DELETE /api/file-system/projects/{projectId}/trash
- POST /api/file-system/nodes
- POST /api/file-system/nodes/{parentId}/folders
- GET /api/file-system/nodes/{nodeId}/root
- POST /api/file-system/files/upload
- POST /api/file-system/projects/{projectId}/transfer
- POST /api/file-system/projects/{projectId}/members/batch
- PATCH /api/file-system/projects/{projectId}/members/batch

#### MxCAD 模块 (3个)
- GET /api/mxcad/thumbnail/{nodeId}
- POST /api/mxcad/thumbnail/{nodeId}
- GET /api/mxcad/files/{storageKey}

#### 管理员模块 (4个)
- GET /api/admin/permissions/cache
- POST /api/admin/permissions/cache/cleanup
- DELETE /api/admin/permissions/cache/user/{userId}
- GET /api/admin/permissions/user/{userId}

#### 公共文件模块 (1个)
- GET /api/public-file/access/{filename}

#### 缓存操作模块 (5个)
- GET /api/cache/stats
- POST /api/cache/clear
- POST /api/cache/warmup
- POST /api/cache/warmup/user/{userId}
- POST /api/cache/warmup/project/{projectId}

#### 策略配置模块 (7个)
- POST /api/policy-config
- PUT /api/policy-config/{id}
- DELETE /api/policy-config/{id}
- GET /api/policy-config/{id}
- GET /api/policy-config
- PUT /api/policy-config/{id}/enable
- PUT /api/policy-config/{id}/disable

---

## 四、前端主要调用页面

| 模块 | 调用页面 | 接口数量 |
|------|---------|---------|
| 用户管理 | UserManagement.tsx | 13 |
| 角色管理 | RoleManagement.tsx | 15 |
| 系统监控 | SystemMonitorPage.tsx | 7 |
| 审计日志 | AuditLogPage.tsx | 4 |
| 字体管理 | FontLibrary.tsx | 4 |
| 运行时配置 | RuntimeConfigPage.tsx + UserManagement.tsx | 7 |
| 用户清理 | UserManagement.tsx | 2 |
| 文件系统(回收站) | - | 4 |
| 文件系统(配额) | UserManagement.tsx | 2 |
| Dashboard | Dashboard.tsx | 1 |
| Profile | Profile.tsx | 1 |
| LibraryManager | LibraryManager.tsx | 14 |

---

## 五、后端定时任务分析

后端定时任务直接调用内部 Service 层方法，不经过 API 接口：

1. **StorageCleanupScheduler**: 执行存储清理任务，直接调用 `StorageCleanupService`
2. **CacheCleanupScheduler**: 执行缓存清理任务，直接调用 `PermissionCacheService` 和 `CacheMonitorService`
3. **UserCleanupScheduler**: 执行用户清理任务，直接调用 `UserCleanupService`
4. **CacheWarmupService**: 执行缓存预热任务，直接调用内部 Service 方法

---

## 六、文档整合说明

本文档由以下三份文档整合而成：

1. **api-inventory.md** - 提供完整的 API 接口清单（19 个 Controller）
2. **api-final-status.md** - 提供 API 状态追踪（确认使用/废弃/待定）
3. **api-trace-results.md** - 提供前端调用追踪结果

### 整合原则

- 以 `api-inventory.md` 为基础框架
- 使用 `api-final-status.md` 的状态分类
- 采用 `api-trace-results.md` 的前端调用位置信息
- 移除重复内容，统一状态标识

---

**文档版本：** 1.0（整合版）
**最后更新：** 2026-05-02
