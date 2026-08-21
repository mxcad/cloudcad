# 权限缓存问题诊断报告

## 问题描述

用户角色从 USER 修改为 ADMIN 后，权限检查仍然使用旧的权限，导致新权限未生效。

## 问题诊断

### 1. 后端异步调用问题（主要原因）

**位置**: `packages/backend/src/users/users.service.ts` 第 433 行

**问题代码**:
```typescript
// 如果更新了角色或状态，清除相关缓存
if (updateUserDto.roleId || updateUserDto.status) {
  this.permissionCacheService.clearUserCache(id);  // 缺少 await！
}
```

**原因分析**:
- `clearUserCache` 是一个异步方法，返回 `Promise<void>`
- 没有使用 `await`，导致方法调用后立即返回，不等待缓存清理完成
- 数据库更新已完成，但缓存清理可能还在进行中
- 此时如果立即进行权限检查，会命中旧缓存

**正确实现**（见 `permission-cache.service.ts` 第 262-274 行）:
```typescript
async clearUserCache(userId: string): Promise<void> {
  // 更新版本号
  if (this.cacheVersionService) {
    await this.cacheVersionService.updateVersion(
      CacheVersionType.USER_PERMISSIONS,
      userId,
      `User ${userId} permissions updated`
    );
  }

  // 先发布事件，确保其他实例也清除缓存
  await this.publishInvalidationEvent('user', userId, 'clearUserCache');
  // 然后执行本地清除
  this.clearUserCacheInternal(userId);
}
```

### 2. 前端缓存未刷新

**位置**: `packages/frontend/src/contexts/AuthContext.tsx`

**问题分析**:
- 前端 `usePermission` Hook 的权限数据来自 AuthContext 的 `user` 对象
- 用户角色变更后，AuthContext 不会自动刷新用户信息
- `refreshUser` 方法存在，但修改角色的操作没有触发调用

**影响范围**:
1. **系统权限缓存** (`usePermission.ts`):
   - 权限列表从 `user.role.permissions` 获取
   - 使用 `useMemo` 缓存权限 Set
   - 需要刷新 AuthContext 的 user 对象才能更新

2. **项目权限缓存** (`useProjectPermission.ts`):
   - 使用模块级单例 `globalCache` 缓存
   - 缓存 TTL 为 5 分钟
   - 角色变更后不会自动失效

### 3. 多级缓存架构

后端使用多级缓存（内存 + Redis），缓存键包括：

```
- system_perm:{userId}:{permission}  # 单个权限检查结果
- is_admin:{userId}                   # 管理员标识
- permission:user:{userId}            # 用户权限列表
```

缓存 TTL:
- 系统权限: 5 分钟 (`CACHE_TTL.SYSTEM_PERMISSION`)
- 用户角色: 10 分钟 (`CACHE_TTL.USER_ROLE`)
- 项目权限: 5 分钟 (`CACHE_TTL.PROJECT_PERMISSION`)

---

## 解决方案

### 方案一：修复后端异步调用（推荐，立即生效）

**修改文件**: `packages/backend/src/users/users.service.ts`

```typescript
// 如果更新了角色或状态，清除相关缓存
if (updateUserDto.roleId || updateUserDto.status) {
  await this.permissionCacheService.clearUserCache(id);  // 添加 await
}
```

### 方案二：前端刷新用户信息

修改角色后，前端需要调用 `refreshUser()` 刷新用户信息：

```typescript
// 在用户管理页面修改角色后
import { useAuth } from '../contexts/AuthContext';

const { refreshUser } = useAuth();

// 修改角色成功后
await updateUserRole(userId, newRoleId);
await refreshUser();  // 刷新当前用户信息
```

### 方案三：清除前端项目权限缓存

```typescript
// 在 useProjectPermission.ts 中已有 clearAll 方法
import { useProjectPermission } from '../hooks/useProjectPermission';

const { clearAllCache } = useProjectPermission();
clearAllCache();  // 清除所有项目权限缓存
```

### 方案四：完整解决方案（最佳实践）

1. **后端确保异步完成**:
```typescript
// users.service.ts
async update(id: string, updateUserDto: UpdateUserDto) {
  // ... 数据库更新 ...

  // 确保 await 异步缓存清理
  if (updateUserDto.roleId || updateUserDto.status) {
    await this.permissionCacheService.clearUserCache(id);
  }

  return user;
}
```

2. **后端返回权限变更提示**:
```typescript
return {
  ...user,
  permissionChanged: !!updateUserDto.roleId  // 提示前端权限已变更
};
```

3. **前端监听权限变更**:
```typescript
// 用户更新 API 响应
const response = await usersApi.update(userId, { roleId: newRoleId });

if (response.data.permissionChanged) {
  // 清除前端缓存
  clearAllCache();
  // 刷新用户信息
  await refreshUser();
}
```

---

## 验证步骤

1. 修改后端代码添加 `await`
2. 重启后端服务
3. 用户 A 登录系统，确认当前权限
4. 管理员修改用户 A 的角色
5. 用户 A 刷新页面或执行需要权限的操作
6. 验证权限是否正确更新

---

## 相关文件

| 文件 | 作用 |
|------|------|
| `packages/backend/src/users/users.service.ts` | 用户服务，更新角色 |
| `packages/backend/src/common/services/permission-cache.service.ts` | 权限缓存服务 |
| `packages/backend/src/common/services/permission.service.ts` | 权限检查服务 |
| `packages/frontend/src/contexts/AuthContext.tsx` | 认证上下文 |
| `packages/frontend/src/hooks/usePermission.ts` | 系统权限 Hook |
| `packages/frontend/src/hooks/useProjectPermission.ts` | 项目权限 Hook |
