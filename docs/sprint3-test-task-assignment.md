# Sprint 3 测试任务精确分配清单

**分支**: refactor/circular-deps
**生成日期**: 2026-05-02
**文档状态**: 初稿

---

## 一、测试文件现状总结

### 1.1 已有测试文件的 Service

| Service | spec 文件 | 状态 | 测试用例数 | 备注 |
|---------|-----------|------|-----------|------|
| FileOperationsService | `file-operations.service.spec.ts` | **已实现** | ~50 | 覆盖 checkNameUniqueness、deleteNode、restoreNode、moveNode、copyNode 等 |
| VersionControlService | `version-control.service.spec.ts` | **已实现** | 27 | 覆盖 isReady、commitNodeDirectory、getFileHistory 等 |
| FileValidationService | `file-validation.service.spec.ts` | 有结构 | - | Jest 白名单机制导致未执行 |
| ProjectCrudService | `project-crud.service.spec.ts` | 有结构，TODO | - | 需要完成实现 |
| FileConversionService | `file-conversion.service.spec.ts` | 有结构，TODO | - | 需要完成实现 |

### 1.2 未创建测试的 P0 Service

| Service | 行数 | 优先级 | 复杂度 |
|---------|------|--------|--------|
| UsersService | 1185 | **P0** | 🟡 中等 |
| AuthFacadeService | 1078 | **P0** | 🔴 高 |
| MxCadService | 864 | **P0** | 🔴 高 |

---

## 二、P0 Service 未覆盖方法详细清单

### 2.1 UsersService (1185 行)

**复杂度评估**: 🟡 中等
- **依赖数量**: 6 (Prisma, PermissionCacheService, UserCleanupService, ConfigService, RuntimeConfigService, 验证码服务)
- **Mock 难度**: 中等（bcrypt 加密需 mock，事务需特殊处理）
- **数据库操作**: 复杂（多表关联、事务、软删除）

| 方法名 | 功能描述 | 优先级 | 复杂度 | 测试用例预估 |
|--------|----------|--------|--------|-------------|
| `create` | 创建用户（含私人空间） | **P0** | 🟡 中等 | 8-10 |
| `findAll` | 查询用户列表 | **P0** | 🟢 简单 | 5-6 |
| `findOne` | 查询单个用户 | **P0** | 🟢 简单 | 3-4 |
| `update` | 更新用户信息 | **P0** | 🟡 中等 | 6-8 |
| `softDelete` | 软删除用户 | **P1** | 🟡 中等 | 4-5 |
| `deleteImmediately` | 立即物理删除用户 | **P1** | 🟡 中等 | 3-4 |
| `restore` | 恢复已删除用户 | **P1** | 🟢 简单 | 3-4 |
| `findByEmail` | 按邮箱查询 | **P0** | 🟢 简单 | 3-4 |
| `findByEmailWithPassword` | 按邮箱查询（含密码） | **P0** | 🟢 简单 | 2-3 |
| `findByPhone` | 按手机号查询 | **P0** | 🟢 简单 | 3-4 |
| `findByUsername` | 按用户名查询 | **P0** | 🟢 简单 | 2-3 |
| `updatePassword` | 更新密码 | **P0** | 🟡 中等 | 4-5 |
| `changePassword` | 修改密码 | **P0** | 🟡 中等 | 5-6 |
| `validatePassword` | 验证密码 | **P0** | 🟢 简单 | 2-3 |
| `getDashboardStats` | 获取仪表盘统计 | **P2** | 🟡 中等 | 4-5 |
| `deactivateAccount` | 注销账户（多验证方式） | **P1** | 🔴 高 | 6-8 |
| `restoreAccount` | 恢复已注销账户 | **P1** | 🟡 中等 | 4-5 |
| `updateStatus` | 更新用户状态 | **P1** | 🟢 简单 | 3-4 |
| `remove` | 物理删除用户 | **P2** | 🟢 简单 | 2-3 |

**AI 分配建议**: **Claude Code** (需要处理事务 mock、bcrypt、复杂业务逻辑)

---

### 2.2 AuthFacadeService (1078 行)

**复杂度评估**: 🔴 高
- **依赖数量**: 12+ (Prisma, JwtService, TokenBlacklistService, 多种验证服务, Redis, 多个子服务)
- **Mock 难度**: 高（微信 OAuth、短信/邮箱验证、Redis Session、JWT）
- **业务逻辑**: 复杂（多种登录方式、自动注册、第三方绑定）

| 方法名 | 功能描述 | 优先级 | 复杂度 | 测试用例预估 |
|--------|----------|--------|--------|-------------|
| `register` | 用户注册 | **P0** | 🟡 中等 | 5-7 |
| `verifyEmailAndActivate` | 邮箱验证激活 | **P0** | 🟡 中等 | 4-5 |
| `login` | 用户登录 | **P0** | 🟡 中等 | 5-7 |
| `loginByPhone` | 手机号验证码登录 | **P0** | 🟡 中等 | 6-8 |
| `registerByPhone` | 手机号注册 | **P0** | 🟡 中等 | 5-6 |
| `logout` | 用户登出 | **P0** | 🟢 简单 | 3-4 |
| `refreshToken` | 刷新 Token | **P0** | 🟡 中等 | 4-5 |
| `loginWithWechat` | 微信扫码登录 | **P1** | 🔴 高 | 8-10 |
| `bindWechat` | 绑定微信 | **P1** | 🔴 高 | 5-6 |
| `unbindWechat` | 解绑微信 | **P1** | 🟡 中等 | 4-5 |
| `bindPhone` | 绑定手机号 | **P1** | 🟡 中等 | 4-5 |
| `unbindPhone` | 解绑手机号 | **P1** | 🟡 中等 | 4-5 |
| `changePassword` | 修改密码 | **P0** | 🟡 中等 | 4-5 |
| `resetPassword` | 重置密码 | **P0** | 🟡 中等 | 5-6 |
| `forgotPassword` | 忘记密码 | **P0** | 🟡 中等 | 4-5 |
| `sendBindEmailCode` | 发送绑定邮箱验证码 | **P1** | 🟢 简单 | 3-4 |
| `verifyBindEmail` | 验证绑定邮箱 | **P1** | 🟡 中等 | 3-4 |
| `bindEmailAndLogin` | 绑定邮箱并登录 | **P1** | 🔴 高 | 5-6 |
| `bindPhoneAndLogin` | 绑定手机号并登录 | **P1** | 🔴 高 | 5-6 |
| `verifyEmailAndRegisterPhone` | 邮箱验证后手机注册 | **P1** | 🔴 高 | 5-6 |
| `revokeToken` | 撤销 Token | **P1** | 🟢 简单 | 2-3 |
| `generateTokens` | 生成 Token 对 | **P0** | 🟢 简单 | 3-4 |
| `validateUser` | 验证用户凭据 | **P0** | 🟡 中等 | 3-4 |
| `deleteAllRefreshTokens` | 删除所有刷新令牌 | **P1** | 🟢 简单 | 2-3 |
| `checkFieldUniqueness` | 检查字段唯一性 | **P1** | 🟢 简单 | 4-5 |

**AI 分配建议**: **Claude Code** (微信 OAuth mock 复杂，Session 处理，多种验证流程)

---

### 2.3 MxCadService (864 行)

**复杂度评估**: 🔴 高
- **依赖数量**: 7 (FileUploadManagerFacadeService, FileSystemNodeService, FileConversionService, ExternalReferenceUpdateService, StorageManager, VersionControlService, DatabaseService)
- **Mock 难度**: 高（forwardRef 依赖、文件上传、转换引擎）
- **业务逻辑**: 复杂（分片上传、文件转换、上下文推断）

| 方法名 | 功能描述 | 优先级 | 复杂度 | 测试用例预估 |
|--------|----------|--------|--------|-------------|
| `checkChunkExist` | 检查分片是否存在 | **P0** | 🟢 简单 | 3-4 |
| `checkFileExist` | 检查文件是否存在 | **P0** | 🟢 简单 | 3-4 |
| `checkDuplicateFile` | 检查重复文件 | **P0** | 🟡 中等 | 4-5 |
| `uploadChunk` | 上传分片 | **P0** | 🟡 中等 | 4-5 |
| `uploadAndConvertFile` | 上传并转换文件 | **P0** | 🔴 高 | 5-6 |
| `convertServerFile` | 转换服务器文件 | **P0** | 🔴 高 | 5-6 |
| `checkTzStatus` | 检查图纸状态 | **P1** | 🟢 简单 | 2-3 |
| `getPreloadingData` | 获取预加载数据 | **P0** | 🟡 中等 | 4-5 |
| `checkExternalReferenceExists` | 检查外部参照存在 | **P0** | 🟡 中等 | 3-4 |
| `inferContextForMxCadApp` | 推断 MxCAD 上下文 | **P1** | 🔴 高 | 4-5 |

**AI 分配建议**: **Claude Code** (forwardRef 依赖处理、文件操作 mock 复杂)

---

## 三、P1 Service 清单

### 3.1 已有 spec 文件的 P1 Service

| Service | spec 文件 | 状态 | AI 分配建议 |
|---------|-----------|------|------------|
| ProjectCrudService | `project-crud.service.spec.ts` | 有结构，TODO | **OpenCode** |
| FileConversionService | `file-conversion.service.spec.ts` | 有结构，TODO | **OpenCode** |

### 3.2 需要新建测试的 P1 Service

| Service | 行数 | 复杂度 | 未覆盖方法数 | AI 分配建议 |
|---------|------|--------|-------------|------------|
| VersionControlService | 836 | 🟡 中等 | 0 (spec 已实现) | N/A |
| FileTreeService | 716 | 🟡 中等 | 15+ | **Qoder CLI** |
| FileSystemService | 494 | 🟡 中等 | 10+ | **Qoder CLI** |
| ProjectMemberService | 648 | 🟢 简单 | 8+ | **OpenCode** |
| SearchService | 515 | 🟡 中等 | 10+ | **Qoder CLI** |
| PermissionService | 497 | 🟡 中等 | 12+ | **Qoder CLI** |
| RoleInheritanceService | 589 | 🟡 中等 | 8+ | **Qoder CLI** |
| ChunkUploadService | 486 | 🟡 中等 | 8+ | **Qoder CLI** |
| FileMergeService | 834 | 🔴 高 | 10+ | **Claude Code** |
| StorageCleanupService | 422 | 🟡 中等 | 6+ | **OpenCode** |
| MultiLevelCacheService | 512 | 🟡 中等 | 8+ | **Qoder CLI** |
| CacheMonitorService | 418 | 🟢 简单 | 5+ | **OpenCode** |

---

## 四、AI 工具分配方案

### 4.1 分配原则

| AI 工具 | 适用场景 | 复杂度容忍度 |
|--------|----------|-------------|
| **Claude Code** | 复杂业务逻辑、高依赖、事务处理、第三方集成 | 🔴 高 |
| **Qoder CLI** | 中等复杂度、标准 CRUD、需要理解关联关系 | 🟡 中等 |
| **OpenCode** | 简单方法、低依赖、标准模式、可模板化生成 | 🟢 简单 |

### 4.2 Sprint 3 具体分配

#### 阶段一：P0 Service 测试（本周）

| 任务 | Service | 方法数 | 复杂度 | AI 工具 | 预估工时 | 状态 |
|------|---------|--------|--------|---------|---------|------|
| T1 | UsersService | 19 | 🟡 中等 | **Claude Code** | 3-4 小时 | 待分配 |
| T2 | AuthFacadeService | 25 | 🔴 高 | **Claude Code** | 5-6 小时 | 待分配 |
| T3 | MxCadService | 10 | 🔴 高 | **Claude Code** | 3-4 小时 | 待分配 |

#### 阶段二：完善已有 spec 文件（第二周）

| 任务 | Service | 方法数 | 复杂度 | AI 工具 | 预估工时 | 状态 |
|------|---------|--------|--------|---------|---------|------|
| T4 | ProjectCrudService | ~10 | 🟡 中等 | **OpenCode** | 1-2 小时 | 待分配 |
| T5 | FileConversionService | ~8 | 🟡 中等 | **OpenCode** | 1-2 小时 | 待分配 |
| T6 | FileValidationService | ~3 | 🟢 简单 | **OpenCode** | 0.5 小时 | 待分配 |

#### 阶段三：P1 Service 新建测试（第二、三周）

| 任务 | Service | 方法数 | 复杂度 | AI 工具 | 预估工时 | 状态 |
|------|---------|--------|--------|---------|---------|------|
| T7 | FileTreeService | 15+ | 🟡 中等 | **Qoder CLI** | 2-3 小时 | 待分配 |
| T8 | FileSystemService | 10+ | 🟡 中等 | **Qoder CLI** | 2 小时 | 待分配 |
| T9 | SearchService | 10+ | 🟡 中等 | **Qoder CLI** | 2 小时 | 待分配 |
| T10 | PermissionService | 12+ | 🟡 中等 | **Qoder CLI** | 2-3 小时 | 待分配 |
| T11 | RoleInheritanceService | 8+ | 🟡 中等 | **Qoder CLI** | 1-2 小时 | 待分配 |
| T12 | ChunkUploadService | 8+ | 🟡 中等 | **Qoder CLI** | 2 小时 | 待分配 |
| T13 | ProjectMemberService | 8+ | 🟢 简单 | **OpenCode** | 1 小时 | 待分配 |
| T14 | StorageCleanupService | 6+ | 🟢 简单 | **OpenCode** | 1 小时 | 待分配 |
| T15 | CacheMonitorService | 5+ | 🟢 简单 | **OpenCode** | 0.5 小时 | 待分配 |
| T16 | MultiLevelCacheService | 8+ | 🟡 中等 | **Qoder CLI** | 2 小时 | 待分配 |
| T17 | FileMergeService | 10+ | 🔴 高 | **Claude Code** | 3-4 小时 | 待分配 |

---

## 五、时间估算汇总

| AI 工具 | 任务数 | 累计工时 | 说明 |
|--------|--------|---------|------|
| **Claude Code** | 4 | 14-18 小时 | P0 核心 + FileMergeService |
| **Qoder CLI** | 7 | 13-16 小时 | P1 中等复杂度 |
| **OpenCode** | 6 | 6.5-8.5 小时 | 简单方法 + 完善现有 spec |

**Sprint 3 测试生成总工时**: 约 33-42 小时

---

## 六、注意事项

### 6.1 Jest 白名单问题

当前 `apps/backend/jest.config.ts` 配置为：
```typescript
testMatch: ['**/file-validation.service.spec.ts']
```

**必须修改为**：
```typescript
testMatch: ['**/*.spec.ts', '!**/node_modules/**', '!**/test/**']
```

### 6.2 Mock 策略建议

| 依赖类型 | Mock 方案 |
|---------|----------|
| Prisma DatabaseService | `jest.mock('../../database/database.service')` |
| bcrypt | `jest.mock('bcryptjs')` - 使用 `bcrypt.compare.mockResolvedValue` |
| Redis | `jest.mock('@nestjs-modules/ioredis')` |
| ConfigService | 内联 mock 对象 |
| 第三方服务（微信、短信） | 接口级别 mock |

### 6.3 循环依赖风险

`MxCadService` 使用 `forwardRef(() => FileUploadManagerFacadeService)`，测试时需注意：
- 使用 `Test.createTestingModule` 的 `overrideProvider`
- 避免循环依赖导致的 `undefined` 注入

---

*文档版本: 1.0.0 | 下次更新: Sprint 3 结束时*
