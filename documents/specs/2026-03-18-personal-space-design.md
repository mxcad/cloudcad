# 我的图纸 - 私人空间功能设计

## 1. 概述

### 1.1 功能描述

为每个用户提供一个默认的"我的图纸"私人空间，该空间本质上是用户专属的项目，具有以下特点：

- 用户注册时自动创建
- 每个用户仅有一个
- 不可删除
- 无成员管理功能（仅用户自己）
- 支持文件夹层级结构（与项目一致）

### 1.2 设计原则

- 复用现有项目结构，最小化改动
- 统一用户创建入口，确保每个用户都有私人空间
- 前端独立入口，与项目列表解耦

---

## 2. 数据模型变更

### 2.1 FileSystemNode 表新增字段

**文件**: `packages/backend/prisma/schema.prisma`

```prisma
model FileSystemNode {
  // ... 现有字段保持不变
  
  isPersonal  Boolean  @default(false)  // 是否为私人空间
  
  // ... 其他字段
}

// 添加唯一约束（在 model 末尾添加）
@@unique([ownerId], where: { isPersonal: true, isRoot: true })
```

**说明**：
- `isPersonal` 字段标识是否为私人空间
- 唯一约束确保每个用户只能有一个私人空间

### 2.2 数据库迁移

```bash
pnpm prisma migrate dev --name add_personal_space
```

---

## 3. 后端 API 变更

### 3.1 新增 API

**文件**: `packages/backend/src/file-system/file-system.controller.ts`

| 路由 | 方法 | 说明 |
|------|------|------|
| `GET /personal-space` | GET | 获取当前用户的私人空间 |

```typescript
@Get('personal-space')
@ApiOperation({ summary: '获取当前用户的私人空间' })
async getPersonalSpace(@CurrentUser() user: User) {
  return this.fileSystemService.getPersonalSpace(user.id);
}
```

### 3.2 修改现有 API

**文件**: `packages/backend/src/file-system/file-system.service.ts`

```typescript
// 获取项目列表 - 过滤私人空间
async getProjects(userId: string) {
  return this.prisma.fileSystemNode.findMany({
    where: { 
      ownerId: userId, 
      isRoot: true,
      isPersonal: false  // 新增过滤
    }
  });
}

// 新增：获取用户私人空间
async getPersonalSpace(userId: string) {
  return this.prisma.fileSystemNode.findFirst({
    where: { ownerId: userId, isPersonal: true, isRoot: true }
  });
}

// 删除节点 - 禁止删除私人空间
async deleteNode(nodeId: string, userId: string) {
  const node = await this.prisma.fileSystemNode.findUnique({ 
    where: { id: nodeId } 
  });
  
  if (node?.isPersonal) {
    throw new BadRequestException('私人空间不能删除');
  }
  // ... 原有删除逻辑
}
```

---

## 4. 用户创建统一入口

### 4.1 修改 UsersService.create()

**文件**: `packages/backend/src/users/users.service.ts`

在 `create()` 方法中，使用 Prisma 嵌套创建同时创建私人空间：

```typescript
async create(createUserDto: CreateUserDto) {
  // ... 前置验证逻辑保持不变

  // 获取 PROJECT_OWNER 角色
  const ownerRole = await this.prisma.projectRole.findFirst({
    where: { name: 'PROJECT_OWNER', isSystem: true }
  });

  if (!ownerRole) {
    throw new InternalServerErrorException('PROJECT_OWNER 角色不存在');
  }

  // 创建用户 + 私人空间（事务）
  const user = await this.prisma.user.create({
    data: {
      email: createUserDto.email || null,
      username: createUserDto.username,
      password: hashedPassword,
      nickname: createUserDto.nickname || createUserDto.username,
      avatar: createUserDto.avatar,
      roleId: createUserDto.roleId || defaultRole?.id,
      status: 'ACTIVE',
      emailVerified: !!createUserDto.email,
      emailVerifiedAt: createUserDto.email ? new Date() : null,
      
      // 嵌套创建私人空间
      ownedNodes: {
        create: {
          name: '我的图纸',
          isFolder: true,
          isRoot: true,
          isPersonal: true,
          projectStatus: ProjectStatus.ACTIVE,
          projectMembers: {
            create: {
              projectRoleId: ownerRole.id,
            }
          }
        }
      }
    },
    select: {
      id: true,
      email: true,
      username: true,
      nickname: true,
      avatar: true,
      role: { select: { id: true, name: true } },
      status: true,
      createdAt: true,
      updatedAt: true,
    }
  });

  return user;
}
```

### 4.2 修改 AuthService

**文件**: `packages/backend/src/auth/auth.service.ts`

注入 `UsersService` 并修改用户创建逻辑：

```typescript
// register() 方法 - 邮件服务未启用时
// 改为调用 usersService.create()

// verifyEmailAndActivate() 方法
// 改为调用 usersService.create()
```

### 4.3 修改 InitializationService

**文件**: `packages/backend/src/common/services/initialization.service.ts`

注入 `UsersService` 并修改初始管理员创建逻辑：

```typescript
// checkAndCreateInitialAdmin() 方法
// 改为调用 usersService.create()
```

### 4.4 模块依赖调整

**文件**: `packages/backend/src/auth/auth.module.ts`

```typescript
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    // ... 现有导入
    UsersModule,  // 新增
  ],
  // ...
})
```

**文件**: `packages/backend/src/common/common.module.ts`

```typescript
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    // ... 现有导入
    UsersModule,  // 新增
  ],
  // ...
})
```

---

## 5. 前端变更

### 5.1 API 层

**文件**: `packages/frontend/src/services/projectsApi.ts`

```typescript
export const projectsApi = {
  // ... 现有方法
  
  // 新增：获取私人空间
  getPersonalSpace: () => 
    getApiClient().FileSystemController_getPersonalSpace(),
};
```

### 5.2 路由配置

新增私人空间页面路由：

```typescript
{
  path: '/personal-space',
  element: <PersonalSpacePage />,
  meta: { title: '我的图纸' }
}
```

### 5.3 导航菜单

在主导航中添加"我的图纸"入口：

```tsx
<Menu.Item key="personal-space" icon={<IconPersonalSpace />}>
  我的图纸
  <Link to="/personal-space" />
</Menu.Item>
```

### 5.4 成员管理 UI 隐藏

在项目详情页面组件中，根据 `isPersonal` 字段条件渲染成员管理相关 UI：

```tsx
// 项目详情页头部操作区
{!project.isPersonal && (
  <Button onClick={openMembersModal}>
    成员管理
  </Button>
)}

// 项目详情页侧边栏
{!project.isPersonal && (
  <SidebarSection title="成员">
    <MembersList />
  </SidebarSection>
)}
```

---

## 6. 现有用户数据处理

对于已存在的用户，需要在系统启动时检查并创建缺失的私人空间。

### 6.1 在 InitializationService 中添加检查逻辑

**文件**: `packages/backend/src/common/services/initialization.service.ts`

```typescript
async onModuleInit() {
  await this.createSystemDefaultRoles();
  await this.createProjectDefaultRoles();
  await this.checkAndCreateInitialAdmin();
  await this.ensureAllUsersHavePersonalSpace();  // 新增
}

private async ensureAllUsersHavePersonalSpace(): Promise<void> {
  const users = await this.prisma.user.findMany();
  const ownerRole = await this.prisma.projectRole.findFirst({
    where: { name: 'PROJECT_OWNER', isSystem: true }
  });

  for (const user of users) {
    const existing = await this.prisma.fileSystemNode.findFirst({
      where: { ownerId: user.id, isPersonal: true }
    });

    if (!existing) {
      await this.prisma.fileSystemNode.create({
        data: {
          name: '我的图纸',
          isFolder: true,
          isRoot: true,
          isPersonal: true,
          projectStatus: ProjectStatus.ACTIVE,
          ownerId: user.id,
          projectMembers: {
            create: {
              userId: user.id,
              projectRoleId: ownerRole.id,
            }
          }
        }
      });
      this.logger.log(`为用户 ${user.username} 创建私人空间`);
    }
  }
}
```

---

## 7. 修改文件清单

| 序号 | 文件路径 | 修改类型 | 说明 |
|------|----------|----------|------|
| 1 | `packages/backend/prisma/schema.prisma` | 修改 | 新增 `isPersonal` 字段和唯一约束 |
| 2 | `packages/backend/src/users/users.service.ts` | 修改 | `create()` 方法加入私人空间创建 |
| 3 | `packages/backend/src/auth/auth.service.ts` | 修改 | 改为调用 `usersService.create()` |
| 4 | `packages/backend/src/auth/auth.module.ts` | 修改 | 导入 `UsersModule` |
| 5 | `packages/backend/src/common/services/initialization.service.ts` | 修改 | 改为调用 `usersService.create()`，添加现有用户检查 |
| 6 | `packages/backend/src/common/common.module.ts` | 修改 | 导入 `UsersModule` |
| 7 | `packages/backend/src/file-system/file-system.service.ts` | 修改 | 新增 `getPersonalSpace()`，`getProjects()` 过滤私人空间 |
| 8 | `packages/backend/src/file-system/file-system.controller.ts` | 修改 | 新增 `GET /personal-space` API |
| 9 | `packages/frontend/src/services/projectsApi.ts` | 修改 | 新增 `getPersonalSpace()` 方法 |
| 10 | `packages/frontend/src/router/` | 修改 | 新增私人空间路由 |
| 11 | `packages/frontend/src/components/` | 修改 | 导航菜单新增入口 |
| 12 | `packages/frontend/src/pages/` | 修改 | 项目详情页隐藏成员管理 UI |

---

## 8. 测试要点

### 8.1 单元测试

- `UsersService.create()` 创建用户时是否同时创建私人空间
- `FileSystemService.getProjects()` 是否正确过滤私人空间
- `FileSystemService.getPersonalSpace()` 是否返回正确的私人空间
- `FileSystemService.deleteNode()` 是否禁止删除私人空间

### 8.2 集成测试

- 用户注册流程：验证私人空间自动创建
- 管理员创建用户：验证私人空间自动创建
- 初始管理员创建：验证私人空间自动创建
- 现有用户启动系统：验证私人空间自动补充

### 8.3 E2E 测试

- 用户注册 → 登录 → 访问"我的图纸" → 验证空间存在
- 用户尝试删除私人空间 → 验证被阻止
- 私人空间中创建文件夹 → 验证层级结构正常

---

## 9. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 循环依赖 | AuthModule ⇄ UsersModule | 使用 `forwardRef()` 或模块重构 |
| 现有用户无私人空间 | 功能异常 | 启动时自动补充 |
| 数据库迁移失败 | 系统无法启动 | 提供回滚脚本 |

---

## 10. 后续扩展

- 支持私人空间名称自定义（可选）
- 私人空间存储配额管理（可选）
- 私人空间文件分享功能（可选）
