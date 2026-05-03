# 测试覆盖率差距分析报告

**生成日期**: 2026-05-02  
**对比目标**: Sprint 3 测试规划（P0 80%覆盖率）

---

## 一、目标与现状对比

| 维度 | 目标值 | 当前状态 | 差距 |
|------|--------|----------|------|
| P0 模块行覆盖率 | 80% | ~15% | **-65%** |
| P0 模块函数覆盖率 | 85% | ~10% | **-75%** |
| 已实现测试文件 | 8 个 | 2 个有效 | **-6 个** |
| P0 Service 测试覆盖率 | 80% | 2 个有测试结构 | **-2 个** |

---

## 二、P0 核心 Service 覆盖分析

### 2.1 Service 清单与覆盖状态

| 排名 | Service 文件 | 行数 | 业务域 | 测试状态 | 覆盖率估算 |
|------|-------------|------|--------|----------|-----------|
| 1 | `file-operations.service.ts` | 1564 | 文件操作核心 | ✅ 有结构，部分实现 | ~10% |
| 2 | `users.service.ts` | 1141 | 用户管理 | ❌ 无测试 | 0% |
| 3 | `auth-facade.service.ts` | 1066 | 认证门面 | ❌ 无测试 | 0% |
| 4 | `mxcad.service.ts` | 864 | MxCAD 核心 | ❌ 无测试 | 0% |

### 2.2 FileOperationsService 方法覆盖详情

**已覆盖方法**:
| 方法名 | 测试状态 | 测试用例数 |
|--------|----------|-----------|
| `checkNameUniqueness` | ✅ 已实现 | 6 |
| `generateUniqueName` | ✅ 已实现 | 6 |

**未覆盖方法**（共 20+ 个）:
| 方法名 | 功能描述 | 优先级 |
|--------|----------|--------|
| `deleteNode` | 软删除文件/文件夹 | **P0** |
| `deleteProject` | 删除项目 | **P0** |
| `restoreNode` | 恢复已删除节点 | **P0** |
| `restoreProject` | 恢复已删除项目 | **P0** |
| `getProjectTrash` | 获取项目回收站 | **P1** |
| `clearProjectTrash` | 清空项目回收站 | **P1** |
| `getAllProjectNodeIds` | 获取项目所有节点ID | **P1** |
| `moveNode` | 移动文件/文件夹 | **P0** |
| `copyNode` | 复制文件/文件夹 | **P0** |
| `copyNodeRecursive` | 递归复制节点 | **P0** |
| `softDeleteDescendants` | 级联软删除子节点 | **P1** |
| `deleteDescendantsWithFiles` | 级联硬删除子节点及文件 | **P1** |
| `deleteFileIfNotReferenced` | 删除未被引用的文件 | **P1** |
| `collectFilesToDelete` | 收集待删除文件 | **P2** |
| `deleteFileFromStorage` | 从存储删除文件 | **P1** |
| `permanentlyDeleteProject` | 永久删除项目 | **P0** |
| `permanentlyDeleteNode` | 永久删除节点 | **P0** |
| `restoreTrashItems` | 批量恢复回收站项目 | **P1** |
| `permanentlyDeleteTrashItems` | 批量永久删除 | **P1** |
| `clearTrash` | 清空用户回收站 | **P1** |
| `updateNode` | 更新节点信息 | **P0** |

### 2.3 UsersService 未覆盖方法（完整清单）

| 方法名 | 功能描述 | 优先级 |
|--------|----------|--------|
| `create` | 创建用户（含私人空间） | **P0** |
| `findAll` | 查询用户列表 | **P0** |
| `findOne` | 查询单个用户 | **P0** |
| `update` | 更新用户信息 | **P0** |
| `remove` | 删除用户 | **P1** |
| `findByEmail` | 按邮箱查询 | **P0** |
| `findByPhone` | 按手机号查询 | **P0** |
| `findByUsername` | 按用户名查询 | **P0** |
| `updatePassword` | 更新密码 | **P0** |
| `verifyEmail` | 验证邮箱 | **P0** |
| `verifyPhone` | 验证手机号 | **P0** |

### 2.4 AuthFacadeService 未覆盖方法（完整清单）

| 方法名 | 功能描述 | 优先级 |
|--------|----------|--------|
| `register` | 用户注册 | **P0** |
| `verifyEmailAndActivate` | 邮箱验证激活 | **P0** |
| `login` | 用户登录 | **P0** |
| `loginByPhone` | 手机号验证码登录 | **P0** |
| `registerByPhone` | 手机号注册 | **P0** |
| `logout` | 用户登出 | **P0** |
| `refreshToken` | 刷新 Token | **P0** |
| `bindWechat` | 绑定微信 | **P1** |
| `unbindWechat` | 解绑微信 | **P1** |
| `bindPhone` | 绑定手机号 | **P1** |
| `unbindPhone` | 解绑手机号 | **P1** |
| `changePassword` | 修改密码 | **P0** |
| `resetPassword` | 重置密码 | **P0** |

### 2.5 MxCadService 未覆盖方法（核心）

| 方法名 | 功能描述 | 优先级 |
|--------|----------|--------|
| `checkChunkExist` | 检查分片是否存在 | **P0** |
| `checkFileExist` | 检查文件是否存在 | **P0** |
| `checkDuplicateFile` | 检查重复文件 | **P0** |
| `uploadChunk` | 上传分片 | **P0** |
| `uploadAndConvertFile` | 上传并转换文件 | **P0** |
| `convertServerFile` | 转换服务器文件 | **P0** |
| `checkTzStatus` | 检查图纸状态 | **P1** |
| `getPreloadingData` | 获取预加载数据 | **P0** |
| `checkExternalReferenceExists` | 检查外部参照存在 | **P0** |
| `inferContextForMxCadApp` | 推断 MxCAD 上下文 | **P1** |

---

## 三、测试覆盖差距汇总

### 3.1 按优先级统计

| 优先级 | 应覆盖方法数 | 已覆盖方法数 | 差距 | 覆盖率 |
|--------|-------------|-------------|------|--------|
| P0 | ~35 | 2 | **-33** | 5.7% |
| P1 | ~25 | 0 | **-25** | 0% |
| P2 | ~10 | 0 | **-10** | 0% |
| **总计** | **~70** | **2** | **-68** | **2.9%** |

### 3.2 按业务域统计

| 业务域 | 方法总数 | 已覆盖 | 未覆盖 | 覆盖率 |
|--------|---------|--------|--------|--------|
| 文件操作 | 24 | 2 | 22 | 8.3% |
| 用户管理 | 11 | 0 | 11 | 0% |
| 认证授权 | 13 | 0 | 13 | 0% |
| MxCAD 核心 | 10 | 0 | 10 | 0% |
| 文件验证 | 5 | 4 | 1 | 80% |
| **总计** | **63** | **6** | **57** | **9.5%** |

---

## 四、差距原因分析

### 4.1 主要问题

1. **测试白名单限制**：当前 Jest 配置仅运行 `file-validation.service.spec.ts`，其他测试文件未执行
2. **测试结构未实现**：`file-operations.service.spec.ts` 有完整结构但大部分用例为 TODO
3. **P0 Service 缺失**：`users.service.ts`、`auth-facade.service.ts`、`mxcad.service.ts` 完全无测试
4. **集成测试空白**：E2E 测试尚未开始，关键业务链路无覆盖

### 4.2 影响评估

| 风险等级 | 问题 | 影响 |
|----------|------|------|
| 🔴 高 | 用户管理无测试 | 注册、登录、权限控制可能存在未发现的缺陷 |
| 🔴 高 | 认证门面无测试 | Token 生成、刷新、黑名单机制可能存在安全隐患 |
| 🟠 中 | 文件操作大部分未覆盖 | 删除、恢复、移动、复制可能存在数据一致性问题 |
| 🟠 中 | MxCAD 核心无测试 | 文件上传、转换、外部参照处理可能失败 |
| 🟡 低 | E2E 测试未开始 | 端到端业务流程无法验证 |

---

## 五、改进建议

### 5.1 立即行动（本周）

1. **扩展 Jest 配置**：移除白名单限制，运行所有 `.spec.ts` 文件
2. **完成 FileOperationsService 核心测试**：优先实现 deleteNode、restoreNode、moveNode、copyNode、updateNode
3. **启动 UsersService 测试**：实现 create、findAll、findOne、update

### 5.2 短期目标（1-2周）

1. **完成 AuthFacadeService 核心测试**：login、register、refreshToken、logout
2. **完成 MxCadService 核心测试**：uploadChunk、uploadAndConvertFile、checkDuplicateFile
3. **设置 Playwright E2E 环境**

### 5.3 长期目标（3周）

1. 实现全部 P0 方法单元测试（目标 80% 覆盖率）
2. 实现关键业务链路 E2E 测试
3. 建立 CI/CD 测试流程

---

## 六、测试覆盖提升路线图

```
阶段1 (第1周): 基础覆盖
├── FileOperationsService: 50% → 80%
├── UsersService: 0% → 70%
└── 覆盖率目标: P0 模块 40%

阶段2 (第2周): 认证覆盖
├── AuthFacadeService: 0% → 70%
├── MxCadService: 0% → 50%
└── 覆盖率目标: P0 模块 60%

阶段3 (第3周): 完整覆盖
├── 补充剩余 P0 测试
├── E2E 测试框架搭建
└── 覆盖率目标: P0 模块 80% ✅
```

---

*文档版本: 1.0.0 | 下次更新: Sprint 3 中期检查*