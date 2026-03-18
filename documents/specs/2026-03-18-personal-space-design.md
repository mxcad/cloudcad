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

  // === 项目专属字段（仅根节点使用）===
  description     String?
  projectStatus   ProjectStatus?
  personalSpaceKey String? @unique(map: "unique_personal_space")  // 新增：私人空间标识

  // === 外部参照相关字段（仅文件使用）===
  hasMissingExternalReferences  Boolean @default(false)
  // ... 其他字段

  // === 索引 ===
  @@index([parentId])
  @@index([ownerId])
  @@index([isRoot])
  @@index([isFolder])
  @@index([deletedAt])
  @@index([personalSpaceKey])  // 新增：私人空间查询优化
  @@map("file_system_nodes")
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

**字段位置说明**：
- 放在项目专属字段区域（`description`、`projectStatus` 之后）
- 便于理解该字段仅对根节点（项目）有意义

**索引说明**：
- `@@unique` 确保每人只有一个私人空间
- `@@index` 优化 `findUnique({ where: { personalSpaceKey } })` 查询

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
@UseGuards(JwtAuthGuard)  // 确保需要登录才能访问
async getPersonalSpace(@CurrentUser() user: User) {
  return this.fileSystemService.getPersonalSpace(user.id);
}
```

### 3.2 修改现有服务方法

**文件**: `packages/backend/src/file-system/file-system.service.ts`

```typescript
// 获取项目列表 - 过滤私人空间（主入口）
async getUserProjects(userId: string, query?: QueryProjectsDto) {
  return this.prisma.fileSystemNode.findMany({
    where: { 
      ownerId: userId, 
      isRoot: true,
      personalSpaceKey: null  // 只返回普通项目
    },
    // ... 其他查询逻辑
  });
}

// 获取已删除项目列表 - 过滤私人空间
async getUserDeletedProjects(userId: string, query?: QueryProjectsDto) {
  return this.prisma.fileSystemNode.findMany({
    where: { 
      ownerId: userId, 
      isRoot: true,
      deletedAt: { not: null },
      personalSpaceKey: null  // 只返回普通项目
    },
    // ... 其他查询逻辑
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
async deleteProject(projectId: string, permanently: boolean = false) {
  const project = await this.prisma.fileSystemNode.findUnique({
    where: { id: projectId },
    select: { personalSpaceKey: true }
  });
  
  if (project?.personalSpaceKey) {
    throw new BadRequestException('私人空间不能删除');
  }
  // ... 原有删除逻辑（当前用户信息从请求上下文获取）
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

// 更新成员角色 - 禁止在私人空间修改角色
async updateProjectMember(projectId: string, userId: string, projectRoleId: string, operatorId: string) {
  const project = await this.prisma.fileSystemNode.findUnique({
    where: { id: projectId },
    select: { personalSpaceKey: true }
  });
  
  if (project?.personalSpaceKey) {
    throw new BadRequestException('私人空间不支持修改成员角色');
  }
  // ... 原有更新逻辑
}

// 移除成员 - 禁止移除私人空间成员
async removeProjectMember(projectId: string, userId: string, operatorId: string) {
  const project = await this.prisma.fileSystemNode.findUnique({
    where: { id: projectId },
    select: { personalSpaceKey: true }
  });
  
  if (project?.personalSpaceKey) {
    throw new BadRequestException('私人空间不支持移除成员');
  }
  // ... 原有移除逻辑
}

// 批量添加成员 - 禁止在私人空间批量添加
async batchAddProjectMembers(projectId: string, members: Array<{ userId: string; projectRoleId: string }>) {
  const project = await this.prisma.fileSystemNode.findUnique({
    where: { id: projectId },
    select: { personalSpaceKey: true }
  });
  
  if (project?.personalSpaceKey) {
    throw new BadRequestException('私人空间不支持添加成员');
  }
  // ... 原有批量添加逻辑
}

// 批量更新成员角色 - 禁止在私人空间批量修改
async batchUpdateProjectMembers(projectId: string, updates: Array<{ userId: string; projectRoleId: string }>) {
  const project = await this.prisma.fileSystemNode.findUnique({
    where: { id: projectId },
    select: { personalSpaceKey: true }
  });
  
  if (project?.personalSpaceKey) {
    throw new BadRequestException('私人空间不支持修改成员角色');
  }
  // ... 原有批量更新逻辑
}
```

---

## 4. 用户创建统一入口

### 4.1 修改 UsersService.create()

**文件**: `packages/backend/src/users/users.service.ts`

在 `create()` 方法中，使用 Prisma 事务确保用户和私人空间创建的原子性：

```typescript
async create(createUserDto: CreateUserDto) {
  // ... 前置验证逻辑保持不变

  const ownerRole = await this.prisma.projectRole.findFirst({
    where: { name: 'PROJECT_OWNER', isSystem: true }
  });

  if (!ownerRole) {
    throw new InternalServerErrorException('PROJECT_OWNER 角色不存在');
  }

  // 使用事务确保原子性
  const user = await this.prisma.$transaction(async (tx) => {
    // 1. 创建用户
    const newUser = await tx.user.create({
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

    // 2. 创建私人空间（使用新用户 ID）
    await tx.fileSystemNode.create({
      data: {
        name: '我的图纸',
        isFolder: true,
        isRoot: true,
        personalSpaceKey: newUser.id,
        projectStatus: ProjectStatus.ACTIVE,
        ownerId: newUser.id,
        projectMembers: {
          create: {
            userId: newUser.id,
            projectRoleId: ownerRole.id,
          }
        }
      }
    });

    return newUser;
  });

  return user;
}
```

### 4.2 新增 PersonalSpaceService（避免循环依赖）

**文件**: `packages/backend/src/personal-space/personal-space.service.ts`

为避免 `AuthModule`、`CommonModule` 与 `UsersModule` 之间的循环依赖问题，创建独立的 `PersonalSpaceService`：

```typescript
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FileSystemNode, ProjectStatus } from '@prisma/client';

@Injectable()
export class PersonalSpaceService {
  private readonly logger = new Logger(PersonalSpaceService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 创建私人空间
   */
  async createPersonalSpace(userId: string): Promise<FileSystemNode> {
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
        personalSpaceKey: userId,
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

  /**
   * 获取用户私人空间（不存在则自动创建）
   */
  async getPersonalSpace(userId: string): Promise<FileSystemNode> {
    const personalSpace = await this.prisma.fileSystemNode.findUnique({
      where: { personalSpaceKey: userId }
    });

    if (!personalSpace) {
      this.logger.warn(`用户 ${userId} 没有私人空间，尝试创建`);
      return this.createPersonalSpace(userId);
    }

    return personalSpace;
  }

  /**
   * 判断节点是否为私人空间
   */
  isPersonalSpace(personalSpaceKey: string | null): boolean {
    return personalSpaceKey !== null;
  }
}
```

**文件**: `packages/backend/src/personal-space/personal-space.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { PersonalSpaceService } from './personal-space.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PersonalSpaceService],
  exports: [PersonalSpaceService],
})
export class PersonalSpaceModule {}
```

### 4.3 修改 UsersService

**文件**: `packages/backend/src/users/users.service.ts`

注入 `PersonalSpaceService`，在事务中创建用户后调用：

```typescript
constructor(
  // ... 现有注入
  private personalSpaceService: PersonalSpaceService,
) {}

async create(createUserDto: CreateUserDto) {
  // ... 前置验证逻辑保持不变

  const ownerRole = await this.prisma.projectRole.findFirst({
    where: { name: 'PROJECT_OWNER', isSystem: true }
  });

  if (!ownerRole) {
    throw new InternalServerErrorException('PROJECT_OWNER 角色不存在');
  }

  // 使用事务确保原子性
  const user = await this.prisma.$transaction(async (tx) => {
    // 1. 创建用户
    const newUser = await tx.user.create({
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

    // 2. 创建私人空间（使用新用户 ID）
    await tx.fileSystemNode.create({
      data: {
        name: '我的图纸',
        isFolder: true,
        isRoot: true,
        personalSpaceKey: newUser.id,
        projectStatus: ProjectStatus.ACTIVE,
        ownerId: newUser.id,
        projectMembers: {
          create: {
            userId: newUser.id,
            projectRoleId: ownerRole.id,
          }
        }
      }
    });

    return newUser;
  });

  return user;
}
```

### 4.4 修改 AuthService

**文件**: `packages/backend/src/auth/auth.service.ts`

改为调用 `UsersService.create()`：

```typescript
// register() 方法 - 邮件服务未启用时
// 改为调用 this.usersService.create()

// verifyEmailAndActivate() 方法
// 改为调用 this.usersService.create()
```

**文件**: `packages/backend/src/auth/auth.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    // ... 现有导入
    UsersModule,  // 直接导入，无需 forwardRef
  ],
  // ...
})
export class AuthModule {}
```

### 4.5 修改 InitializationService

**文件**: `packages/backend/src/common/services/initialization.service.ts`

注入 `UsersService` 并修改初始管理员创建逻辑：

```typescript
constructor(
  // ... 现有注入
  private usersService: UsersService,
) {}

// checkAndCreateInitialAdmin() 方法
// 改为调用 this.usersService.create()
```

**文件**: `packages/backend/src/common/common.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    // ... 现有导入
    UsersModule,  // 直接导入，无需 forwardRef
  ],
  // ...
})
export class CommonModule {}
```

### 4.6 修改 FileSystemService

**文件**: `packages/backend/src/file-system/file-system.service.ts`

注入 `PersonalSpaceService`：

```typescript
constructor(
  // ... 现有注入
  private personalSpaceService: PersonalSpaceService,
) {}

// 获取用户私人空间 - 委托给 PersonalSpaceService
async getPersonalSpace(userId: string) {
  return this.personalSpaceService.getPersonalSpace(userId);
}
```

**文件**: `packages/backend/src/file-system/file-system.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { PersonalSpaceModule } from '../personal-space/personal-space.module';

@Module({
  imports: [
    // ... 现有导入
    PersonalSpaceModule,
  ],
  // ...
})
export class FileSystemModule {}
```

### 4.7 模块依赖关系

**实际依赖图**：

```
PersonalSpaceModule (无外部依赖，仅依赖 PrismaModule)
       ↓
   UsersModule (依赖 PersonalSpaceModule)
       ↓
AuthModule (依赖 UsersModule)
       
CommonModule (依赖 UsersModule，提供 InitializationService)
```

**注意事项**：
- `InitializationService` 在 `CommonModule` 中提供
- `CommonModule` 需要导入 `UsersModule` 才能调用 `UsersService.create()`
- 依赖方向：`CommonModule → UsersModule → PersonalSpaceModule`，单向无循环

**UsersModule 需要导入 PersonalSpaceModule**：

**文件**: `packages/backend/src/users/users.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { PersonalSpaceModule } from '../personal-space/personal-space.module';

@Module({
  imports: [
    // ... 现有导入
    PersonalSpaceModule,
  ],
  // ...
})
export class UsersModule {}
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

**文件**: `packages/frontend/src/App.tsx`

新增私人空间页面路由（复用现有 `FileSystemManager` 组件）：

```typescript
{
  path: '/personal-space',
  element: <FileSystemManager mode="personal-space" />,
  meta: { title: '我的图纸' }
}
```

**实现方式**：
- 复用 `FileSystemManager` 组件，通过 `mode` prop 区分私人空间模式
- 私人空间模式下：
  - 自动获取私人空间作为根目录
  - 隐藏成员管理相关 UI
  - 禁用删除、转让功能

**备选方案**：创建独立的 `PersonalSpacePage` 组件（如需更高度定制化）

### 5.3 导航菜单

**文件**: `packages/frontend/src/components/Layout.tsx`

在 `menuItems` 数组中添加"我的图纸"入口：

```tsx
const menuItems = [
  { to: '/projects', icon: FolderOpen, label: '项目管理', visible: true },
  { to: '/personal-space', icon: FileText, label: '我的图纸', visible: true },  // 新增
  // ... 其他菜单项
];
```

**说明**：
- 路由路径为 `/personal-space`，与第 5.2 节路由配置一致
- 图标使用 `FileText`（lucide-react）
- `visible: true` 表示所有登录用户可见

### 5.4 成员管理 UI 隐藏

**说明**：项目详情页面实际上是 `FileSystemManager` 组件，没有单独的 `ProjectDetail` 页面。成员管理相关 UI 需要在该组件中根据 `personalSpaceKey` 字段条件渲染。

**文件**: `packages/frontend/src/pages/FileSystemManager.tsx`

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

**相关组件文件**：

| 文件 | 用途 |
|------|------|
| `components/modals/MembersModal.tsx` | 成员管理模态框 |
| `components/modals/ProjectRolesModal.tsx` | 项目角色管理模态框 |

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
 * 1. 未打开任何文件 → 上传到私人空间根目录
 * 2. 当前文件属于项目 → 上传到私人空间根目录
 * 3. 当前文件属于私人空间 → 上传到该文件的父目录
 */
async function getUploadTargetNodeId(): Promise<string> {
  // 1. 获取私人空间
  const personalSpace = await projectsApi.getPersonalSpace();
  
  if (!personalSpace?.id) {
    throw new Error('无法获取私人空间，请联系管理员');
  }

  // 2. 判断当前是否打开了文件
  const currentProjectId = currentFileInfo?.projectId;
  
  if (!currentProjectId) {
    // 未打开任何文件 → 上传到私人空间根目录
    return personalSpace.id;
  }

  // 3. 判断当前文件是否属于私人空间
  // currentFileInfo.projectId 是文件所属项目的根节点 ID
  // 如果等于私人空间 ID，则当前文件属于私人空间
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

  // 使用 Prisma ORM 查询没有私人空间的用户（跨数据库兼容）
  const usersWithoutPersonalSpace = await this.prisma.user.findMany({
    where: {
      ownedNodes: {
        none: { personalSpaceKey: { not: null } }
      }
    },
    select: { id: true, username: true }
  });

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
| 1 | `packages/backend/prisma/schema.prisma` | 修改 | 新增 `personalSpaceKey` 字段、唯一约束和索引 |
| 2 | `packages/backend/src/personal-space/personal-space.service.ts` | **新增** | 私人空间服务（创建、获取、判断） |
| 3 | `packages/backend/src/personal-space/personal-space.module.ts` | **新增** | 私人空间模块 |
| 4 | `packages/backend/src/users/users.service.ts` | 修改 | `create()` 方法使用事务创建用户和私人空间 |
| 5 | `packages/backend/src/users/users.module.ts` | 修改 | 导入 `PersonalSpaceModule` |
| 6 | `packages/backend/src/auth/auth.service.ts` | 修改 | 改为调用 `usersService.create()` |
| 7 | `packages/backend/src/auth/auth.module.ts` | 修改 | 导入 `UsersModule` |
| 8 | `packages/backend/src/common/services/initialization.service.ts` | 修改 | 改为调用 `usersService.create()`，添加批量检查逻辑 |
| 9 | `packages/backend/src/common/common.module.ts` | 修改 | 导入 `UsersModule` |
| 10 | `packages/backend/src/file-system/file-system.service.ts` | 修改 | 修改项目列表过滤逻辑，新增 `getPersonalSpace`，7 个成员管理方法添加私人空间检查 |
| 11 | `packages/backend/src/file-system/file-system.controller.ts` | 修改 | 新增 `GET /personal-space` API（含权限注解） |
| 12 | `packages/backend/src/file-system/file-system.module.ts` | 修改 | 导入 `PersonalSpaceModule` |
| 13 | `packages/frontend/src/services/projectsApi.ts` | 修改 | 新增 `getPersonalSpace()` 方法 |
| 14 | `packages/frontend/src/services/mxcadManager.ts` | 修改 | 修改 `getUploadTargetNodeId()` 上传目标逻辑 |
| 15 | `packages/frontend/src/App.tsx` | 修改 | 新增 `/personal-space` 路由 |
| 16 | `packages/frontend/src/components/Layout.tsx` | 修改 | 导航菜单新增"我的图纸"入口 |
| 17 | `packages/frontend/src/pages/FileSystemManager.tsx` | 修改 | 添加私人空间模式支持，隐藏成员管理 UI |
| 18 | `packages/frontend/src/components/modals/MembersModal.tsx` | 修改 | 私人空间模式下禁用相关操作 |

---

## 8. 测试要点

### 8.1 单元测试

- `UsersService.create()` 创建用户时是否同时创建私人空间（事务成功）
- `UsersService.create()` 用户创建失败时私人空间是否回滚（事务失败）
- `FileSystemService.getUserProjects()` 是否正确过滤私人空间
- `FileSystemService.getUserDeletedProjects()` 是否正确过滤私人空间
- `FileSystemService.getPersonalSpace()` 是否返回正确的私人空间
- `FileSystemService.getPersonalSpace()` 私人空间不存在时是否自动创建
- `FileSystemService.deleteNode()` 是否禁止删除私人空间根节点
- `FileSystemService.deleteProject()` 是否禁止删除私人空间
- `FileSystemService.transferProjectOwnership()` 是否禁止转让私人空间
- `FileSystemService.addProjectMember()` 是否禁止在私人空间添加成员
- `FileSystemService.updateProjectMember()` 是否禁止修改私人空间成员角色
- `FileSystemService.removeProjectMember()` 是否禁止移除私人空间成员
- `FileSystemService.batchAddProjectMembers()` 是否禁止批量添加成员
- `FileSystemService.batchUpdateProjectMembers()` 是否禁止批量修改角色
- `PersonalSpaceService.isPersonalSpace()` 判断逻辑是否正确

### 8.2 集成测试

- 用户注册流程：验证私人空间自动创建
- 管理员创建用户：验证私人空间自动创建
- 初始管理员创建：验证私人空间自动创建
- 现有用户启动系统：验证私人空间自动补充
- 并发创建私人空间：验证唯一约束生效（两人同时创建）

### 8.3 E2E 测试

- 用户注册 → 登录 → 访问"我的图纸" → 验证空间存在
- 用户尝试删除私人空间 → 验证被阻止
- 用户尝试转让私人空间 → 验证被阻止
- 用户尝试在私人空间添加成员 → 验证被阻止
- 私人空间中创建文件夹 → 验证层级结构正常
- 未打开文件时上传图纸 → 验证上传到私人空间根目录
- 在项目文件中上传图纸 → 验证上传到私人空间根目录
- 在私人空间文件中上传图纸 → 验证上传到父目录

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

| 操作 | 前端 | 后端 | Service 方法行号 |
|------|------|------|-----------------|
| 删除私人空间 | 隐藏按钮 | 抛出异常 | `deleteProject` :1209 |
| 转让私人空间 | 隐藏按钮 | 抛出异常 | `transferProjectOwnership` :2954 |
| 添加成员 | 隐藏 UI | 抛出异常 | `addProjectMember` :2587 |
| 修改成员角色 | 隐藏 UI | 抛出异常 | `updateProjectMember` :2839 |
| 移除成员 | 隐藏 UI | 抛出异常 | `removeProjectMember` :2972 |
| 批量添加成员 | 隐藏 UI | 抛出异常 | `batchAddProjectMembers` :3190 |
| 批量修改角色 | 隐藏 UI | 抛出异常 | `batchUpdateProjectMembers` :3254 |

---

## 10. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 现有用户无私人空间 | 功能异常 | 启动时批量检查并创建（使用 Prisma ORM 确保跨数据库兼容） |
| 数据库迁移失败 | 系统无法启动 | 提供回滚脚本，测试环境先行验证 |
| 并发创建私人空间 | 数据不一致 | 数据库唯一约束保证 |
| 前端未打开文件时上传 | 上传目标不明确 | 增加边界情况处理，默认上传到私人空间根目录 |

---

## 10.1 实施注意事项

### 代码库探索发现

**后端**：

| 发现项 | 说明 |
|--------|------|
| 方法签名 | `deleteProject` 实际签名为 `(projectId, permanently)`，无 `userId` 参数 |
| 项目列表方法 | 需修改 `getUserProjects` 和 `getUserDeletedProjects` 两个方法 |
| 成员管理方法 | 需在 **7 个方法** 中添加私人空间检查（:2587, :2839, :2972, :3190, :3254 等） |
| 初始化服务位置 | `InitializationService` 在 `CommonModule` 中提供，非独立模块 |
| 权限检查 | 现有 `@RequireProjectPermission` 装饰器适用于私人空间 |
| Schema 字段位置 | `personalSpaceKey` 应放在项目专属字段区域（`projectStatus` 之后） |

**前端**：

| 发现项 | 说明 |
|--------|------|
| 项目详情页 | 无独立组件，使用 `FileSystemManager` 统一管理 |
| 路由配置 | 在 `App.tsx` 中定义 |
| 导航菜单 | 在 `components/Layout.tsx` 的 `menuItems` 数组中定义 |
| 成员管理 | 通过 `MembersModal` 和 `ProjectRolesModal` 组件实现 |

---

## 11. 后续扩展

- 支持私人空间名称自定义（可选）
- 私人空间存储配额管理（可选）
- 私人空间文件分享功能（可选）