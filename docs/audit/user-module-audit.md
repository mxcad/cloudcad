# 用户管理模块审计报告

**审计分支**: `refactor/circular-deps`
**审计日期**: 2025-05-02
**审计范围**: `apps/backend/src/users/`

---

## 执行摘要

用户管理模块整体架构清晰，但存在接口抽象不完整、与认证模块的紧耦合、以及管理端用户恢复功能缺失等问题。本报告详细分析了四个核心问题领域。

---

## 1. UsersService 接口抽象现状

### 当前状态

`IUserService` 接口定义在 `apps/backend/src/common/interfaces/user-service.interface.ts`，但**极其不完整**：

```typescript
// 当前接口（第 37-39 行）
export interface IUserService {
  create(dto: unknown): Promise<ICreatedUser>;
}
```

**问题**: 接口仅定义了 `create()` 一个方法，明显只是为了打破 `AuthModule` ↔ `UsersModule` 之间的循环依赖而存在的最小化实现。

### 是否需要 IUserProvider？

**结论：对接官网后极可能需要，建议提前规划。**

如果未来用户信息来源可能变化（例如对接官网用户系统、LDAP、OAuth 等），应考虑参照认证模块的策略模式，定义更完整的 `IUserProvider` 接口。

**建议抽象的接口方法**（基于当前 `UsersService` 的公共方法）：

| 方法 | 说明 | 优先级 |
|------|------|--------|
| `create(dto)` | 创建用户 | 已有（但类型 `unknown` 应优化） |
| `findById(id)` | 根据 ID 查询 | 高 |
| `findByEmail(email)` | 根据邮箱查询 | 高 |
| `update(id, dto)` | 更新用户 | 中 |
| `deactivate(userId, ...)` | 注销账户 | 中 |
| `restore(userId, ...)` | 恢复账户 | 中 |

**当前接口的其他问题**：
- `create()` 的参数类型为 `unknown`，失去了类型安全
- `ICreatedUser` 返回类型定义在接口文件中，但未与 DTO 统一

---

## 2. 用户 CRUD 操作中的隐藏强耦合

### 2.1 与认证模块的直接耦合

**问题**：`UsersModule` 直接导入了 `SmsModule`（来自 auth 模块）

```typescript
// users.module.ts 第 16 行
import { SmsModule } from '../auth/services/sms/sms.module';
```

`SmsModule` 被导入用于账户注销/恢复时的短信验证码验证。虽然 `UsersService` 通过 `ISmsVerificationService` 接口使用短信验证服务（正确的抽象方式），但**模块层面的直接导入造成了不必要的耦合**。

**建议**：将 `SmsModule` 也通过接口令牌方式提供，或在 `CommonModule` 中统一导出验证相关服务。

### 2.2 与 Prisma 的直接绑定

`UsersService` 直接依赖 `DatabaseService`（Prisma 封装），所有数据访问都通过 `this.prisma.user.findUnique()` 等方式执行。

**影响**：如果未来需要对接官网用户系统（只读外部用户数据，或双向同步），当前实现需要较大改动。

**注意**：这不是立即需要解决的问题，但是一个未来风险的识别。

### 2.3 私有空间创建的耦合

在 `create()` 方法中（第 131-207 行），用户创建和私有空间（`FileSystemNode`）创建在同一个数据库事务中完成：

```typescript
const user = await this.prisma.$transaction(async (tx) => {
  const newUser = await tx.user.create({...});
  // 创建私人空间
  await tx.fileSystemNode.create({...});
  return newUser;
});
```

**问题**：用户管理服务直接操作文件系统数据结构，违反了单一职责原则。

### 2.4 密码哈希策略硬编码

`UsersService` 直接使用 `bcrypt` 进行密码哈希和验证：

```typescript
// 第 23 行
import * as bcrypt from 'bcryptjs';

// 第 125 行
const hashedPassword = await bcrypt.hash(createUserDto.password, this.saltRounds);

// 第 981-986 行
async validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, hashedPassword);
}
```

**建议**：如果需要支持多种哈希策略（例如升级到 Argon2），应抽象为 `IPasswordHasher` 接口。

---

## 3. 用户注销/恢复生命周期的权限检查审计

### 3.1 端点权限映射

| 端点 | 权限守卫 | 问题 |
|------|---------|------|
| `DELETE :id` | `SYSTEM_USER_DELETE` | ✅ 正确 |
| `POST :id/delete-immediately` | `SYSTEM_USER_DELETE` | ✅ 正确 |
| `POST deactivate-account` | 仅 JWT 认证 | ✅ 正确（自助注销） |
| `POST me/restore` | 仅 JWT 认证 | ✅ 正确（自助恢复） |
| `POST :id/restore` | **不存在** | ⚠️ **问题：管理端恢复端点缺失** |

### 3.2 关键发现：管理端恢复功能缺失

`UsersService` 中定义了 `restore(id: string)` 方法（第 696-721 行），可以清除用户的 `deletedAt` 字段来恢复用户。但是，**`UsersController` 中没有对应的管理端端点**。

**当前状态**：
- 用户可以通过 `POST /me/restore` 在冷静期内自助恢复
- 管理员可以软删除用户（`DELETE :id`）
- **管理员无法恢复被误删的用户**（除非直接操作数据库）

**建议**：添加管理端恢复端点，例如 `POST :id/restore`，并加上 `SYSTEM_USER_DELETE` 权限守卫。

### 3.3 Service 层缺少调用者验证

`deactivateAccount(userId, ...)` 和 `restoreAccount(userId, ...)` 方法接受 `userId` 参数，但**不验证调用者是否有权操作该 userId**。

**当前安全性分析**：
- Controller 层正确传递 `req.user.id`，所以当前实现是安全的
- 但如果未来添加新的端点（例如管理员代用户注销），Service 层不会阻止误操作

**建议**：在 Service 层添加可选的调用者验证，或在方法签名中明确区分自助操作和管理员操作。

### 3.4 管理员删除的权限检查

`softDelete()` 和 `deleteImmediately()` 都正确检查了不能删除 `ADMIN` 角色的用户（第 629-631 行、第 673-675 行）：

```typescript
if (existingUser.role.name === 'ADMIN') {
  throw new BadRequestException('不能删除管理员账户');
}
```

✅ 这是正确的实现。

### 3.5 冷静期检查的

`restoreAccount()` 正确检查了冷静期（第 868-877 行）：

```typescript
const cleanupDelayDays = this.configService.get<number>('userCleanup.delayDays', 30);
const expiryDate = new Date();
expiryDate.setDate(expiryDate.getDate() - cleanupDelayDays);

if (user.deletedAt < expiryDate) {
  throw new BadRequestException('已过冷静期，无法恢复');
}
```

✅ 实现正确，但 `30` 天默认值硬编码在配置读取中，而配置键 `userCleanup.delayDays` 没有在文档中明确说明。

---

## 4. 需要抽象的关键决策点

### 4.1 验证方式（高优先级）

`deactivateAccount()` 方法（第 753-845 行）硬编码了四种验证方式：

1. 密码验证
2. 短信验证码
3. 邮箱验证码
4. 微信扫码确认

如果需要添加新的验证方式（例如：TOTP、安全问题、生物识别），需要修改此方法。

**建议**：定义 `IAccountVerificationStrategy` 接口，使用策略模式处理不同验证方式。

### 4.2 用户配额计算（中优先级）

`getDashboardStats()` 方法中（第 1148-1161 行），存储配额的计算逻辑混合了：
- 个人空间的 `storageQuota` 字段
- 运行时配置 `userStorageQuota` 默认值

这部分逻辑可能会随着业务发展而复杂化（例如：按角色分配不同配额、企业版无限配额等）。

### 4.3 角色分配默认值（低优先级）

`create()` 方法中硬编码了默认角色为 `USER`（第 116-118 行）：

```typescript
const defaultRole = await this.prisma.role.findFirst({
  where: { name: 'USER' },
});
```

如果未来需要支持多种注册流程（例如：邀请注册自动分配特定角色），这里需要抽象。

### 4.4 用户名修改限制（已实现但可配置性增强）

`UsersController.updateProfile()` 中（第 174-236 行）实现了用户名修改频率限制（一月 3 次），但限制次数 `3` 是硬编码的。

**建议**：将限制次数提取到运行时配置中。

---

## 5. 其他发现

### 5.1 已过时的代码

`UsersService` 中存在一个被注释为"保留方法，暂不使用"的 `remove()` 方法（第 726-746 行），执行物理删除。

**建议**：如果确认不再使用，应标记为 `@deprecated` 或移除。

### 5.2 循环依赖处理

`UsersModule` 使用 `forwardRef(() => AuthModule)` 来处理与 `AuthModule` 的循环依赖。这是 NestJS 的标准做法，但值得注意：

- `AuthModule` 需要 `IUserService` 来创建用户（注册功能）
- `UsersModule` 需要 `AuthModule` 的 `JwtAuthGuard`（间接依赖）

当前通过 `IUserService` 接口 + `forwardRef` 的组合解决了这个问题，架构上是正确的。

### 5.3 单元测试缺失

`users/` 目录下没有 `*.spec.ts` 测试文件。根据 `agents.md` 中的描述，应有测试但当前缺失。

---

## 建议改进优先级

| 优先级 | 改进项 | 理由 |
|--------|--------|------|
| 🔴 高 | 添加管理端用户恢复端点 | 功能缺失，管理员无法恢复误删用户 |
| 🟡 中 | 抽象验证策略 | 当前硬编码了 4 种验证方式，扩展性差 |
| 🟡 中 | 完善 `IUserService` 接口 | 为未来对接官网用户系统做准备 |
| 🟢 低 | 抽象密码哈希策略 | 当前 bcrypt 硬编码，未来可能需升级 |
| 🟢 低 | 解耦私有空间创建 | 单一职责原则 |

---

## 附录：文件清单

```
apps/backend/src/users/
├── users.module.ts          # 模块定义（含 forwardRef 循环依赖处理）
├── users.controller.ts      # 控制器（12 个端点）
├── users.service.ts         # 服务（15 个公共方法）
├── dto/
│   ├── create-user.dto.ts   # 创建用户 DTO
│   ├── update-user.dto.ts   # 更新用户 DTO
│   ├── query-users.dto.ts   # 查询参数 DTO
│   ├── user-response.dto.ts # 响应 DTO 集合
│   ├── deactivate-account.dto.ts  # 注销账户 DTO
│   └── restore-account.dto.ts     # 恢复账户 DTO
└── README.md                # 模块文档
```

---

*本报告仅基于代码静态分析，未执行任何代码修改。*
