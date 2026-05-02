# CloudCAD API 接口清单

> 生成时间: 2026-05-02
> 后端地址: `packages/backend/src/`
> 共扫描 19 个 Controller 文件

---

## 模块：auth（认证）

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

## 模块：session（会话）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| POST | /api/session/create | Body: {user: {id, email, username, role}} | 设置用户Session | ⚠️ 可能废弃 |
| GET | /api/session/user | - | 获取当前Session用户信息 | ⚠️ 可能废弃 |
| POST | /api/session/destroy | - | 清除Session | ⚠️ 可能废弃 |

**Controller**: `session.controller.ts` (路由前缀: `/session`)
**状态说明**: Session Controller 未被前端使用，可能已被 JWT 认证替代

---

## 模块：users（用户管理）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| POST | /api/users | Body: CreateUserDto | 创建用户 | ⚠️ 可能废弃 |
| GET | /api/users | Query: QueryUsersDto | 获取用户列表 | ⚠️ 可能废弃 |
| GET | /api/users/search/by-email | Query: {email} | 根据邮箱搜索用户 | ⚠️ 可能废弃 |
| GET | /api/users/search | Query: QueryUsersDto | 搜索用户 | ⚠️ 可能废弃 |
| GET | /api/users/profile/me | - | 获取当前用户信息 | ✅ 已使用 |
| GET | /api/users/stats/me | - | 获取当前用户仪表盘统计 | ⚠️ 可能废弃 |
| PATCH | /api/users/profile/me | Body: UpdateUserDto | 更新当前用户信息 | ✅ 已使用 |
| GET | /api/users/{id} | Param: {id} | 根据ID获取用户 | ⚠️ 可能废弃 |
| PATCH | /api/users/{id} | Param: {id}, Body: UpdateUserDto | 更新用户 | ⚠️ 可能废弃 |
| DELETE | /api/users/{id} | Param: {id} | 注销用户账户（软删除） | ⚠️ 可能废弃 |
| POST | /api/users/{id}/delete-immediately | Param: {id} | 立即注销用户 | ⚠️ 可能废弃 |
| POST | /api/users/{id}/restore | Param: {id} | 恢复已注销用户 | ⚠️ 可能废弃 |
| PATCH | /api/users/{id}/status | Param: {id}, Body: {status} | 更新用户状态 | ⚠️ 可能废弃 |
| POST | /api/users/deactivate-account | Body: {password, phoneCode?, emailCode?, wechatConfirm?} | 注销用户账户 | ⚠️ 可能废弃 |
| POST | /api/users/me/restore | Body: {verificationMethod, code} | 恢复已注销账户 | ⚠️ 可能废弃 |
| POST | /api/users/change-password | Body: {oldPassword, newPassword} | 修改密码 | ✅ 已使用 |

**Controller**: `users.controller.ts` (路由前缀: `/users`)

---

## 模块：roles（角色管理）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/roles | - | 获取所有角色 | ⚠️ 可能废弃 |
| GET | /api/roles/category/{category} | Param: {category} | 根据类别获取角色 | ⚠️ 可能废弃 |
| GET | /api/roles/{id} | Param: {id} | 根据ID获取角色 | ⚠️ 可能废弃 |
| GET | /api/roles/{id}/permissions | Param: {id} | 获取角色所有权限 | ⚠️ 可能废弃 |
| POST | /api/roles/{id}/permissions | Param: {id}, Body: {permissions[]} | 为角色分配权限 | ⚠️ 可能废弃 |
| DELETE | /api/roles/{id}/permissions | Param: {id}, Body: {permissions[]} | 从角色移除权限 | ⚠️ 可能废弃 |
| POST | /api/roles | Body: CreateRoleDto | 创建新角色 | ⚠️ 可能废弃 |
| PATCH | /api/roles/{id} | Param: {id}, Body: UpdateRoleDto | 更新角色 | ⚠️ 可能废弃 |
| DELETE | /api/roles/{id} | Param: {id} | 删除角色 | ⚠️ 可能废弃 |
| GET | /api/roles/project-roles/all | - | 获取所有项目角色 | ✅ 已使用 |
| GET | /api/roles/project-roles/system | - | 获取系统默认项目角色 | ✅ 已使用 |
| GET | /api/roles/project-roles/project/{projectId} | Param: {projectId} | 获取特定项目角色列表 | ✅ 已使用 |
| GET | /api/roles/project-roles/{id} | Param: {id} | 获取项目角色详情 | ⚠️ 可能废弃 |
| GET | /api/roles/project-roles/{id}/permissions | Param: {id} | 获取项目角色权限 | ⚠️ 可能废弃 |
| POST | /api/roles/project-roles | Body: CreateProjectRoleDto | 创建项目角色 | ⚠️ 可能废弃 |
| PATCH | /api/roles/project-roles/{id} | Param: {id}, Body: UpdateProjectRoleDto | 更新项目角色 | ⚠️ 可能废弃 |
| DELETE | /api/roles/project-roles/{id} | Param: {id} | 删除项目角色 | ⚠️ 可能废弃 |
| POST | /api/roles/project-roles/{id}/permissions | Param: {id}, Body: PermissionsDto | 为项目角色分配权限 | ⚠️ 可能废弃 |
| DELETE | /api/roles/project-roles/{id}/permissions | Param: {id}, Body: PermissionsDto | 从项目角色移除权限 | ⚠️ 可能废弃 |

**Controller**: `roles.controller.ts` (路由前缀: `/roles`)

---

## 模块：file-system（文件系统）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| POST | /api/file-system/projects | Body: CreateProjectDto | 创建项目 | ✅ 已使用 |
| GET | /api/file-system/projects | Query: QueryProjectsDto | 获取项目列表 | ✅ 已使用 |
| GET | /api/file-system/personal-space | - | 获取当前用户私人空间 | ✅ 已使用 |
| GET | /api/file-system/personal-space/by-user/{userId} | Param: {userId} | 获取指定用户私人空间 | ⚠️ 可能废弃 |
| GET | /api/file-system/projects/trash | Query: QueryProjectsDto | 获取已删除项目列表 | ⚠️ 可能废弃 |
| GET | /api/file-system/projects/{projectId} | Param: {projectId} | 获取项目详情 | ✅ 已使用 |
| PATCH | /api/file-system/projects/{projectId} | Param: {projectId}, Body: UpdateNodeDto | 更新项目信息 | ⚠️ 可能废弃 |
| DELETE | /api/file-system/projects/{projectId} | Query: {permanently?} | 删除项目 | ⚠️ 可能废弃 |
| GET | /api/file-system/trash | - | 获取回收站列表 | ⚠️ 可能废弃 |
| POST | /api/file-system/trash/restore | Body: {itemIds[]} | 恢复回收站项目 | ⚠️ 可能废弃 |
| DELETE | /api/file-system/trash/items | Body: {itemIds[]} | 永久删除回收站项目 | ⚠️ 可能废弃 |
| DELETE | /api/file-system/trash | - | 清空回收站 | ⚠️ 可能废弃 |
| GET | /api/file-system/projects/{projectId}/trash | Param: {projectId}, Query: QueryChildrenDto | 获取项目内回收站 | ⚠️ 可能废弃 |
| POST | /api/file-system/nodes/{nodeId}/restore | Param: {nodeId} | 恢复已删除节点 | ⚠️ 可能废弃 |
| DELETE | /api/file-system/projects/{projectId}/trash | Param: {projectId} | 清空项目回收站 | ⚠️ 可能废弃 |
| POST | /api/file-system/nodes | Body: CreateNodeDto | 创建节点 | ⚠️ 可能废弃 |
| POST | /api/file-system/nodes/{parentId}/folders | Param: {parentId}, Body: CreateFolderDto | 创建文件夹 | ⚠️ 可能废弃 |
| GET | /api/file-system/nodes/{nodeId} | Param: {nodeId} | 获取节点详情 | ✅ 已使用 |
| GET | /api/file-system/nodes/{nodeId}/root | Param: {nodeId} | 获取根节点 | ⚠️ 可能废弃 |
| GET | /api/file-system/nodes/{nodeId}/children | Param: {nodeId}, Query: QueryChildrenDto | 获取子节点列表 | ✅ 已使用 |
| PATCH | /api/file-system/nodes/{nodeId} | Param: {nodeId}, Body: UpdateNodeDto | 更新节点 | ✅ 已使用 |
| DELETE | /api/file-system/nodes/{nodeId} | Param: {nodeId}, Body/Query: {permanently?} | 删除节点 | ✅ 已使用 |
| POST | /api/file-system/nodes/{nodeId}/move | Param: {nodeId}, Body: MoveNodeDto | 移动节点 | ✅ 已使用 |
| POST | /api/file-system/nodes/{nodeId}/copy | Param: {nodeId}, Body: CopyNodeDto | 复制节点 | ✅ 已使用 |
| POST | /api/file-system/files/upload | Body: UploadFileDto | 上传文件 | ⚠️ 可能废弃 |
| GET | /api/file-system/quota | Query: {nodeId?} | 获取存储配额信息 | ⚠️ 可能废弃 |
| POST | /api/file-system/quota/update | Body: UpdateStorageQuotaDto | 更新节点存储配额 | ⚠️ 可能废弃 |
| GET | /api/file-system/projects/{projectId}/members | Param: {projectId} | 获取项目成员列表 | ✅ 已使用 |
| POST | /api/file-system/projects/{projectId}/members | Param: {projectId}, Body: {userId, projectRoleId} | 添加项目成员 | ✅ 已使用 |
| PATCH | /api/file-system/projects/{projectId}/members/{userId} | Param: {projectId, userId}, Body: UpdateProjectMemberDto | 更新项目成员角色 | ✅ 已使用 |
| DELETE | /api/file-system/projects/{projectId}/members/{userId} | Param: {projectId, userId} | 移除项目成员 | ✅ 已使用 |
| POST | /api/file-system/projects/{projectId}/transfer | Param: {projectId}, Body: {newOwnerId} | 转移项目所有权 | ⚠️ 可能废弃 |
| POST | /api/file-system/projects/{projectId}/members/batch | Param: {projectId}, Body: {members[]} | 批量添加项目成员 | ⚠️ 可能废弃 |
| PATCH | /api/file-system/projects/{projectId}/members/batch | Param: {projectId}, Body: {updates[]} | 批量更新项目成员角色 | ⚠️ 可能废弃 |
| GET | /api/file-system/nodes/{nodeId}/thumbnail | Param: {nodeId} | 获取文件节点缩略图 | ✅ 已使用 |
| GET | /api/file-system/nodes/{nodeId}/download | Param: {nodeId} | 下载节点 | ✅ 已使用 |
| GET | /api/file-system/nodes/{nodeId}/download-with-format | Param: {nodeId}, Query: {format, width, height, colorPolicy} | 下载节点（支持格式转换） | ✅ 已使用 |
| GET | /api/file-system/projects/{projectId}/permissions | Param: {projectId} | 获取用户在项目中的权限列表 | ✅ 已使用 |
| GET | /api/file-system/projects/{projectId}/permissions/check | Param: {projectId}, Query: {permission} | 检查用户是否具有特定权限 | ✅ 已使用 |
| GET | /api/file-system/projects/{projectId}/role | Param: {projectId} | 获取用户在项目中的角色 | ✅ 已使用 |
| GET | /api/file-system/search | Query: SearchDto | 统一搜索接口 | ✅ 已使用 |

**Controller**: `file-system.controller.ts` (路由前缀: `/file-system`)

---

## 模块：library（公共资源库）

### 图纸库 (drawing)

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/library/drawing | - | 获取图纸库详情 | ✅ 已使用 |
| GET | /api/library/drawing/children/{nodeId} | Param: {nodeId}, Query: QueryChildrenDto | 获取图纸库子节点列表 | ✅ 已使用 |
| GET | /api/library/drawing/all-files/{nodeId} | Param: {nodeId}, Query: QueryChildrenDto | 递归获取图纸库节点下所有文件 | ✅ 已使用 |
| GET | /api/library/drawing/filesData/*path | Path: *path | 获取图纸库文件（统一入口） | ✅ 已使用 |
| GET | /api/library/drawing/nodes/{nodeId} | Param: {nodeId} | 获取图纸库节点详情 | ✅ 已使用 |
| GET | /api/library/drawing/nodes/{nodeId}/download | Param: {nodeId} | 下载图纸库文件 | ⚠️ 可能废弃 |
| GET | /api/library/drawing/nodes/{nodeId}/thumbnail | Param: {nodeId} | 获取图纸库文件缩略图 | ✅ 已使用 |
| POST | /api/library/drawing/folders | Body: CreateFolderDto | 创建图纸库文件夹 | ⚠️ 可能废弃 |
| POST | /api/library/drawing/upload | Body/Form: UploadFilesDto | 上传图纸库文件 | ⚠️ 可能废弃 |
| POST | /api/library/drawing/files/upload-chunk | Body/Form: UploadFilesDto | 上传图纸库文件（分片） | ⚠️ 可能废弃 |
| DELETE | /api/library/drawing/nodes/{nodeId} | Param: {nodeId}, Query: {permanently} | 删除图纸库节点 | ⚠️ 可能废弃 |
| PATCH | /api/library/drawing/nodes/{nodeId} | Param: {nodeId}, Body: UpdateNodeDto | 重命名图纸库节点 | ⚠️ 可能废弃 |
| POST | /api/library/drawing/nodes/{nodeId}/move | Param: {nodeId}, Body: MoveNodeDto | 移动图纸库节点 | ⚠️ 可能废弃 |
| POST | /api/library/drawing/nodes/{nodeId}/copy | Param: {nodeId}, Body: MoveNodeDto | 复制图纸库节点 | ⚠️ 可能废弃 |
| POST | /api/library/drawing/save/{nodeId} | Param: {nodeId}, Form: {file, commitMessage?} | 保存图纸到图纸库 | ⚠️ 可能废弃 |
| POST | /api/library/drawing/save-as | Form: SaveLibraryAsDto | 另存为图纸到图纸库 | ⚠️ 可能废弃 |

### 图块库 (block)

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/library/block | - | 获取图块库详情 | ✅ 已使用 |
| GET | /api/library/block/children/{nodeId} | Param: {nodeId}, Query: QueryChildrenDto | 获取图块库子节点列表 | ✅ 已使用 |
| GET | /api/library/block/all-files/{nodeId} | Param: {nodeId}, Query: QueryChildrenDto | 递归获取图块库节点下所有文件 | ✅ 已使用 |
| GET | /api/library/block/filesData/*path | Path: *path | 获取图块库文件（统一入口） | ✅ 已使用 |
| GET | /api/library/block/nodes/{nodeId} | Param: {nodeId} | 获取图块库节点详情 | ✅ 已使用 |
| GET | /api/library/block/nodes/{nodeId}/download | Param: {nodeId} | 下载图块库文件 | ⚠️ 可能废弃 |
| GET | /api/library/block/nodes/{nodeId}/thumbnail | Param: {nodeId} | 获取图块库文件缩略图 | ✅ 已使用 |
| POST | /api/library/block/files/upload-chunk | Body/Form: UploadFilesDto | 上传图块库文件（分片） | ⚠️ 可能废弃 |
| DELETE | /api/library/block/nodes/{nodeId} | Param: {nodeId}, Query: {permanently} | 删除图块库节点 | ⚠️ 可能废弃 |
| PATCH | /api/library/block/nodes/{nodeId} | Param: {nodeId}, Body: UpdateNodeDto | 重命名图块库节点 | ⚠️ 可能废弃 |
| POST | /api/library/block/nodes/{nodeId}/move | Param: {nodeId}, Body: MoveNodeDto | 移动图块库节点 | ⚠️ 可能废弃 |
| POST | /api/library/block/nodes/{nodeId}/copy | Param: {nodeId}, Body: MoveNodeDto | 复制图块库节点 | ⚠️ 可能废弃 |
| POST | /api/library/block/folders | Body: CreateFolderDto | 创建图块库文件夹 | ⚠️ 可能废弃 |
| POST | /api/library/block/upload | Body/Form: UploadFilesDto | 上传图块库文件 | ⚠️ 可能废弃 |
| POST | /api/library/block/save/{nodeId} | Param: {nodeId}, Form: {file, commitMessage?} | 保存图块到图块库 | ⚠️ 可能废弃 |
| POST | /api/library/block/save-as | Form: SaveLibraryAsDto | 另存为图块到图块库 | ⚠️ 可能废弃 |

**Controller**: `library.controller.ts` (路由前缀: `/library`)

---

## 模块：version-control（版本控制）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/version-control/history | Query: {projectId, filePath, limit?} | 获取节点SVN提交历史 | ✅ 已使用 |
| GET | /api/version-control/file/{revision} | Param: {revision}, Query: {projectId, filePath} | 获取指定版本的文件内容 | ✅ 已使用 |

**Controller**: `version-control.controller.ts` (路由前缀: `/version-control`)

---

## 模块：mxcad（CAD文件处理）

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
| GET | /api/mxcad/thumbnail/{nodeId} | Param: {nodeId} | 查询缩略图是否存在 | ⚠️ 可能废弃 |
| POST | /api/mxcad/thumbnail/{nodeId} | Param: {nodeId}, Form: {file} | 上传缩略图 | ⚠️ 可能废弃 |
| GET | /api/mxcad/files/{storageKey} | Param: {storageKey} | 访问非CAD文件 | ⚠️ 可能废弃 |
| GET | /api/mxcad/filesData/*path | Path: *path, Query: {v?} | 访问filesData目录中的文件 | ✅ 已使用 |
| GET | /api/mxcad/file/*path | Path: *path | 访问转换后的mxweb文件 | ✅ 已使用 |

**Controller**: `mxcad.controller.ts` (路由前缀: `/mxcad`)

---

## 模块：admin（管理员）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/admin/stats | - | 获取管理员统计信息 | ⚠️ 可能废弃 |
| GET | /api/admin/permissions/cache | - | 获取权限缓存统计 | ⚠️ 可能废弃 |
| POST | /api/admin/permissions/cache/cleanup | - | 清理权限缓存 | ⚠️ 可能废弃 |
| DELETE | /api/admin/permissions/cache/user/{userId} | Param: {userId} | 清除用户权限缓存 | ⚠️ 可能废弃 |
| GET | /api/admin/permissions/user/{userId} | Param: {userId} | 获取用户权限信息 | ⚠️ 可能废弃 |
| POST | /api/admin/storage/cleanup | Query: {delayDays?} | 手动触发存储清理 | ⚠️ 可能废弃 |
| GET | /api/admin/storage/cleanup/stats | - | 获取待清理存储统计 | ⚠️ 可能废弃 |

**Controller**: `admin.controller.ts` (路由前缀: `/admin`)
**状态说明**: 管理员接口仅供后台管理系统使用，前端未直接调用

---

## 模块：public-file（公开文件服务）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| POST | /api/public-file/chunk/check | Body: CheckChunkDto | 检查分片是否存在 | ✅ 已使用 |
| POST | /api/public-file/file/check | Body: CheckFileDto | 检查文件是否已存在 | ✅ 已使用 |
| POST | /api/public-file/chunk/upload | Body/Form: {hash, chunk, chunks, file} | 上传分片 | ✅ 已使用 |
| POST | /api/public-file/chunk/merge | Body: MergeChunksDto | 合并分片并获取文件访问信息 | ✅ 已使用 |
| GET | /api/public-file/access/{hash}/{filename} | Param: {hash, filename} | 通过文件哈希访问目录下的文件 | ⚠️ 可能废弃 |
| GET | /api/public-file/access/{filename} | Param: {filename} | 在uploads目录下查找mxweb文件 | ⚠️ 可能废弃 |
| POST | /api/public-file/ext-reference/upload | Body/Form: UploadExtReferenceDto | 上传外部参照文件（公开接口） | ✅ 已使用 |
| GET | /api/public-file/ext-reference/check | Query: {srcHash, fileName} | 检查外部参照文件是否存在 | ✅ 已使用 |
| GET | /api/public-file/preloading/{hash} | Param: {hash} | 获取预加载数据 | ✅ 已使用 |

**Controller**: `public-file.controller.ts` (路由前缀: `/public-file`)

---

## 模块：fonts（字体管理）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/font-management | Query: {location?} | 获取字体列表 | ⚠️ 可能废弃 |
| POST | /api/font-management/upload | Form: {file, target?} | 上传字体文件 | ⚠️ 可能废弃 |
| DELETE | /api/font-management/{fileName} | Param: {fileName}, Query: {target?} | 删除字体文件 | ⚠️ 可能废弃 |
| GET | /api/font-management/download/{fileName} | Param: {fileName}, Query: {location} | 下载字体文件 | ⚠️ 可能废弃 |

**Controller**: `fonts.controller.ts` (路由前缀: `/font-management`)
**状态说明**: 字体管理接口未被前端直接调用

---

## 模块：health（健康检查）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/health/live | - | 存活检查（Docker健康检查） | ✅ 已使用 |
| GET | /api/health | - | 系统健康检查 | ⚠️ 可能废弃 |
| GET | /api/health/db | - | 数据库健康检查 | ⚠️ 可能废弃 |
| GET | /api/health/storage | - | 存储服务健康检查 | ⚠️ 可能废弃 |

**Controller**: `health.controller.ts` (路由前缀: `/health`)

---

## 模块：audit（审计日志）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/audit/logs | Query: {userId?, action?, resourceType?, startDate?, endDate?, success?, page?, limit?} | 查询审计日志 | ⚠️ 可能废弃 |
| GET | /api/audit/logs/{id} | Param: {id} | 获取审计日志详情 | ⚠️ 可能废弃 |
| GET | /api/audit/statistics | Query: {startDate?, endDate?, userId?} | 获取审计统计信息 | ⚠️ 可能废弃 |
| POST | /api/audit/cleanup | Body: {daysToKeep} | 清理旧审计日志 | ⚠️ 可能废弃 |

**Controller**: `audit-log.controller.ts` (路由前缀: `/audit`)
**状态说明**: 审计日志接口未被前端直接调用

---

## 模块：cache-monitor（缓存监控）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/cache-monitor/summary | - | 获取缓存监控摘要 | ⚠️ 可能废弃 |
| GET | /api/cache-monitor/stats | Query: {level?, includeHotData?, includePerformance?} | 获取缓存统计信息 | ⚠️ 可能废弃 |
| GET | /api/cache-monitor/health | - | 获取缓存健康状态 | ⚠️ 可能废弃 |
| GET | /api/cache-monitor/performance | - | 获取缓存性能指标 | ⚠️ 可能废弃 |
| GET | /api/cache-monitor/hot-data | Query: {limit?} | 获取热点数据 | ⚠️ 可能废弃 |
| GET | /api/cache-monitor/performance-trend | Query: {level, minutes?} | 获取性能趋势 | ⚠️ 可能废弃 |
| GET | /api/cache-monitor/size-trend | Query: {minutes?} | 获取缓存大小趋势 | ⚠️ 可能废弃 |
| GET | /api/cache-monitor/warnings | - | 获取缓存警告 | ⚠️ 可能废弃 |
| GET | /api/cache-monitor/value | Query: {key} | 获取缓存值 | ⚠️ 可能废弃 |
| POST | /api/cache-monitor/value | Body: CacheOperationDto | 设置缓存值 | ⚠️ 可能废弃 |
| DELETE | /api/cache-monitor/value | Query: {key} | 删除缓存 | ⚠️ 可能废弃 |
| DELETE | /api/cache-monitor/values | Body: {keys[]} | 批量删除缓存 | ⚠️ 可能废弃 |
| DELETE | /api/cache-monitor/pattern | Query: {pattern} | 根据模式删除缓存 | ⚠️ 可能废弃 |
| POST | /api/cache-monitor/refresh | Body: {key} | 刷新缓存 | ⚠️ 可能废弃 |
| POST | /api/cache-monitor/cleanup | Body: {pattern?, level?} | 清理缓存 | ⚠️ 可能废弃 |
| GET | /api/cache-monitor/warmup/config | - | 获取预热配置 | ⚠️ 可能废弃 |
| POST | /api/cache-monitor/warmup/config | Body: UpdateWarmupConfigDto | 更新预热配置 | ⚠️ 可能废弃 |
| POST | /api/cache-monitor/warmup/trigger | Body: TriggerWarmupDto? | 触发预热 | ⚠️ 可能废弃 |
| GET | /api/cache-monitor/warmup/history | - | 获取预热历史 | ⚠️ 可能废弃 |
| GET | /api/cache-monitor/warmup/stats | - | 获取预热统计 | ⚠️ 可能废弃 |
| DELETE | /api/cache-monitor/warmup/history | - | 清除预热历史 | ⚠️ 可能废弃 |

**Controller**: `cache-monitor.controller.ts` (路由前缀: `/cache-monitor`)
**状态说明**: 缓存监控接口未被前端直接调用

---

## 模块：cache（Redis缓存）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/cache/stats | - | 获取缓存统计信息 | ⚠️ 可能废弃 |
| POST | /api/cache/clear | - | 清理所有缓存 | ⚠️ 可能废弃 |
| POST | /api/cache/warmup | - | 手动触发缓存预热 | ⚠️ 可能废弃 |
| POST | /api/cache/warmup/user/{userId} | Param: {userId} | 预热指定用户的缓存 | ⚠️ 可能废弃 |
| POST | /api/cache/warmup/project/{projectId} | Param: {projectId} | 预热指定项目的缓存 | ⚠️ 可能废弃 |

**Controller**: `common/controllers/cache-monitor.controller.ts` (路由前缀: `/cache`)
**状态说明**: Redis缓存接口未被前端直接调用

---

## 模块：user-cleanup（用户清理）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/user-cleanup/stats | - | 获取待清理用户统计 | ⚠️ 可能废弃 |
| POST | /api/user-cleanup/trigger | Body: {delayDays?} | 手动触发用户数据清理 | ⚠️ 可能废弃 |

**Controller**: `user-cleanup.controller.ts` (路由前缀: `/user-cleanup`)
**状态说明**: 用户清理接口未被前端直接调用

---

## 模块：runtime-config（运行时配置）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | /api/runtime-config/public | - | 获取公开配置（前端初始化使用） | ⚠️ 可能废弃 |
| GET | /api/runtime-config | - | 获取所有运行时配置 | ⚠️ 可能废弃 |
| GET | /api/runtime-config/definitions | - | 获取配置项定义 | ⚠️ 可能废弃 |
| GET | /api/runtime-config/{key} | Param: {key} | 获取单个配置项 | ⚠️ 可能废弃 |
| PUT | /api/runtime-config/{key} | Param: {key}, Body: UpdateRuntimeConfigDto | 更新配置项 | ⚠️ 可能废弃 |
| POST | /api/runtime-config/{key}/reset | Param: {key} | 重置配置为默认值 | ⚠️ 可能废弃 |

**Controller**: `runtime-config.controller.ts` (路由前缀: `/runtime-config`)
**状态说明**: 运行时配置接口未被前端直接调用

---

## 模块：policy-config（权限策略配置）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| POST | /api/policy-config | Body: CreatePolicyDto | 创建策略配置 | ⚠️ 可能废弃 |
| PUT | /api/policy-config/{id} | Param: {id}, Body: UpdatePolicyDto | 更新策略配置 | ⚠️ 可能废弃 |
| DELETE | /api/policy-config/{id} | Param: {id} | 删除策略配置 | ⚠️ 可能废弃 |
| GET | /api/policy-config/{id} | Param: {id} | 获取策略配置 | ⚠️ 可能废弃 |
| GET | /api/policy-config | - | 获取所有策略配置 | ⚠️ 可能废弃 |
| PUT | /api/policy-config/{id}/enable | Param: {id} | 启用策略配置 | ⚠️ 可能废弃 |
| PUT | /api/policy-config/{id}/disable | Param: {id} | 禁用策略配置 | ⚠️ 可能废弃 |

**Controller**: `policy-config.controller.ts` (路由前缀: `/policy-config`)
**状态说明**: 权限策略配置接口未被前端直接调用

---

## 模块：app（应用根）

| 方法 | 路径 | 参数 | 说明 | 状态 |
|------|------|------|------|------|
| GET | / | - | 应用根路径 | ⚠️ 可能废弃 |

**Controller**: `app.controller.ts` (路由前缀: `/`)

---

## 统计摘要

| 模块 | 总接口数 | 已使用 | 可能废弃 |
|------|----------|--------|----------|
| auth | 32 | 32 | 0 |
| session | 3 | 0 | 3 |
| users | 16 | 4 | 12 |
| roles | 19 | 4 | 15 |
| file-system | 39 | 21 | 18 |
| library | 34 | 13 | 21 |
| version-control | 2 | 2 | 0 |
| mxcad | 16 | 12 | 4 |
| admin | 7 | 0 | 7 |
| public-file | 9 | 7 | 2 |
| fonts | 4 | 0 | 4 |
| health | 4 | 1 | 3 |
| audit | 4 | 0 | 4 |
| cache-monitor | 21 | 0 | 21 |
| cache | 5 | 0 | 5 |
| user-cleanup | 2 | 0 | 2 |
| runtime-config | 6 | 0 | 6 |
| policy-config | 7 | 0 | 7 |
| app | 1 | 0 | 1 |
| **总计** | **231** | **96** | **135** |

---

## 状态说明

- **✅ 已使用**: 前端代码中确认调用
- **⚠️ 可能废弃**: 前端代码中未发现调用，可能已被替代或专门供后台系统使用

---

## 备注

1. 本清单基于 `packages/backend/src/` 目录下的所有 `.controller.ts` 文件扫描生成
2. 前端调用情况通过检查 `packages/frontend/src/` 中的 API 客户端定义和使用情况得出
3. "可能废弃"的接口需要进一步确认是否仍在其他场景使用（如其他服务、脚本、测试等）
4. 管理后台（如 admin、audit、cache-monitor 等模块）通常不通过前端主应用调用，可能有独立的管理界面
