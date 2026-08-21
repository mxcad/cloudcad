# 权限缓存问题诊断报告

## 问题描述

用户修改了角色（从 USER 改成 ADMIN），但权限检查还是使用旧的权限。

---

## 根本原因分析

经过代码分析，发现问题存在**两个层面的缓存问题**：

### 1. 后端缓存清理问题（主要问题）

**位置：** `packages/backend/src/users/users.service.ts` 第 433-434 行

```typescript
// 如果更新了角色或状态，清除相关缓存
if (updateUserDto.roleId || updateUserDto.status) {
  this.permissionCacheService.clearUserCache(id);  // ⚠️ 没有 await！
}
```

**问题：** `clearUserCache()` 是异步方法，但调用时没有使用 `await`。这导致：

- 缓存清理操作是"fire and forget"模式
- 数据库更新成功后立即返回，但缓存可能还未清理完成
- 如果用户紧接着发起请求，权限检查可能使用的是旧缓存数据

**影响程度：** 中等。通常清理操作很快完成，但在高负载或网络延迟情况下问题明显。

### 2. 前端缓存问题（次要问题）

**位置：** `packages/frontend/src/contexts/AuthContext.tsx`

前端权限数据来源链路：
```
登录 → API 返回用户信息 → 存入 localStorage → AuthContext 读取 → usePermission 使用
```

**问题：** 当管理员修改其他用户的角色后：

- 后端缓存清理了（假设修复了 await 问题）
- 但被修改用户的前端 localStorage 中仍存储着旧的用户信息
- 被修改用户的前端没有自动刷新机制来获取最新权限
- 只有调用 `refreshUser()` 或重新登录才能更新

**影响程度：** 高。即使后端缓存正确清理，前端用户仍使用旧权限直到刷新。

---

## 缓存 TTL 配置参考

**位置：** `packages/backend/src/common/constants/cache.constants.ts`

| 缓存类型 | TTL | 说明 |
|---------|-----|------|
| `SYSTEM_PERMISSION` | 5 分钟 | 用户系统权限缓存 |
| `USER_ROLE` | 10 分钟 | 用户角色缓存 |
| `PROJECT_PERMISSION` | 5 分钟 | 项目权限缓存 |
| `ROLE_PERMISSION` | 10 分钟 | 角色权限缓存 |

---

## 解决方案

### 方案一：后端修复（必须）

修改 `packages/backend/src/users/users.service.ts` 第 433-434 行：

```typescript
// 修改前
if (updateUserDto.roleId || updateUserDto.status) {
  this.permissionCacheService.clearUserCache(id);
}

// 修改后
if (updateUserDto.roleId || updateUserDto.status) {
  await this.permissionCacheService.clearUserCache(id);
}
```

### 方案二：前端自动刷新（推荐）

在被修改用户的前端，增加以下机制之一：

1. **轮询机制**（简单但有延迟）
   ```typescript
   // 每 5 分钟刷新一次用户信息
   useEffect(() => {
     const interval = setInterval(() => refreshUser(), 5 * 60 * 1000);
     return () => clearInterval(interval);
   }, []);
   ```

2. **WebSocket 推送**（实时性好）
   - 后端在角色变更时通过 WebSocket 通知被修改用户
   - 前端收到通知后调用 `refreshUser()`

3. **API 响应拦截**（按需刷新）
   - 当 API 返回 403 权限不足时，自动调用 `refreshUser()` 重试一次
   - 适用于权限变更后的首次操作

### 方案三：立即解决（用户操作）

对于当前问题，用户可以：

1. **重新登录**：清除所有前端缓存，重新获取最新权限
2. **手动刷新**：调用 `refreshUser()` 或刷新页面

---

## 相关文件索引

| 文件 | 作用 |
|------|------|
| `packages/backend/src/users/users.service.ts` | 用户服务，包含角色更新逻辑 |
| `packages/backend/src/common/services/permission-cache.service.ts` | 权限缓存服务 |
| `packages/backend/src/common/constants/cache.constants.ts` | 缓存 TTL 配置 |
| `packages/frontend/src/contexts/AuthContext.tsx` | 前端认证上下文 |
| `packages/frontend/src/hooks/usePermission.ts` | 前端权限 Hook |

---

## 总结

| 问题 | 原因 | 解决方案 | 优先级 |
|------|------|----------|--------|
| 后端缓存清理不及时 | `clearUserCache()` 缺少 `await` | 添加 `await` | 高 |
| 前端缓存未更新 | localStorage 存储旧数据 | 实现自动刷新机制 | 中 |
| 用户无感知 | 无通知机制 | WebSocket 或轮询 | 低 |

**建议优先级：**
1. 立即修复后端 `await` 问题
2. 实现前端 403 拦截自动刷新
3. 长期考虑 WebSocket 实时通知
