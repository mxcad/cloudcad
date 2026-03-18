# 我的图纸 - 私人空间功能设计

## 1. 概述

### 1.1 功能描述

为每个用户提供一个默认的"我的图纸"私人空间，该空间本质上是用户专属的项目，具有以下特点：

- 用户注册时自动创建
- 每个用户仅有一个
- 不可删除、不可转让
- 无成员管理功能（仅用户自己）
- 支持文件夹层级结构（与项目一致）

### 1.2 设计原则

- 复用现有项目结构，最小化改动
- 统一用户创建入口，确保每个用户都有私人空间
- 前端独立入口，与项目列表解耦
- 数据库层面保证约束，避免应用层竞态

---

## 2. 数据模型变更

### 2.1 FileSystemNode 表新增字段

**文件**: `packages/backend/prisma/schema.prisma`

```prisma
model FileSystemNode {
  // ... 现有字段保持不变
  
  // 私人空间标识：非空时为私人空间，值为 ownerId
  // 同时作为唯一约束，确保每个用户只有一个私人空间
  // PostgreSQL 特性：NULL 值不受唯一约束限制，普通项目可多个
  personalSpaceKey String? @unique(map: "unique_personal_space")
  
  // ... 其他字段
}
```

### 2.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `personalSpaceKey` | `String?` | 私人空间标识键 |

**判断逻辑**：
- `personalSpaceKey !== null` → 私人空间（值为 `ownerId`）
- `personalSpaceKey === null` → 普通项目

**唯一约束原理**：
- PostgreSQL 唯一约束对 `NULL` 值不生效
- 私人空间：`personalSpaceKey = userId`（非空，受唯一约束，每人只能一个）
- 普通项目：`personalSpaceKey = null`（不受唯一约束，可创建多个）

### 2.3 数据库迁移

```bash
pnpm prisma migrate dev --name add_personal_space_key
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

### 3.2 修改现有服务方法

**文件**: `packages/backend/src/file-system/file-system.service.ts`

```typescript
// 获取项目列表 - 过滤私人空间
async getProjects(userId: string) {
  return this.prisma.fileSystemNode.findMany({
    where: { 
      ownerId: userId, 
      isRoot: true,
      personalSpaceKey: null  // 只返回普通项目
    }
  });
}

// 获取用户私人空间
async getPersonalSpace(userId: string) {
  // 利用唯一约束直接查询
  const personalSpace = await this.prisma.fileSystemNode.findUnique({
    where: { personalSpaceKey: userId }
  });
  
  // 理论上不应返回 null，因为用户创建时已自动创建私人空间
  // 但为安全起见，如果不存在则自动创建
  if (!personalSpace) {
    this.logger.warn(`用户 ${userId} 没有私人空间，尝试创建`);
    return this.createPersonalSpace(userId);
  }
  
  return personalSpace;
}

// 创建私人空间（内部方法）
private async createPersonalSpace(userId: string) {
  const ownerRole = await this.prisma.projectRole.findFirst({
    where: { name: 'PROJECT_OWNER', isSystem: true }
  });

  if (!ownerRole) {
    throw new InternalServerErrorException('PROJECT_OWNER 角色不存在');
  }

  return this.prisma.fileSystemNode.create({
    data: {
      name: '我的图纸',
      isFolder: true,
      isRoot: true,
      personalSpaceKey: userId,  // 关键：设为用户ID
      projectStatus: ProjectStatus.ACTIVE,
      ownerId: userId,
      projectMembers: {
        create: {
          userId,
          projectRoleId: ownerRole.id,
        }
      }
    }
  });
}

// 删除节点 - 禁止删除私人空间
async deleteNode(nodeId: string, permanently: boolean = false) {
  const node = await this.prisma.fileSystemNode.findUnique({ 
    where: { id: nodeId },
    select: { personalSpaceKey: true }
  });
  
  if (node?.personalSpaceKey) {
    throw new BadRequestException('私人空间不能删除');
  }
  // ... 原有删除逻辑
}

// 删除项目 - 禁止删除私人空间
async deleteProject(projectId: string, userId: string, permanently: boolean = false) {
  const project = await this.prisma.fileSystemNode.findUnique({
    where: { id: projectId },
    select: { personalSpaceKey: true }
  });
  
  if (project?.personalSpaceKey) {
    throw new BadRequestException('私人空间不能删除');
  }
  // ... 原有删除逻辑
}

// 转让项目 - 禁止转让私人空间
async transferProjectOwnership(projectId: string, newOwnerId: string, currentUserId: string) {
  const project = await this.prisma.fileSystemNode.findUnique({
    where: { id: projectId },
    select: { personalSpaceKey: true }
  });
  
  if (project?.personalSpaceKey) {
    throw new BadRequestException('私人空间不能转让');
  }
  // ... 原有转让逻辑
}

// 添加成员 - 禁止在私人空间添加成员
async addProjectMember(projectId: string, userId: string, projectRoleId: string, operatorId: string) {
  const project = await this.prisma.fileSystemNode.findUnique({
    where: { id: projectId },
    select: { personalSpaceKey: true }
  });
  
  if (project?.personalSpaceKey) {
    throw new BadRequestException('私人空间不支持添加成员');
  }
  // ... 原有添加成员逻辑
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
          personalSpaceKey: undefined,  // 先创建用户获取 ID 后再设置
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

  // 更新私人空间的 personalSpaceKey
  await this.prisma.fileSystemNode.updateMany({
    where: { ownerId: user.id, isRoot: true, personalSpaceKey: null },
    data: { personalSpaceKey: user.id }
  });

  return user;
}
```

### 4.2 修改 AuthService

**文件**: `packages/backend/src/auth/auth.service.ts`

注入 `UsersService` 并修改用户创建逻辑：

```typescript
// 在 constructor 中注入
constructor(
  // ... 现有注入
  private usersService: UsersService,
) {}

// register() 方法 - 邮件服务未启用时
// 改为调用 this.usersService.create()

// verifyEmailAndActivate() 方法
// 改为调用 this.usersService.create()
```

### 4.3 修改 InitializationService

**文件**: `packages/backend/src/common/services/initialization.service.ts`

注入 `UsersService` 并修改初始管理员创建逻辑：

```typescript
// 在 constructor 中注入
constructor(
  // ... 现有注入
  private usersService: UsersService,
) {}

// checkAndCreateInitialAdmin() 方法
// 改为调用 this.usersService.create()
```

### 4.4 模块依赖调整

由于 `AuthModule` 和 `CommonModule` 需要导入 `UsersModule`，可能存在循环依赖。

**文件**: `packages/backend/src/auth/auth.module.ts`

```typescript
import { Module, forwardRef } from '@nestjs/common';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    // ... 现有导入
    forwardRef(() => UsersModule),
  ],
  // ...
})
export class AuthModule {}
```

**文件**: `packages/backend/src/common/common.module.ts`

```typescript
import { Module, forwardRef } from '@nestjs/common';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    // ... 现有导入
    forwardRef(() => UsersModule),
  ],
  // ...
})
export class CommonModule {}
```

**注意**：`UsersModule` 不需要导入 `AuthModule` 或 `CommonModule`，因此不需要双向 `forwardRef`。

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

在项目详情页面组件中，根据 `personalSpaceKey` 字段条件渲染成员管理相关 UI：

```tsx
// 判断是否为私人空间
const isPersonal = !!project.personalSpaceKey;

// 项目详情页头部操作区
{!isPersonal && (
  <Button onClick={openMembersModal}>
    成员管理
  </Button>
)}

// 项目详情页侧边栏
{!isPersonal && (
  <SidebarSection title="成员">
    <MembersList />
  </SidebarSection>
)}

// 项目设置中的转让和删除按钮
{!isPersonal && (
  <Button danger onClick={handleDelete}>删除项目</Button>
)}
{!isPersonal && (
  <Button onClick={handleTransfer}>转让项目</Button>
)}
```

### 5.5 CAD 编辑器上传逻辑调整

**文件**: `packages/frontend/src/services/mxcadManager.ts`

**背景说明**：
- `currentFileInfo` 是全局变量，由 `CADEditorDirect` 组件在打开文件时设置
- 包含 `fileId`、`parentId`、`projectId`、`name` 等信息
- `projectId` 是文件所属的项目根节点 ID（通过 `filesApi.getRoot()` 获取）

修改 `getUploadTargetNodeId()` 函数：

```typescript
/**
 * 获取上传目标节点 ID
 * 
 * 规则：
 * 1. 如果当前文件属于项目 → 上传到私人空间根目录
 * 2. 如果当前文件属于私人空间 → 上传到该文件的父目录
 */
async function getUploadTargetNodeId(): Promise<string> {
  // 1. 获取私人空间
  const personalSpace = await projectsApi.getPersonalSpace();
  
  if (!personalSpace?.id) {
    throw new Error('无法获取私人空间，请联系管理员');
  }

  // 2. 判断当前文件是否属于私人空间
  // currentFileInfo.projectId 是文件所属项目的根节点 ID
  // 如果等于私人空间 ID，则当前文件属于私人空间
  const currentProjectId = currentFileInfo?.projectId;
  
  if (currentProjectId === personalSpace.id) {
    // 当前文件属于私人空间 → 上传到父目录（或根目录）
    return currentFileInfo?.parentId || personalSpace.id;
  } else {
    // 当前文件属于项目 → 上传到私人空间根目录
    return personalSpace.id;
  }
}
```

**修改 `openFile` 命令**：

```typescript
MxFun.addCommand('openFile', async () => {
  try {
    // 改为异步获取上传目标节点 ID
    const uploadTargetNodeId = await getUploadTargetNodeId();
    
    // ... 后续逻辑不变
  } catch (error) {
    // ... 错误处理
  }
});
```

### 5.6 API 客户端生成

新增 API 后，需要重新生成前端 API 客户端：

```bash
pnpm run generate:api-types
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
  await this.ensureAllUsersHavePersonalSpace();
}

/**
 * 确保所有用户都有私人空间（批量处理）
 */
private async ensureAllUsersHavePersonalSpace(): Promise<void> {
  const ownerRole = await this.prisma.projectRole.findFirst({
    where: { name: 'PROJECT_OWNER', isSystem: true }
  });

  if (!ownerRole) {
    this.logger.error('PROJECT_OWNER 角色不存在，跳过私人空间检查');
    return;
  }

  // 查询没有私人空间的用户（批量查询）
  const usersWithoutPersonalSpace = await this.prisma.$queryRaw<{ id: string; username: string }[]>`
    SELECT u.id, u.username FROM users u
    LEFT JOIN file_system_nodes f ON u.id = f."ownerId" AND f."personalSpaceKey" IS NOT NULL
    WHERE f.id IS NULL
  `;

  if (usersWithoutPersonalSpace.length === 0) {
    this.logger.log('所有用户都已有私人空间');
    return;
  }

  this.logger.log(`发现 ${usersWithoutPersonalSpace.length} 个用户没有私人空间，开始创建...`);

  // 批量创建私人空间
  for (const user of usersWithoutPersonalSpace) {
    try {
      await this.prisma.fileSystemNode.create({
        data: {
          name: '我的图纸',
          isFolder: true,
          isRoot: true,
          personalSpaceKey: user.id,
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
      this.logger.log(`为用户 ${user.username} 创建私人空间成功`);
    } catch (error) {
      this.logger.error(`为用户 ${user.username} 创建私人空间失败: ${error}`);
    }
  }
}
```

---

## 7. 修改文件清单

| 序号 | 文件路径 | 修改类型 | 说明 |
|------|----------|----------|------|
| 1 | `packages/backend/prisma/schema.prisma` | 修改 | 新增 `personalSpaceKey` 字段和唯一约束 |
| 2 | `packages/backend/src/users/users.service.ts` | 修改 | `create()` 方法加入私人空间创建 |
| 3 | `packages/backend/src/auth/auth.service.ts` | 修改 | 改为调用 `usersService.create()` |
| 4 | `packages/backend/src/auth/auth.module.ts` | 修改 | 导入 `UsersModule`（使用 `forwardRef`） |
| 5 | `packages/backend/src/common/services/initialization.service.ts` | 修改 | 改为调用 `usersService.create()`，添加批量检查逻辑 |
| 6 | `packages/backend/src/common/common.module.ts` | 修改 | 导入 `UsersModule`（使用 `forwardRef`） |
| 7 | `packages/backend/src/file-system/file-system.service.ts` | 修改 | 新增方法，修改删除/转让/添加成员逻辑 |
| 8 | `packages/backend/src/file-system/file-system.controller.ts` | 修改 | 新增 `GET /personal-space` API |
| 9 | `packages/frontend/src/services/projectsApi.ts` | 修改 | 新增 `getPersonalSpace()` 方法 |
| 10 | `packages/frontend/src/services/mxcadManager.ts` | 修改 | 修改 `getUploadTargetNodeId()` 上传目标逻辑 |
| 11 | `packages/frontend/src/router/` | 修改 | 新增私人空间路由 |
| 12 | `packages/frontend/src/components/` | 修改 | 导航菜单新增入口 |
| 13 | `packages/frontend/src/pages/` | 修改 | 项目详情页隐藏成员管理 UI |

---

## 8. 测试要点

### 8.1 单元测试

- `UsersService.create()` 创建用户时是否同时创建私人空间
- `FileSystemService.getProjects()` 是否正确过滤私人空间
- `FileSystemService.getPersonalSpace()` 是否返回正确的私人空间
- `FileSystemService.deleteNode()` 是否禁止删除私人空间
- `FileSystemService.transferProjectOwnership()` 是否禁止转让私人空间
- `FileSystemService.addProjectMember()` 是否禁止在私人空间添加成员

### 8.2 集成测试

- 用户注册流程：验证私人空间自动创建
- 管理员创建用户：验证私人空间自动创建
- 初始管理员创建：验证私人空间自动创建
- 现有用户启动系统：验证私人空间自动补充

### 8.3 E2E 测试

- 用户注册 → 登录 → 访问"我的图纸" → 验证空间存在
- 用户尝试删除私人空间 → 验证被阻止
- 用户尝试转让私人空间 → 验证被阻止
- 用户尝试在私人空间添加成员 → 验证被阻止
- 私人空间中创建文件夹 → 验证层级结构正常

---

## 9. 权限检查

### 9.1 私人空间权限机制

私人空间的权限检查与普通项目**完全一致**：

- 用户创建私人空间时，自动添加为 **PROJECT_OWNER** 角色
- PROJECT_OWNER 拥有所有项目权限（22个），包括：
  - 项目管理权限（PROJECT_UPDATE 等）
  - 文件操作权限（FILE_CREATE、FILE_EDIT、FILE_DELETE 等）
  - CAD 图纸权限（CAD_SAVE、CAD_EXTERNAL_REFERENCE 等）

### 9.2 权限检查无需特殊处理

由于私人空间本质上就是一个项目，现有的权限检查机制无需修改：

```typescript
// 现有权限检查逻辑适用于私人空间
@RequireProjectPermission(ProjectPermission.FILE_UPLOAD)
async uploadFile() { ... }

@RequireProjectPermission(ProjectPermission.CAD_SAVE)
async saveFile() { ... }
```

### 9.3 禁止操作总结

| 操作 | 前端 | 后端 |
|------|------|------|
| 删除私人空间 | 隐藏按钮 | 抛出异常 |
| 转让私人空间 | 隐藏按钮 | 抛出异常 |
| 添加成员 | 隐藏 UI | 抛出异常 |
| 修改角色 | 隐藏 UI | 抛出异常 |

---

## 10. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 循环依赖 | AuthModule/CommonModule ⇄ UsersModule | 使用 `forwardRef()` |
| 现有用户无私人空间 | 功能异常 | 启动时批量检查并创建 |
| 数据库迁移失败 | 系统无法启动 | 提供回滚脚本 |
| 并发创建私人空间 | 数据不一致 | 数据库唯一约束保证 |

---

## 11. 后续扩展

- 支持私人空间名称自定义（可选）
- 私人空间存储配额管理（可选）
- 私人空间文件分享功能（可选）