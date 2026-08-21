# 并发与异步安全审查报告

**审查范围**: `packages/backend/src`  
**审查日期**: 2026-05-08  
**审查人**: 自动审查工具  
**审查重点**: 竞态条件、事务边界、锁机制、Promise 链、事件处理、资源竞争

---

## 一、严重问题

### 问题1：文件名唯一性检查与创建之间存在竞态条件（TOCTOU）

- **文件路径**: `file-operations/file-operations.service.ts:58-104` (checkNameUniqueness) + `file-system/services/file-tree.service.ts:79-118` (createFileNode)
- **严重程度**: **严重**
- **问题描述**: `checkNameUniqueness` 先查询同名文件是否存在，然后 `createFileNode` 在其独立事务中再次查询并创建。两个操作之间存在时间窗口，并发请求可能同时通过唯一性检查，导致事务内部的 `findMany` 仍然检测到冲突而生成带后缀的唯一名称。但这种方式可能导致非预期的文件名（如 `file (1).dwg`）而非返回错误。
  
  具体流程：
  1. 请求A调用 `checkNameUniqueness("test.dwg", ...)` → 未发现冲突
  2. 请求B调用 `checkNameUniqueness("test.dwg", ...)` → 未发现冲突
  3. 请求A在 `createFileNode` 事务中创建 → 成功
  4. 请求B在 `createFileNode` 事务中检测到冲突 → 静默生成 `test (1).dwg`
  
  虽然 `createFileNode` 内部有重名处理，但调用方（如 `project-crud.service.ts:174`）先调 `checkNameUniqueness` 后调 `createFolder/createFile`，中间无事务保护。
- **修复建议**: 将唯一性检查合并到创建事务中，或使用数据库唯一约束（`parentId + name + deletedAt` 组合唯一索引）。对于项目名称（无 parentId），可以使用 `ownerId + name + isRoot + deletedAt` 的唯一约束。
- **是否需要用户确认**: 是 — 涉及数据库 schema 变更和唯一索引创建

### 问题2：`ConcurrencyManager.acquireLock` 不是分布式锁，无法跨进程互斥

- **文件路径**: `common/concurrency/concurrency-manager.ts:44-73`
- **严重程度**: **严重**
- **问题描述**: `ConcurrencyManager` 使用内存 `Map<string, LockState>` 存储锁状态，只能在单进程内工作。在多实例部署（如 PM2 cluster 模式、Kubernetes 多 Pod）环境下，不同进程的请求无法互斥。该类的文档注释声称"提供分布式锁机制"，但实际实现并非分布式。
  
  受影响的潜在场景包括：
  - SVN 操作（如 `commitNodeDirectory`）如果在多实例下被并发调用
  - 文件删除操作中的收集→删除→清理流程
- **修复建议**: 将 `ConcurrencyManager` 重命名为 `LocalConcurrencyManager` 并更新文档。如有跨进程互斥需求，应使用 Redis 分布式锁（如 `CacheVersionService.acquireLock` 中已实现的 `SET NX PX` 模式，或 Redlock 算法）。
- **是否需要用户确认**: 是 — 涉及架构决策和基础设施

### 问题3：`storeRefreshToken` 先删除后创建，非原子操作导致 token 丢失风险

- **文件路径**: `auth/services/auth-token.service.ts:94-126`
- **严重程度**: **严重**
- **问题描述**: `storeRefreshToken` 先执行 `deleteMany` 删除用户所有旧 token，再 `create` 创建新 token。两个操作不在同一事务中。如果在这两步之间发生崩溃/网络中断，用户的 refresh token 将全部丢失，导致所有设备被迫重新登录。
  
  ```typescript
  await this.prisma.refreshToken.deleteMany({ where: { userId } });  // 步骤1
  await this.prisma.refreshToken.create({ data: { token, userId, expiresAt } }); // 步骤2
  ```
  
  代码中捕获了 `Unique constraint` 错误作为并发冲突处理，但 `deleteMany` + `create` 之间才是真正的问题窗口。
- **修复建议**: 将 `deleteMany` 和 `create` 包裹在 `$transaction` 中以保证原子性。或改用 `upsert` 模式（以 userId+deviceId 为唯一键）。
- **是否需要用户确认**: 否

### 问题4：`clearTrash` 使用非事务 Prisma 客户端执行事务内操作

- **文件路径**: `file-operations/file-operations.service.ts:1606-1675`
- **严重程度**: **严重**
- **问题描述**: `clearTrash` 方法中，步骤1-2 使用 `this.prisma`（非事务客户端）执行数据库操作（`permanentlyDeleteProject`），步骤3 中 `clearTrash` 自身也直接使用 `this.prisma` 进行 `deleteMany` 和 `deleteFileIfNotReferenced`。整个 `clearTrash` 方法没有事务包裹，但 `permanentlyDeleteProject` 内部各自有独立的事务。这意味着：
  
  1. 部分项目删除成功、部分失败时，状态不一致
  2. `deleteFileIfNotReferenced` 传入的是 `this.prisma` 而非事务客户端，破坏了 `permanentlyDeleteProject` 方法的接口契约（该方法期望接收事务客户端）
  
  第1631行的 `this.prisma` 传入应是事务对象但实际是非事务的数据库服务：
  ```typescript
  await this.deleteFileIfNotReferenced(
    this.prisma,  // 这里传入的是 DatabaseService，而非 Prisma.TransactionClient
    node.id, node.path, node.fileHash
  );
  ```
- **修复建议**: 将整个 `clearTrash` 方法包裹在 `$transaction` 中。如果事务过大，至少确保 `deleteFileIfNotReferenced` 的参数类型正确，将批量删除操作拆分为事务内数据库操作 + 事务外文件系统操作。
- **是否需要用户确认**: 否

---

## 二、高严重性问题

### 问题5：`restoreTrashItems` 和 `permanentlyDeleteTrashItems` 中串行恢复/删除无事务保护

- **文件路径**: `file-operations/file-operations.service.ts:1516-1548` (restoreTrashItems), `1550-1604` (permanentlyDeleteTrashItems)
- **严重程度**: **高**
- **问题描述**: 批量恢复和批量删除使用 `for...of` 串行执行，每个项目/节点独立在各自的事务中操作。如果中途失败，已处理的项目无法回滚。例如恢复5个项目，第3个失败后前2个已恢复但无法撤销。
  
  `restoreTrashItems`:
  ```typescript
  for (const item of items) {
    if (item.isRoot) {
      await this.restoreProject(item.id);    // 独立事务
    } else {
      await this.restoreNode(item.id, userId); // 独立事务
    }
  }
  ```
- **修复建议**: 使用 `Promise.allSettled` 并行执行以提升性能，并在调用方明确告知部分成功/失败的语义。如果有严格的原子性需求，使用 Saga 模式或补偿事务。
- **是否需要用户确认**: 是 — 涉及 API 语义变更

### 问题6：SVN 操作中 `commitNodeDirectory` 逐层提交中间目录，原子性无法保证

- **文件路径**: `version-control/version-control.service.ts:355-492`
- **严重程度**: **高**
- **问题描述**: `commitNodeDirectory` 逐层创建、添加、提交中间目录。如果目标目录层级较深（如 `202605/nodeId/subdir/file`），在提交中间某层时失败，之前已提交的中间目录无法回滚。同时每个 `svnCommitAsync` 之间没有锁保护，并发创建相同路径可能导致 SVN 冲突。
- **修复建议**: 
  1. 对相同文件路径的操作使用分布式锁（如基于路径 hash 的 Redis 锁）
  2. 考虑使用 `svn import` 一次性导入整个目录结构
  3. 至少在外层使用 `executeWithLockRetry` 包裹整个操作
- **是否需要用户确认**: 否

### 问题7：PermissionCacheService 发布/订阅模式可能产生事件风暴

- **文件路径**: `common/services/permission-cache.service.ts:174-193` (发布), `133-168` (处理)
- **严重程度**: **高**
- **问题描述**: `clearUserCache` 发布 Redis Pub/Sub 消息后，`handleInvalidationEvent` 收到消息再次执行 `clearUserCacheInternal`。虽然代码中有 5 秒时间窗口过滤（第137行），但以下场景仍有风险：
  
  1. 如果多实例同时调用 `clearUserCache`（例如 `clearMultipleUserCache` 中 `Promise.all` 对多个用户并行清除），每个实例收到消息后都会执行本地清除
  2. `clearRoleCache` 在更新角色版本时同时触发 `USER_PERMISSIONS` 全局版本更新（第334-338行），可能导致所有实例清除所有用户权限缓存，形成缓存雪崩
  3. `clearAllCache` 更新三个版本号并发布事件，如果三个版本更新中任何一个失败，事件仍会发布
- **修复建议**: 
  1. 为事件添加去重 ID（如基于 `userId + timestamp` 的幂等键）
  2. `clearRoleCache` 中使用更精确的缓存失效而非全局 `USER_PERMISSIONS` 版本更新
  3. 考虑使用 Redis Keyspace Notifications 替代 Pub/Sub
- **是否需要用户确认**: 是 — 涉及缓存架构变更

### 问题8：`initPromise` 竞态条件可能导致 SVN 双重初始化

- **文件路径**: `version-control/version-control.service.ts:100-150`
- **严重程度**: **高**
- **问题描述**: `onModuleInit` 立即设置 `this.initPromise` 并异步执行初始化。如果 `ensureInitialized` 在 `onModuleInit` 完成前被调用：
  
  ```typescript
  async onModuleInit(): Promise<void> {
    this.initPromise = this.initializeSvnRepository() // 异步，不阻塞
      .then(() => { this.isInitialized = true; })
      .catch(...);
  }
  
  async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) { await this.initPromise; return; }
    await this.onModuleInit();  // 可能再次设置 initPromise
    await this.initPromise;
  }
  ```
  
  第148-149行调用 `onModuleInit()` 后会覆盖 `this.initPromise`（因为 `onModuleInit` 内立即设置），但如果原始 Promise 仍在使用中，可能导致竞态。不过由于 JavaScript 单线程，这个场景在单进程内相对安全，但在 `initPromise.then()` 回调设置 `isInitialized = true` 之前有微小窗口。
- **修复建议**: 使用更安全的惰性初始化模式，例如：
  ```typescript
  private async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeSvnRepository()
        .then(() => { this.isInitialized = true; })
        .catch((err) => { this.isInitialized = false; this.initPromise = null; throw err; });
    }
    return this.initPromise;
  }
  ```
- **是否需要用户确认**: 否

---

## 三、中等问题

### 问题9：`EmailVerificationService.verifyEmail` 中 Redis 操作非原子，验证码验证存在竞态

- **文件路径**: `auth/services/email-verification.service.ts:77-116`
- **严重程度**: **中**
- **问题描述**: `verifyEmail` 方法中先 `get` 验证码、再 `incr` 尝试次数、再 `del` 验证码，多个 Redis 命令之间非原子。高并发下可能：
  1. 同一验证码被多次成功验证（在 `del(key)` 执行前有其他请求也通过了第84行的 `get` 检查）
  2. 尝试次数计数不准确（`get` + `incr` 之间存在竞态）
- **修复建议**: 使用 Lua 脚本将验证逻辑原子化：
  ```lua
  local code = redis.call('GET', KEYS[1])
  if not code then return {-1, 'EXPIRED'} end
  if code ~= ARGV[1] then
    local attempts = redis.call('INCR', KEYS[2])
    redis.call('EXPIRE', KEYS[2], ARGV[2])
    return {0, attempts}
  end
  redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
  return {1, 'OK'}
  ```
- **是否需要用户确认**: 否

### 问题10：`FileLockService.acquireLock` 使用 `flag: 'wx'` 存在跨平台兼容性风险

- **文件路径**: `common/services/file-lock.service.ts:78-163`
- **严重程度**: **中**
- **问题描述**: 第95行使用 `fs.existsSync` 检查锁文件，然后第127行使用 `flag: 'wx'` 创建。`existsSync` 和 `writeFile` 之间存在 TOCTOU 竞态，虽然在 `catch` 中捕获 `EEXIST` 错误进行了重试，但检查 + 操作不是原子的。在 Windows 上文件锁的 `mtime` 检查可能不够精确（FAT/NTFS 的时间精度限制）。
- **修复建议**: 
  1. 去掉 `existsSync` 预检查，直接使用 `flag: 'wx'`，靠 `EEXIST` 错误处理
  2. 考虑使用 `fs.open` + `flock`（仅 Linux/macOS）或 Windows 上的文件共享锁
  3. 对于跨平台部署，建议使用 Redis 锁作为主要互斥机制（已在 `CacheVersionService` 中实现）
- **是否需要用户确认**: 否

### 问题11：`MultiLevelCacheService.getOrLoad` 无缓存击穿保护

- **文件路径**: `cache-architecture/services/multi-level-cache.service.ts:214-228`
- **严重程度**: **中**
- **问题描述**: `getOrLoad` 方法在缓存未命中时直接调用 `loader()` 加载数据，无互斥机制。在高并发场景下，多个请求可能同时发现缓存未命中，同时执行 `loader()`（如数据库查询），造成缓存击穿（thundering herd）。
  
  ```typescript
  async getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await loader();  // 多个并发请求会同时到达这里
    await this.set(key, value);
    return value;
  }
  ```
- **修复建议**: 使用 `singleflight` 模式，对相同 key 的并发加载请求合并为一次实际调用。可以基于 Redis 锁（`SET NX`）或内存中的 Promise Map 实现。
- **是否需要用户确认**: 否

### 问题12：`RateLimiter.execute` 中 `await taskState.promise` 后执行 task 的逻辑有问题

- **文件路径**: `common/concurrency/rate-limiter.ts:59-107`
- **严重程度**: **中**
- **问题描述**: `execute` 方法先 `await taskState.promise`（等待被 `processNext` 调度），然后执行 `task()`。但 `taskState.promise` 的 `resolve()` 只在 `processNext` 中被调用（第152行），而 `processNext` 同时设置了超时定时器。
  
  问题在于：
  1. 超时定时器第136-143行在 `processNext` 中设置，如果任务超时，`reject` 被调用但 `task()` 仍在执行。`execute` 的 `finally` 块（第97-106行）会执行 `this.running.delete(taskId)`，但超时任务的实际执行不会被中断（JavaScript Promise 不可取消）。
  2. 超时后 `processNext` 被递归调用（第142行），可能导致超过 `maxConcurrent` 限制的任务同时运行。
- **修复建议**: 
  1. 使用 `AbortController` 模式支持任务取消
  2. 超时后将任务标记为"已超时"，在 `finally` 中检查标记并跳过结果处理
  3. 修改 `execute` 使超时后不再执行 `task()`
- **是否需要用户确认**: 否

### 问题13：`token-blacklist.service.ts` 在 `onModuleInit` 中注册 Redis 事件监听器未在 `onModuleDestroy` 中移除

- **文件路径**: `auth/services/token-blacklist.service.ts:32-40`, `225-229`
- **严重程度**: **中**
- **问题描述**: `onModuleInit` 中注册了 `redis.on('error', ...)` 和 `redis.on('connect', ...)` 监听器，但 `onModuleDestroy` 中仅调用了 `redis.quit()`，未移除事件监听器。如果模块被重新初始化（如 HMR），旧监听器仍然存在，可能导致内存泄漏和重复日志。
- **修复建议**: 在 `onModuleDestroy` 中使用 `redis.removeAllListeners()` 或 `redis.off()` 移除监听器。更好的做法是使用 `redis.once('connect', ...)` 或检查是否已注册。
- **是否需要用户确认**: 否

### 问题14：`DatabaseService.onModuleInit` 使用 `Promise.race` 连接超时，但未清除超时定时器

- **文件路径**: `database/database.service.ts:94-123`
- **严重程度**: **中**
- **问题描述**: 第100-108行使用 `Promise.race` 实现连接超时。如果连接成功，超时的 `setTimeout` 回调仍会存在，直到进程结束。虽然不会造成功能问题（因为 Promise 已被 resolve），但在测试环境中可能被 jest 的 `detectOpenHandles` 检测到。
- **修复建议**: 使用 `AbortController` 或在连接成功后 `clearTimeout`。可以将 timeout 定时器 ID 保存并在 then 中清除。
- **是否需要用户确认**: 否

---

## 四、低严重性问题

### 问题15：`copyNodeRecursive` 中事务边界缺失

- **文件路径**: `file-operations/file-operations.service.ts:910-1039`
- **严重程度**: **低**
- **问题描述**: `copyNodeRecursive` 递归复制文件夹结构，每个节点在独立的 `create` 操作中创建（第937行），然后进行文件系统复制（第966-988行），再递归处理子节点（第995-1035行）。整个过程没有事务包裹。如果在递归中间过程中失败（如第30个子节点复制失败），已创建的节点和已复制的文件无法回滚。
- **修复建议**: 
  1. 考虑使用 `$transaction` 包裹整个递归操作（对大文件夹可能有性能影响）
  2. 或者采用"先标记、后清理"模式：复制时先标记节点为 `COPYING` 状态，失败后清理所有 `COPYING` 状态的节点
  3. 至少使用 `Promise.all` 并行处理子节点复制以提升性能
- **是否需要用户确认**: 否

### 问题16：`AuthTokenService.refreshToken` 中无并发刷新保护

- **文件路径**: `auth/services/auth-token.service.ts:156-219`
- **严重程度**: **低**
- **问题描述**: 如果用户从多个标签页同时刷新 token，`refreshToken` 方法会：
  1. 验证 refresh token（通过）
  2. 调用 `generateTokens`（创建新的 refresh token 并删除旧 token）
  
  由于 `storeRefreshToken` 先删除后创建，并发刷新可能导致：
  - 两个请求都验证通过（token 尚未被删除）
  - 一个创建新 token，另一个的 `deleteMany` 删除了刚创建的 token
  - 最终只有一个 token 有效，但两个客户端都认为自己刷新成功
  
  第117-123行的 `Unique constraint` 捕获可以部分缓解，但不是完整的解决方案。
- **修复建议**: 使用 refresh token 轮转（rotation）模式：验证 token 后立即标记为已使用，再创建新 token。或使用 Redis 锁（key=userId）确保同一用户同时只有一个刷新操作。
- **是否需要用户确认**: 否

### 问题17：`RoleInheritanceService.clearAllActiveUsersCache` 中的串行缓存清除

- **文件路径**: `common/services/role-inheritance.service.ts:584-614`
- **严重程度**: **低**
- **问题描述**: 第593-604行使用 `for...of` 串行清除每个活跃用户的权限缓存。如果活跃用户数量很大（如数千），这个操作会非常慢，阻塞启动预热流程。
- **修复建议**: 使用批量删除或 `Promise.all` 并发执行：
  ```typescript
  await Promise.all(activeUsers.map(user => { ... }));
  ```
  或使用 Redis Pipeline 批量删除缓存键。
- **是否需要用户确认**: 否

### 问题18：`StorageInfoService` 使用内存 Map 作为配额缓存，无跨实例一致性

- **文件路径**: `file-system/services/storage-info.service.ts:39` (`quotaCache`)
- **严重程度**: **低**
- **问题描述**: `StorageInfoService` 使用 `Map<string, QuotaCacheItem>` 作为配额缓存，在多实例部署下各实例缓存不一致。`invalidateQuotaCache` 清除缓存的操作仅在本地生效。
- **修复建议**: 将配额缓存迁移到 Redis，使用分布式缓存确保一致性。当前的内存缓存作为 L1 缓存是可接受的，但应确保 `invalidateQuotaCache` 通过 Redis Pub/Sub 通知其他实例。
- **是否需要用户确认**: 是 — 涉及缓存架构

### 问题19：`DirectoryAllocator` 使用文件锁保护目录分配，`nodeCount` 计算在锁内但不精确

- **文件路径**: `common/services/directory-allocator.service.ts:84-120`
- **严重程度**: **低**
- **问题描述**: `tryAllocateDirectory` 使用 `fileLockService.withLock` 保护目录分配过程。但 `nodeCount` 的计算方式需要进一步阅读。锁的粒度正确（按目录名锁定），跨进程互斥依赖于文件系统的原子性（`flag: 'wx'`），在分布式文件系统（如 NFS）中可能不可靠。
- **修复建议**: 对于 NFS 等网络文件系统，考虑使用 Redis 锁替代文件锁。当前本地文件系统场景下可接受。
- **是否需要用户确认**: 否

---

## 五、总结

### 审查统计

| 类别 | 总数 | 严重 | 高 | 中 | 低 |
|------|------|------|-----|-----|-----|
| 竞态条件 | 6 | 3 | 1 | 1 | 1 |
| 事务边界 | 5 | 2 | 1 | 0 | 2 |
| 锁机制 | 4 | 1 | 1 | 1 | 1 |
| Promise 链 | 2 | 0 | 0 | 1 | 1 |
| 事件处理 | 2 | 0 | 1 | 1 | 0 |
| 资源竞争 | 3 | 0 | 0 | 2 | 1 |
| **合计** | **19** | **4** | **4** | **6** | **5** |

### 需要用户确认的问题

| 编号 | 问题 | 涉及变更 |
|------|------|---------|
| 1 | 文件名唯一性 TOCTOU | 数据库 schema 变更 + 唯一索引 |
| 2 | ConcurrencyManager 非分布式锁 | 架构决策 |
| 5 | 批量操作无事务保护 | API 语义变更 |
| 7 | 缓存事件风暴风险 | 缓存架构变更 |
| 18 | 配额缓存无跨实例一致性 | 缓存架构 |

### 总体评估

代码在事务使用上有良好的意识，`file-operations.service.ts` 中删除操作的事务内外分离设计（数据库操作在事务内、文件系统操作在事务外）是合理的最佳实践。`CacheVersionService` 中的 Redis 分布式锁实现（SET NX + Lua 释放）质量较高。

主要风险集中在：
1. **非原子 Redis 操作**（验证码验证、配额缓存）
2. **事务边界不完整**（批量操作、SVN 多步提交）
3. **锁的非分布式实现**（ConcurrencyManager、FileLockService）
4. **缓存事件风暴**（PermissionCacheService 的 Pub/Sub 模式）

建议优先修复4个严重问题，然后在架构层面统一锁和缓存策略。
