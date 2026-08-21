# 数据库设计与 Prisma 使用审查报告

> 审查日期：2026-05-08 | 审查范围：`packages/backend/` 下所有数据库相关代码

---

## 一、Schema 设计

### 问题 1.1：`CacheEntry` 表与 Redis 三级缓存架构功能重叠

- **文件路径**: `prisma/schema.prisma:247-261`
- **严重程度**: 中
- **问题描述**: 数据库中存在 `CacheEntry` 表用于数据库级缓存，但同时项目实现了完整的三级缓存架构（L1 内存 → L2 Redis → L3 数据库），其中 `L3CacheProvider` 使用的是 Redis 而非此数据库表。`CacheEntry` 表目前处于闲置状态，浪费存储空间和维护成本。
- **修复建议**: 确认 `CacheEntry` 表是否仍被使用。如果不再使用，应在新 migration 中删除此表；如果计划作为 L3 缓存的备选方案，需明确其定位并补充注释说明。
- **是否需要用户确认**: 是

### 问题 1.2：`Asset` 和 `Font` 表缺少 `deletedAt` 软删除字段

- **文件路径**: `prisma/schema.prisma:168-195`
- **严重程度**: 中
- **问题描述**: `Asset` 和 `Font` 表有 `status` 字段（包含 `DELETED` 状态值），但没有 `deletedAt` 时间戳字段。与 `User` 和 `FileSystemNode` 表的软删除机制不一致，无法追踪删除时间，也无法按时间进行清理调度。
- **修复建议**: 为 `Asset` 和 `Font` 表添加 `deletedAt DateTime?` 字段及对应索引。或者统一将软删除改为仅使用 `status` 字段（需全项目统一）。
- **是否需要用户确认**: 是

### 问题 1.3：`RefreshToken` 表缺少外键约束 ✅ 已修复 (e712b8b7)

- **文件路径**: `prisma/schema.prisma:197-205`
- **严重程度**: 高
- **修复状态**: ✅ 已修复 — commit `e712b8b7`: RefreshToken 添加 User 外键约束 + userId 索引
- **问题描述**: `RefreshToken` 表的 `userId` 字段没有定义与 `User` 表的外键关系，也没有 `@@index([userId])` 索引。这导致：
  1. 删除用户时对应的 RefreshToken 不会自动级联删除，造成孤儿数据
  2. 按用户 ID 查询 RefreshToken 时性能差
- **修复建议**: 添加 `user User @relation(fields: [userId], references: [id], onDelete: Cascade)` 关系定义和 `@@index([userId])` 索引。
- **是否需要用户确认**: 否（明显的缺失约束）

### 问题 1.4：`UploadSession` 表缺少必要的外键和索引

- **文件路径**: `prisma/schema.prisma:228-245`
- **严重程度**: 中
- **问题描述**: `UploadSession` 表的 `fileId`、`projectId`、`parentId`、`ownerId` 字段均未定义外键关系，也没有对应索引（除了 `uploadId` 唯一索引）。`status` 字段使用 `String` 类型而非枚举，缺乏类型安全。
- **修复建议**:
  1. 为 `ownerId` 添加外键关联到 `User`
  2. 为 `fileId`、`projectId`、`parentId` 添加索引
  3. 将 `status` 改为 Prisma enum 类型
- **是否需要用户确认**: 是

### 问题 1.5：`RuntimeConfig` 和 `RuntimeConfigLog` 表缺少操作者外键

- **文件路径**: `prisma/schema.prisma:293-321`
- **严重程度**: 低
- **问题描述**: `RuntimeConfig.updatedBy` 和 `RuntimeConfigLog.operatorId` 存储用户 ID 但未定义外键关系，无法保证引用完整性。
- **修复建议**: 添加外键关系（可选，因为这些是审计日志类字段，可能指向已删除用户）。
- **是否需要用户确认**: 是

### 问题 1.6：`FileSystemNode` 表中 `fileHash` 缺少索引

- **文件路径**: `prisma/schema.prisma:85`
- **严重程度**: 中
- **问题描述**: 代码中频繁使用 `fileHash` 进行文件去重查询（如 `file-operations.service.ts` 中的 `checkNameUniqueness` 逻辑和文件复制时的引用计数），但 `fileHash` 字段没有索引，在高频去重场景下会导致全表扫描。
- **修复建议**: 添加 `@@index([fileHash])` 索引。
- **是否需要用户确认**: 否

### 问题 1.7：`Permission` 枚举中 `PROJECT_CREATE` 分类不当

- **文件路径**: `prisma/schema.prisma:350`
- **严重程度**: 低
- **问题描述**: `PROJECT_CREATE` 被放在 `Permission`（系统权限）枚举中，但它是项目级别的操作权限。`STORAGE_QUOTA` 同理也被放在系统权限枚举中。这可能导致权限模型混淆。
- **修复建议**: 评估这两个权限是否应该移到 `ProjectPermission` 枚举，或者明确区分系统级和项目级权限的边界。
- **是否需要用户确认**: 是

---

## 二、迁移文件审查

### 问题 2.1：`20260330025133_baseline` 为空迁移

- **文件路径**: `prisma/migrations/20260330025133_baseline/migration.sql`
- **严重程度**: 低
- **问题描述**: 该迁移文件内容为空（仅包含注释 `-- This is an empty migration.`），可能是 `prisma migrate diff` 从空数据库生成的基线。如果后续有全新部署，此迁移不会执行任何操作，可能导致枚举类型未创建。
- **修复建议**: 确认此迁移文件的目的。如果是基线标记，建议在文件注释中说明清楚；如果是不必要的，建议删除。
- **是否需要用户确认**: 是

### 问题 2.2：`20260414100000_sync_enum_changes` 包含不完整的枚举值删除

- **文件路径**: `prisma/migrations/20260414100000_sync_enum_changes/migration.sql:9-14`
- **严重程度**: 高
- **问题描述**: 迁移文件注释明确指出需要移除 `SYSTEM_TEMPLATE_READ`（从 `Permission` 枚举）和 `GALLERY_ADD`（从 `ProjectPermission` 枚举），但实际上 PostgreSQL 不支持直接删除枚举值，迁移中只记录了注释而未实际执行。这导致：
  1. schema.prisma 中已删除的枚举值在数据库中仍然存在
  2. `ADD VALUE IF NOT EXISTS` 语句可能在某些 PostgreSQL 版本中不可用（需要 PG 9.6+ 的 `IF NOT EXISTS` 语法用于枚举，实际上 PG 12+ 才支持）
- **修复建议**:
  1. 对于枚举值删除，需要采用重建枚举类型的标准流程（创建新枚举 → 转换列 → 删除旧枚举 → 重命名新枚举）
  2. `ADD VALUE IF NOT EXISTS` 语法需要 PostgreSQL 12+，确认部署环境满足此版本要求
- **是否需要用户确认**: 是（涉及数据库结构变更）

### 问题 2.3：`20260330030233_add_gallery_add_permission` 添加了已废弃的枚举值

- **文件路径**: `prisma/migrations/20260330030233_add_gallery_add_permission/migration.sql`
- **严重程度**: 中
- **问题描述**: 此迁移添加了 `GALLERY_ADD` 到 `ProjectPermission` 枚举，但后续的 `20260414100000_sync_enum_changes` 迁移又注释说需要移除它（尽管未能实际删除）。这表明 `GALLERY_ADD` 是一个已废弃的权限值。该值仍存在于数据库中，占用枚举空间。
- **修复建议**: 与问题 2.2 一起处理，通过枚举重建清理废弃值。
- **是否需要用户确认**: 是

### 问题 2.4：`20260407_add_user_phone_wechat_fields` 中 `password` 改为可空但未显式设置默认值

- **文件路径**: `prisma/migrations/20260407_add_user_phone_wechat_fields/migration.sql:17`
- **严重程度**: 低
- **问题描述**: 将 `password` 列从 `NOT NULL` 改为可空（`DROP NOT NULL`），以支持第三方登录。操作本身是安全的（已有数据的 password 保持不变），但需确认业务逻辑中所有读取 `password` 的地方都已处理 null 情况。
- **修复建议**: 确认所有认证相关代码（如 `password.service.ts`）中已正确处理 `password` 为 null 的分支。
- **是否需要用户确认**: 否

---

## 三、查询性能

### 问题 3.1：`local-auth.provider.ts` 中存在循环查询用户名唯一性

- **文件路径**: `src/auth/providers/local-auth.provider.ts:126,280`
- **严重程度**: 中
- **问题描述**: 在微信/手机注册流程中，使用 `while` 循环逐个检查用户名是否存在：

  ```typescript
  while (await this.prisma.user.findUnique({ where: { username } })) {
    // 递增计数器生成新用户名
  }
  ```

  每次迭代都发送一次数据库查询，当用户名冲突严重时可能产生大量查询。
- **修复建议**: 使用 `findMany` + `LIKE` 模式一次性查询所有匹配的用户名前缀，然后在应用层进行去重计算；或者使用数据库序列/计数器生成唯一用户名。
- **是否需要用户确认**: 否

### 问题 3.2：`CacheVersionService.getAllVersions` 使用 `keys` + 逐个 `get`

- **文件路径**: `src/cache-architecture/services/cache-version.service.ts:336-363`
- **严重程度**: 低
- **问题描述**: `getAllVersions` 方法先使用 `redis.keys(pattern)` 获取所有键，然后逐个 `redis.get(key)` 获取值。在大规模部署中可能产生大量网络往返。
- **修复建议**: 使用 Redis 的 `pipeline` 或 `mget` 批量获取；或者使用 `SCAN` 代替 `KEYS`（生产环境不推荐使用 `KEYS`）。
- **是否需要用户确认**: 否

### 问题 3.3：`MultiLevelCacheService.getMany` 中 L1 查询未使用批量操作

- **文件路径**: `src/cache-architecture/services/multi-level-cache.service.ts:233-275`
- **严重程度**: 低
- **问题描述**: `getMany` 方法中 L1 查询使用 `for` 循环逐个 key 查询，而不是批量操作。L2 有 `getMany` 批量方法但 L1 没有对应的批量接口。
- **修复建议**: 在 `L1CacheProvider` 中添加 `getMany` 批量方法，使用 JavaScript `Map` 进行内存批量查询。
- **是否需要用户确认**: 否

### 问题 3.4：项目列表和回收站查询中 `_count.children` 子查询过滤（正面发现）

- **文件路径**: `src/file-system/services/project-crud.service.ts:238-240,330-332` 等多处
- **严重程度**: 低（正面）
- **问题描述**: 项目列表查询中使用了 `_count: { select: { children: { where: { deletedAt: null } } } }` 来统计未删除的子节点数量，正确地在计数时过滤了已删除节点。这是一个良好的实践。
- **修复建议**: 无需修复，保持现状。
- **是否需要用户确认**: 否

---

## 四、软删除机制

### 问题 4.1：`User` 表大部分查询未过滤 `deletedAt`

- **文件路径**: 多个文件（见下方列表）
- **严重程度**: 高
- **问题描述**: `User` 表定义了 `deletedAt` 字段（`prisma/schema.prisma:29`），但在绝大多数 User 查询中未添加 `deletedAt: null` 过滤条件。以下为部分示例：

  | 文件 | 行号 | 查询类型 |
  |------|------|----------|
  | `src/auth/auth-facade.service.ts` | 349 | `findFirst` (手机登录) |
  | `src/auth/auth-facade.service.ts` | 428,508 | `findFirst` (注册检查) |
  | `src/auth/services/login.service.ts` | 53 | `findFirst` (本地登录) |
  | `src/auth/services/password.service.ts` | 39,131,173,216,225 | `findUnique` (密码相关) |
  | `src/auth/strategies/jwt.strategy.ts` | 85 | `findUnique` (JWT 验证) |
  | `src/users/users.service.ts` | 316,384,436,488 | 多处查询 |
  | `src/common/services/permission.service.ts` | 402,426,451,501 | 权限检查 |

  这意味着已软删除的用户仍然可以通过 API 进行操作（登录、修改密码等），存在安全风险。
- **修复建议**:
  1. 在所有 User 查询中添加 `deletedAt: null` 过滤条件
  2. 考虑在 Prisma 中间件层面统一处理软删除过滤（如使用 Prisma Client Extensions 的 `$allModels` 或中间件）
  3. 对现有已删除用户数据进行审计
- **是否需要用户确认**: 是（涉及安全策略）

### 问题 4.2：`FileSystemNode` 软删除过滤不一致

- **文件路径**: `src/file-operations/file-operations.service.ts:515,1348`
- **严重程度**: 中
- **问题描述**: 在恢复已删除项目的查询中，使用了 `deletedAt: { not: null }` 条件来查找已删除项目。大部分查询正确使用了 `deletedAt: null` 过滤，但缺乏统一的封装。
- **修复建议**: 封装软删除过滤条件为常量或工具函数（如 `NOT_DELETED = { deletedAt: null }`），确保所有查询统一引用。
- **是否需要用户确认**: 否

### 问题 4.3：`Asset` 和 `Font` 表通过 `status` 实现删除，查询一致性需确认

- **文件路径**: `prisma/schema.prisma:177,190`
- **严重程度**: 低
- **问题描述**: `Asset` 和 `Font` 表通过 `status` 字段（值为 `DELETED`）实现软删除，而非 `deletedAt` 时间戳。需确认所有查询中是否正确过滤了 `status !== 'DELETED'`。
- **修复建议**: 统一为 `deletedAt` 时间戳模式，或确保所有 asset/font 查询都过滤 status。
- **是否需要用户确认**: 是

---

## 五、枚举使用

### 问题 5.1：DTO 中使用 Prisma 枚举类型违反了项目规则

- **文件路径**: 
  - `src/file-system/dto/file-system-response.dto.ts:52-56` - `FileStatus`
  - `src/file-system/dto/file-system-response.dto.ts:102-107` - `ProjectStatus`
  - `src/file-system/dto/update-node.dto.ts:30` - `ProjectStatus`
  - `src/users/dto/user-response.dto.ts:56-61,145-150` - `UserStatus`
  - `src/users/dto/update-user.dto.ts:67-75` - `UserStatus`
- **严重程度**: 中
- **问题描述**: CLAUDE.md 明确提到 `custom-rules/no-prisma-enum-in-api-property` 规则禁止在 `@ApiProperty` 装饰器中使用 Prisma 枚举。当前代码中存在多处违规：

  ```typescript
  // file-system-response.dto.ts:52-56
  @ApiProperty({
    description: "文件状态",
    enum: Object.values(FileStatus),  // Prisma 枚举
    enumName: "FileStatusEnum",
    required: false,
  })
  fileStatus?: FileStatus;  // Prisma 枚举类型
  ```

  虽然使用了 `Object.values()` 提取枚举值（而非直接传入枚举对象），但字段类型仍然是 Prisma 枚举，API 响应中会暴露 Prisma 内部枚举值。
- **修复建议**:
  1. 创建独立的 API 枚举（如 `src/common/enums/` 下），与 Prisma 枚举脱钩
  2. 在 DTO 中使用 API 枚举类型，在 Service 层进行转换
  3. 或使用 `enumName` + 字符串联合类型替代 Prisma 枚举引用
- **是否需要用户确认**: 是（涉及 API 契约变更）

### 问题 5.2：`policy-engine` DTO 直接导入 Prisma `Permission` 枚举

- **文件路径**: 
  - `src/policy-engine/dto/create-policy.dto.ts:24`
  - `src/policy-engine/dto/update-policy.dto.ts:24`
  - `src/policy-engine/dto/policy.dto.ts:22`
  - `src/policy-engine/dto/policy-config.dto.ts:22`
- **严重程度**: 低
- **问题描述**: 策略引擎的 DTO 文件使用 `import { Permission as PrismaPermission } from '@prisma/client'` 导入了 Prisma 枚举（虽然使用了别名），与项目规则不一致。
- **修复建议**: 使用 `src/common/enums/permissions.enum` 中的 `SystemPermission` 枚举替代。
- **是否需要用户确认**: 是

---

## 六、连接管理

### 问题 6.1：Prisma 连接池配置未显式设置 `connection_limit`

- **文件路径**: `src/database/database.service.ts:47-49`
- **严重程度**: 高
- **问题描述**: `DatabaseService` 使用 `@prisma/adapter-pg` 创建适配器时，只传入了 `connectionString`，未设置 `connection_limit` 参数。虽然配置文件 `configuration.ts:116` 定义了 `maxConnections: 20`，但此值并未传递给 Prisma PG 适配器。这意味着连接池使用 `pg` 库的默认值（10 个连接）。
- **修复建议**: 在 `PrismaPg` 构造函数中传入连接池配置：

  ```typescript
  const adapter = new PrismaPg(
    { connectionString: databaseUrl },
    {
      pool: {
        max: dbConfig.maxConnections,
        idleTimeoutMillis: dbConfig.idleTimeoutMillis,
        connectionTimeoutMillis: dbConfig.connectionTimeoutMillis,
      },
    }
  );
  ```
- **是否需要用户确认**: 否（配置未生效，属于 bug）

### 问题 6.2：慢查询阈值默认可适当调低

- **文件路径**: `src/database/database.service.ts:71-73`
- **严重程度**: 低
- **问题描述**: 慢查询检测阈值默认为 500ms。对于 OLTP 业务场景（文件操作、权限检查），超过 200ms 的查询通常就值得关注。仅在开发环境启用慢查询日志，生产环境缺少慢查询监控。
- **修复建议**:
  1. 将默认阈值调整为 200ms
  2. 在生产环境中也启用 query 事件监控（可设置更高的阈值如 1000ms），将慢查询发送到日志系统
- **是否需要用户确认**: 否

### 问题 6.3：Redis 连接未设置 `enableReadyCheck`

- **文件路径**: `src/redis/redis.module.ts:31`
- **严重程度**: 低
- **问题描述**: Redis 连接配置中 `enableReadyCheck: false`，这意味着应用可能在 Redis 完全就绪之前就开始发送命令。此外，未配置 `connectTimeout`、`keepAlive`、`family` 等生产环境推荐参数。
- **修复建议**: 
  1. 评估是否需要 `enableReadyCheck`
  2. 添加 `connectTimeout`（已配置在 config 中但未传递到 ioredis）
  3. 添加 `keepAlive: 30000` 防止空闲断开
- **是否需要用户确认**: 否

---

## 七、Redis 缓存

### 问题 7.1：`RedisCacheService` 使用 `keys` 命令进行模式匹配

- **文件路径**: 
  - `src/common/services/redis-cache.service.ts:111,128,240,266`
  - `src/cache-architecture/services/cache-version.service.ts:337`
- **严重程度**: 高
- **问题描述**: 多处使用 `redis.keys(pattern)` 进行模式匹配查询和缓存清理。在生产环境中 `KEYS` 命令会阻塞 Redis 主线程，特别是当 key 数量很大时可能导致 Redis 短暂不可用。
- **修复建议**: 使用 `SCAN` 命令（非阻塞游标迭代）替代 `KEYS`：

  ```typescript
  const keys: string[] = [];
  let cursor = '0';
  do {
    const result = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = result[0];
    keys.push(...result[1]);
  } while (cursor !== '0');
  ```
- **是否需要用户确认**: 否（生产环境风险）

### 问题 7.2：缓存键命名不统一

- **文件路径**: `src/common/services/redis-cache.service.ts:32` 和 `src/cache-architecture/services/cache-version.service.ts:54-55`
- **严重程度**: 低
- **问题描述**: 两个缓存服务使用了不同的键前缀约定：
  - `RedisCacheService`: `permission:user:`, `permission:node:`
  - `CacheVersionService`: `cache:version:`, `cache:version:lock:`
  
  缺乏统一的命名规范文档。
- **修复建议**: 在项目中创建缓存键命名规范文档（如 `docs/cache-key-convention.md`），统一前缀、分隔符和命名层级。
- **是否需要用户确认**: 否

### 问题 7.3：缓存穿透保护配置存在但未实际使用空值缓存

- **文件路径**: `src/cache-architecture/services/multi-level-cache.service.ts:88-92`
- **严重程度**: 中
- **问题描述**: `MultiLevelCacheService` 定义了 `penetrationConfig`（包含 `nullTTL: 60` 和 `bloomSize: 1000000`），但实际代码中未实现空值缓存逻辑。当 `get()` 返回 null 时，调用方无法区分"数据不存在"和"缓存未命中"，每次请求都会穿透到数据库。
- **修复建议**:
  1. 在 `get` 方法中实现空值缓存：当数据确实不存在于数据库时，缓存一个特殊标记（如 `__NULL__`），TTL 使用 `penetrationConfig.nullTTL`
  2. 或实现布隆过滤器来判断 key 是否可能不存在
- **是否需要用户确认**: 否

### 问题 7.4：多级缓存 `getOrLoad` 缺少并发保护

- **文件路径**: `src/cache-architecture/services/multi-level-cache.service.ts:214-228`
- **严重程度**: 中
- **问题描述**: `getOrLoad` 方法在缓存未命中时直接调用 `loader()` 从数据源加载。在高并发场景下，多个请求同时发现缓存未命中，会导致多个 `loader()` 同时执行（缓存击穿）。
- **修复建议**: 添加互斥锁或单飞（singleflight）模式：

  ```typescript
  async getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    // 获取分布式锁，只有一个请求执行 loader
    const lockKey = `lock:${key}`;
    const locked = await this.acquireLock(lockKey, 5000);
    if (!locked) {
      await sleep(100);
      return this.getOrLoad(key, loader);
    }
    try {
      const value = await loader();
      await this.set(key, value);
      return value;
    } finally {
      await this.releaseLock(lockKey);
    }
  }
  ```
- **是否需要用户确认**: 否

### 问题 7.5：缓存版本 `createVersion` 双重检查不完整

- **文件路径**: `src/cache-architecture/services/cache-version.service.ts:113-173`
- **严重程度**: 低
- **问题描述**: `createVersion` 方法在获取锁失败后，会检查现有版本并返回。但如果首次获取版本时返回 null（锁持有者尚未写入），则会继续进入锁获取逻辑。这里有微小的竞态窗口。
- **修复建议**: 在获取锁成功后，再次检查版本是否已存在（double-check pattern），避免重复创建。
- **是否需要用户确认**: 否

---

## 审查总结

| 类别 | 问题数 | 高 | 中 | 低 |
|------|--------|-----|-----|-----|
| Schema 设计 | 7 | 1 | 3 | 3 |
| 迁移文件 | 4 | 1 | 1 | 2 |
| 查询性能 | 4 | 0 | 1 | 3 |
| 软删除 | 3 | 1 | 1 | 1 |
| 枚举使用 | 2 | 0 | 1 | 1 |
| 连接管理 | 3 | 1 | 0 | 2 |
| Redis 缓存 | 5 | 1 | 2 | 2 |
| **合计** | **28** | **5** | **9** | **14** |

### 优先修复建议

**P0（立即修复）：**
1. `RefreshToken` 表添加外键约束和索引（问题 1.3）
2. User 查询添加 `deletedAt: null` 过滤（问题 4.1）
3. Redis `KEYS` 命令替换为 `SCAN`（问题 7.1）
4. Prisma 连接池配置未生效（问题 6.1）

**P1（近期修复）：**
5. DTO 中 Prisma 枚举违规（问题 5.1）
6. `CacheEntry` 表去留决定（问题 1.1）
7. 缓存穿透空值缓存实现（问题 7.3）
8. `getOrLoad` 并发保护（问题 7.4）
9. 迁移文件中的废弃枚举值清理（问题 2.2, 2.3）

**P2（计划修复）：**
10. 缓存键命名规范文档（问题 7.2）
11. 其余中低严重性问题

---

> **注**: 本报告仅指出问题，不包含代码修改。所有"是否需要用户确认"标记为"是"的问题应在修改前与团队讨论确认。
