# Sprint 3 测试规划

**分支**: refactor/circular-deps
**生成日期**: 2026-05-02
**阶段**: 冲刺二完成 → 冲刺三（防线构筑）

---

## 一、现有测试覆盖度统计

### 1.1 .spec.ts 文件清单

| 序号 | 文件路径 | 类型 | 状态 |
|------|----------|------|------|
| 1 | `packages/backend/src/file-operations/file-operations.service.spec.ts` | 单元测试 | 有结构，TODO 实现 |
| 2 | `packages/backend/src/file-operations/project-crud.service.spec.ts` | 单元测试 | 有结构，TODO 实现 |
| 3 | `packages/backend/src/mxcad/services/file-conversion.service.spec.ts` | 单元测试 | 有结构，TODO 实现 |
| 4 | `packages/backend/src/file-system/file-validation/file-validation.service.spec.ts` | 单元测试 | 有结构，TODO 实现 |
| 5 | `packages/frontend/src/hooks/usePermission.spec.ts` | 单元测试 | **已实现** |
| 6 | `packages/frontend/src/hooks/useExternalReferenceUpload.spec.ts` | 单元测试 | 有结构，TODO 实现 |
| 7 | `packages/frontend/src/hooks/useExternalReferenceUpload.integration.spec.ts` | 集成测试 | 有结构，TODO 实现 |
| 8 | `packages/frontend/src/utils/fileUtils.spec.ts` | 单元测试 | 有结构，TODO 实现 |

**统计**:
- Backend: 4 个 spec 文件
- Frontend: 4 个 spec 文件
- **总计: 8 个测试文件**
- 实际已实现用例: 1 个 (usePermission.spec.ts)

### 1.2 E2E 测试文件

| 文件路径 | 说明 |
|----------|------|
| `packages/backend/test/app.e2e-spec.ts` | NestJS Supertest 基础端到端测试 |

### 1.3 测试框架配置

| 框架 | 配置文件 | 说明 |
|------|----------|------|
| **Vitest** | `packages/frontend/vitest.config.ts` | Frontend 测试框架，jsdom 环境 |
| **Jest** | `packages/backend/jest.config.ts` | Backend 测试框架，ts-jest 预设 |

**关键配置差异**:
- Frontend: `testMatch: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx']`
- Backend: `testMatch: ['**/file-validation.service.spec.ts']` — **白名单机制**

**Backend Jest 当前限制**: 仅运行 `file-validation.service.spec.ts`，覆盖率阈值针对 P0/P1 模块单独设置。

---

## 二、核心 Service 行数统计与测试优先级

> 按行数从大到小排序，评估测试覆盖需求

### 2.1 Top 10 核心 Service（需优先补单元测试）

| 排名 | Service 文件 | 行数 | 业务域 | 测试优先级 | 已有测试 |
|------|-------------|------|--------|-----------|---------|
| 1 | `file-operations/file-operations.service.ts` | 1564 | 文件操作（删除/恢复/移动/复制） | **P0** | spec 存在 |
| 2 | `users/users.service.ts` | 1141 | 用户管理 | **P0** | ❌ |
| 3 | `auth/auth-facade.service.ts` | 1066 | 认证门面（登录/注册/绑定） | **P0** | ❌ |
| 4 | `mxcad/mxcad.service.ts` | 864 | MxCAD 核心服务 | **P0** | ❌ |
| 5 | `version-control/version-control.service.ts` | 836 | SVN 版本控制 | **P1** | ❌ |
| 6 | `mxcad/services/file-merge.service.ts` | 834 | 文件合并 | **P1** | ❌ |
| 7 | `mxcad/node/filesystem-node.service.ts` | 768 | 文件系统节点 | **P1** | ❌ |
| 8 | `file-system/file-tree/file-tree.service.ts` | 716 | 文件树管理 | **P1** | ❌ |
| 9 | `mxcad/services/file-conversion-upload.service.ts` | 657 | 文件转换上传 | **P1** | spec 存在 |
| 10 | `file-system/project-member/project-member.service.ts` | 648 | 项目成员管理 | **P1** | ❌ |

### 2.2 次优先级 Service（Top 11-30）

| 排名 | Service 文件 | 行数 | 业务域 |
|------|-------------|------|--------|
| 11 | `common/services/initialization.service.ts` | 627 | 初始化服务 |
| 12 | `file-system/services/file-download-export.service.ts` | 591 | 文件下载导出 |
| 13 | `common/services/role-inheritance.service.ts` | 589 | 角色继承 |
| 14 | `auth/services/account-binding.service.ts` | 579 | 账号绑定 |
| 15 | `mxcad/node/node-creation.service.ts` | 575 | 节点创建 |
| 16 | `file-operations/project-crud.service.ts` | 549 | 项目增删改 |
| 17 | `common/services/permission-cache.service.ts` | 517 | 权限缓存 |
| 18 | `file-system/search/search.service.ts` | 515 | 文件搜索 |
| 19 | `cache-architecture/services/multi-level-cache.service.ts` | 512 | 多级缓存 |
| 20 | `mxcad/conversion/file-conversion.service.ts` | 509 | 文件转换 |
| 21 | `common/services/permission.service.ts` | 497 | 权限服务 |
| 22 | `file-system/file-system.service.ts` | 494 | 文件系统服务 |
| 23 | `mxcad/chunk/chunk-upload.service.ts` | 486 | 分片上传 |
| 24 | `fonts/fonts.service.ts` | 462 | 字体管理 |
| 25 | `roles/project-roles.service.ts` | 458 | 项目角色 |
| 26 | `policy-engine/services/policy-config.service.ts` | 444 | 策略配置 |
| 27 | `file-system/file-validation/file-validation.service.ts` | 426 | 文件验证 |
| 28 | `common/services/storage-cleanup.service.ts` | 422 | 存储清理 |
| 29 | `cache-architecture/services/cache-version.service.ts` | 419 | 缓存版本 |
| 30 | `cache-architecture/services/cache-monitor.service.ts` | 418 | 缓存监控 |

---

## 三、核心业务链路分析（E2E 测试候选）

### 3.1 高价值 E2E 测试场景

#### 链路 1: 用户注册与认证
```
注册 → 邮箱验证 → 登录 → JWT 获取 → 刷新 Token → 登出
```
- **涉及 Service**: `auth-facade.service`, `login.service`, `registration.service`, `auth-token.service`
- **测试重点**: Token 生成/刷新/黑名单，验证码发送与验证

#### 链路 2: 项目全生命周期
```
创建项目 → 上传文件 → 创建文件夹 → 移动文件 → 复制文件 → 重命名 → 删除 → 恢复 → 永久删除
```
- **涉及 Service**: `file-operations.service`, `project-crud.service`, `file-tree.service`
- **测试重点**: 软删除/硬删除，垃圾桶管理，名称唯一性检查

#### 链路 3: 文件上传与转换
```
选择文件 → 分片上传 → 合并 → 格式转换 → 生成缩略图 → 保存
```
- **涉及 Service**: `chunk-upload.service`, `file-merge.service`, `file-conversion.service`
- **测试重点**: 大文件分片，转换进度，失败重试

#### 链路 4: 外部参照上传
```
上传外部参照 → 检查重复 → 复制到目标目录 → 更新引用
```
- **涉及 Service**: `external-ref.service`, `file-upload-manager-facade.service`
- **测试重点**: 重复文件检测，路径解析

#### 链路 5: 权限与角色管理
```
创建角色 → 分配权限 → 创建项目角色 → 添加成员 → 验证权限 → 回收权限
```
- **涉及 Service**: `roles.service`, `project-roles.service`, `permission.service`, `file-system-permission.service`
- **测试重点**: 权限继承，权限检查，角色层级

#### 链路 6: 版本控制操作
```
提交更改 → 查看日志 → 获取历史版本 → 导出特定版本
```
- **涉及 Service**: `version-control.service`
- **测试重点**: SVN 集成，版本历史

#### 链路 7: 搜索与筛选
```
按名称搜索 → 按类型筛选 → 按扩展名筛选 → 分页查询
```
- **涉及 Service**: `search.service`
- **测试重点**: 模糊匹配，性能

### 3.2 E2E 测试框架建议

| 方案 | 工具 | 优点 | 缺点 |
|------|------|------|------|
| **方案 A** | Playwright | 跨浏览器，强大录制功能，活跃社区 | 需新增依赖 |
| **方案 B** | 扩展现有 Jest E2E | 无新增依赖，与 backend 测试统一 | 仅 API 测试 |

**建议**: 采用 **方案 A (Playwright)**，优先覆盖链路 1-5。

---

## 四、测试基础设施建议

### 4.1 Backend Jest 配置优化

当前 `jest.config.ts` 的白名单机制限制了测试覆盖。建议:

```typescript
// 扩展 testMatch 以支持更多测试
testMatch: [
  '**/*.spec.ts',
  '!**/node_modules/**',
  '!**/test/**', // 排除 e2e 测试
],
```

### 4.2 新增测试工具建议

| 工具 | 用途 | 安装命令 |
|------|------|---------|
| `@playwright/test` | E2E 测试 | `pnpm add -D @playwright/test -w` |
| `faker` | 测试数据生成 | `pnpm add -D @faker-js/faker -w` |

### 4.3 CI/CD 测试流程建议

```yaml
# .github/workflows/test.yml 扩展
- name: 运行前端单元测试
  run: cd packages/frontend && pnpm test:coverage

- name: 运行 E2E 测试
  run: cd packages/backend && pnpm test:e2e

- name: Playwright 视觉回归测试
  run: npx playwright test
```

---

## 五、Sprint 3 测试任务分解

### 5.1 第一周: 单元测试基础覆盖

| 任务 | 负责人 | Service | 目标覆盖率 |
|------|--------|---------|-----------|
| T1 | - | `users.service.ts` | 70% |
| T2 | - | `auth-facade.service.ts` | 70% |
| T3 | - | `mxcad.service.ts` | 70% |
| T4 | - | `file-operations.service.spec.ts` | **实现剩余 TODO** |

### 5.2 第二周: 业务链路测试

| 任务 | 负责人 | 说明 |
|------|--------|------|
| T5 | - | 设置 Playwright |
| T6 | - | 实现链路 1: 用户注册与认证 E2E |
| T7 | - | 实现链路 2: 项目全生命周期 E2E |
| T8 | - | 实现链路 3: 文件上传与转换 E2E |

### 5.3 第三周: 权限与集成测试

| 任务 | 负责人 | 说明 |
|------|--------|------|
| T9 | - | 实现链路 5: 权限与角色管理 E2E |
| T10 | - | 完善 `permission.service` 单元测试 |
| T11 | - | 完善 `role-inheritance.service` 单元测试 |

---

## 六、覆盖率目标

| 模块分类 | 行覆盖率目标 | 函数覆盖率目标 |
|----------|-------------|---------------|
| P0 (认证、用户、核心文件操作) | 80% | 85% |
| P1 (业务功能) | 70% | 75% |
| P2 (辅助功能) | 50% | 60% |
| E2E 关键链路 | 覆盖率 100% | - |

---

## 七、风险与注意事项

1. **循环依赖重构风险**: `file-operations.service.ts` 与多个模块存在依赖，需确保重构后测试仍然有效
2. **Mock 复杂度**: 部分 Service 依赖外部系统（SVN、Redis、MinIO），需完善 Mock 策略
3. **集成测试环境**: E2E 测试需要完整数据库和 Redis 环境，CI 配置需同步更新

---

*文档版本: 1.0.0 | 下次更新: Sprint 3 结束时*
