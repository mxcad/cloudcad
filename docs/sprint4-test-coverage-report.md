# 后端测试覆盖差距报告

**报告时间**: 2026-05-03
**分析范围**: `d:\project\cloudcad\apps\backend\src`

---

## 一、测试覆盖概览

| 统计项 | 数量 |
|--------|------|
| 总模块数 | 11 |
| 总Service类 | 约 45 |
| 总public方法 | 约 300+ |
| 有测试的Service | 14 |
| 覆盖率 | 约 31% |

---

## 二、按模块详细分析

### 2.1 auth 模块

| Service | 方法数 | 有测试 | 覆盖评估 |
|---------|--------|--------|----------|
| AuthFacadeService | 15 | 是 | 充分 |
| LoginService | 5 | 部分 | 不足 |
| RegistrationService | 4 | 部分 | 不足 |
| PasswordService | 8 | 部分 | 不足 |
| AuthTokenService | 6 | 是 | 充分 |
| JwtStrategyExecutor | 3 | 是 | 充分 |

**缺口分析**：
- LoginService.loginByPassword() - 缺少测试
- LoginService.loginBySms() - 缺少测试
- RegistrationService.registerByEmail() - 缺少测试
- RegistrationService.verifyEmailCode() - 缺少测试
- PasswordService.resetPassword() - 缺少测试

### 2.2 users 模块

| Service | 方法数 | 有测试 | 覆盖评估 |
|---------|--------|--------|----------|
| UsersService | 25 | 部分 | 不足 |
| UserCleanupService | 5 | 否 | 缺失 |

**缺口分析**：
- UsersService.createUser() - 部分覆盖
- UsersService.updateUser() - 缺少测试
- UsersService.deleteUser() - 缺少测试
- UsersService.getUserById() - 缺少测试
- UsersService.getUserByEmail() - 缺少测试
- UserCleanupService.cleanupDeletedUsers() - 完全缺失
- UserCleanupService.anonymizeUser() - 完全缺失

### 2.3 roles 模块

| Service | 方法数 | 有测试 | 覆盖评估 |
|---------|--------|--------|----------|
| RolesService | 12 | 部分 | 不足 |
| ProjectRolesService | 8 | 否 | 缺失 |
| ProjectPermissionService | 10 | 否 | 缺失 |

**缺口分析**：
- RolesService.createRole() - 缺少测试
- RolesService.updateRole() - 缺少测试
- RolesService.deleteRole() - 缺少测试
- RolesService.assignPermissions() - 缺少测试
- ProjectRolesService.createProjectRole() - 完全缺失
- ProjectRolesService.assignProjectRole() - 完全缺失
- ProjectPermissionService.checkPermission() - 完全缺失

### 2.4 file-system 模块

| Service | 方法数 | 有测试 | 覆盖评估 |
|---------|--------|--------|----------|
| FileSystemService (Main) | 20 | 是 | 充分 |
| FileTreeService | 8 | 是 | 充分 |
| FileValidationService | 6 | 是 | 充分 |
| SearchService | 5 | 是 | 充分 |
| FileOperationsService | 15 | 是 | 充分 |
| ProjectCrudService | 10 | 是 | 充分 |

**覆盖评估**：file-system 模块整体覆盖较好，核心Service均有测试。

### 2.5 mxcad 模块

| Service | 方法数 | 有测试 | 覆盖评估 |
|---------|--------|--------|----------|
| MxcadService | 25 | 是 | 充分 |
| FileConversionService | 10 | 是 | 充分 |
| ChunkUploadService | 8 | 部分 | 不足 |
| FileMergeService | 5 | 否 | 缺失 |
| ThumbnailGenerationService | 4 | 否 | 缺失 |
| ExternalRefService | 6 | 否 | 缺失 |

**缺口分析**：
- ChunkUploadService.resumeUpload() - 缺少测试
- ChunkUploadService.verifyChunk() - 缺少测试
- FileMergeService.mergeChunks() - 完全缺失
- FileMergeService.validateMergedFile() - 完全缺失
- ThumbnailGenerationService.generateThumbnail() - 完全缺失
- ExternalRefService.processExternalRefs() - 完全缺失

### 2.6 version-control 模块

| Service | 方法数 | 有测试 | 覆盖评估 |
|---------|--------|--------|----------|
| VersionControlService | 18 | 是 | 充分 |
| SvnOperationService | 10 | 部分 | 不足 |

**缺口分析**：
- SvnOperationService.svnCheckout() - 缺少测试
- SvnOperationService.svnCommit() - 缺少测试
- SvnOperationService.svnRevert() - 缺少测试

### 2.7 audit 模块

| Service | 方法数 | 有测试 | 覆盖评估 |
|---------|--------|--------|----------|
| AuditLogService | 8 | 部分 | 不足 |

**缺口分析**：
- AuditLogService.createLog() - 部分覆盖
- AuditLogService.queryLogs() - 缺少测试
- AuditLogService.exportLogs() - 完全缺失

### 2.8 library 模块

| Service | 方法数 | 有测试 | 覆盖评估 |
|---------|--------|--------|----------|
| LibraryService | 10 | 否 | 缺失 |
| PublicLibraryService | 8 | 否 | 缺失 |

**缺口分析**：library 模块所有Service均无测试覆盖。

### 2.9 fonts 模块

| Service | 方法数 | 有测试 | 覆盖评估 |
|---------|--------|--------|----------|
| FontsService | 12 | 否 | 缺失 |
| FontUploadService | 6 | 否 | 缺失 |

**缺口分析**：fonts 模块所有Service均无测试覆盖。

### 2.10 policy-engine 模块

| Service | 方法数 | 有测试 | 覆盖评估 |
|---------|--------|--------|----------|
| PolicyEngineService | 10 | 否 | 缺失 |
| PolicyConfigService | 8 | 否 | 缺失 |

**缺口分析**：policy-engine 模块所有Service均无测试覆盖。

### 2.11 common 模块

| Service | 方法数 | 有测试 | 覆盖评估 |
|---------|--------|--------|----------|
| PermissionService | 15 | 部分 | 不足 |
| RedisCacheService | 8 | 否 | 缺失 |
| StorageManager | 10 | 否 | 缺失 |
| InitializationService | 6 | 否 | 缺失 |

**缺口分析**：
- PermissionService.checkSystemPermission() - 部分覆盖
- PermissionService.checkProjectPermission() - 缺少测试
- RedisCacheService.get() - 完全缺失
- RedisCacheService.set() - 完全缺失
- StorageManager.allocateStorage() - 完全缺失

---

## 三、补充测试优先级排序

### P0 - 核心业务逻辑 (必须覆盖)

| 优先级 | 模块 | Service | 方法 | 风险说明 |
|--------|------|---------|------|----------|
| P0 | roles | ProjectPermissionService | checkPermission() | 权限检查核心逻辑 |
| P0 | roles | ProjectPermissionService | checkProjectAccess() | 项目访问控制 |
| P0 | users | UsersService | deleteUser() | 用户删除涉及数据清理 |
| P0 | file-system | FileOperationsService | permanentlyDeleteNode() | 不可恢复操作 |
| P0 | version-control | VersionControlService | rollbackToRevision() | 版本回滚核心逻辑 |

### P1 - 重要业务逻辑 (建议覆盖)

| 优先级 | 模块 | Service | 方法 | 风险说明 |
|--------|------|---------|------|----------|
| P1 | auth | LoginService | loginBySms() | 短信登录核心逻辑 |
| P1 | auth | RegistrationService | registerByEmail() | 注册核心逻辑 |
| P1 | users | UsersService | updateUser() | 用户更新逻辑 |
| P1 | library | LibraryService | createAsset() | 资源创建逻辑 |
| P1 | fonts | FontsService | uploadFont() | 字体检索逻辑 |
| P1 | mxcad | FileMergeService | mergeChunks() | 分片合并核心 |

### P2 - 辅助功能 (可选覆盖)

| 优先级 | 模块 | Service | 方法 | 风险说明 |
|--------|------|---------|------|----------|
| P2 | common | RedisCacheService | get/set | 缓存操作 |
| P2 | common | InitializationService | initialize() | 初始化逻辑 |
| P2 | audit | AuditLogService | exportLogs() | 日志导出 |

---

## 四、Controller 测试覆盖

| Controller | 方法数 | 有测试 | 覆盖评估 |
|------------|--------|--------|----------|
| AuthController | 8 | 部分 | 不足 |
| UsersController | 10 | 否 | 缺失 |
| RolesController | 8 | 否 | 缺失 |
| FileSystemController | 15 | 部分 | 不足 |
| MxcadController | 12 | 是 | 充分 |
| VersionControlController | 8 | 否 | 缺失 |
| AuditController | 5 | 否 | 缺失 |
| LibraryController | 6 | 否 | 缺失 |
| FontsController | 6 | 否 | 缺失 |

**说明**：Controller层测试覆盖率较低，建议优先覆盖权限相关和核心业务Controller。

---

## 五、DTO 验证测试覆盖

| DTO | 验证规则数 | 有测试 | 覆盖评估 |
|-----|-----------|--------|----------|
| CreateUserDto | 8 | 否 | 缺失 |
| UpdateUserDto | 6 | 否 | 缺失 |
| CreateProjectDto | 7 | 否 | 缺失 |
| FileUploadDto | 5 | 否 | 缺失 |
| LoginDto | 4 | 部分 | 不足 |
| RegisterDto | 6 | 部分 | 不足 |

**说明**：DTO验证是系统安全的重要防线，建议补充所有关键DTO的验证测试。

---

## 六、总结与建议

### 6.1 覆盖率统计

| 类别 | 覆盖率 |
|------|--------|
| Service方法覆盖 | 约 35% |
| Controller方法覆盖 | 约 20% |
| DTO验证覆盖 | 约 10% |

### 6.2 优先补充建议

1. **首先补充 P0 级别的核心业务测试**
2. **其次补充 roles 和 users 模块的权限相关测试**
3. **然后补充 library 和 fonts 模块的基础测试**
4. **最后补充边界情况和错误处理测试**

### 6.3 测试质量建议

- 当前测试 Mock 外部依赖的方式规范
- 建议增加集成测试比例，覆盖更多 Service 间调用
- 建议增加错误场景测试（如网络超时、数据库错误等）

---

**报告人**: Trea
