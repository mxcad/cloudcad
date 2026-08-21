# BullMQ + NestJS 集成研究

**日期:** 2026-07-16
**用途:** CloudCAD 后端异步任务（批量下载/zip 打包等）技术选型

---

## 1. 包选择: `@nestjs/bullmq` vs `@nestjs/bull`

| 维度 | `@nestjs/bull` | `@nestjs/bullmq` |
|------|---------------|------------------|
| 底层库 | Bull (JS, 维护模式) | BullMQ (TS, 积极开发) |
| 最新版 | 11.0.2 | **11.0.4** |
| NestJS 兼容 | ^10.0.0 \|\| ^11.0.0 | ^10.0.0 \|\| ^11.0.0 |
| bullmq peer | — | ^3.0.0 \|\| ^4.0.0 \|\| ^5.0.0 |
| 类型安全 | 弱 (JS 包装) | **强 (原生 TS)** |
| Job progress | `number` | `number \| object` |
| Flow Producer | ❌ | ✅ |
| 官方推荐 | 遗留兼容 | ✅ **推荐** |

**结论：选择 `@nestjs/bullmq`**。Bull 处于维护模式，BullMQ 是活跃开发的现代版本，原生 TypeScript 支持，且与 NestJS 11 完全兼容。

### 安装

```bash
pnpm add @nestjs/bullmq bullmq
# 类型已内置，无需额外 @types
```

---

## 2. Redis 连接策略

### 现有 Redis 基础设施

CloudCAD 通过 `@nestjs-modules/ioredis` 管理 Redis 连接（`src/redis/redis.module.ts`），注入方式为 `@InjectRedis()`。该模块导出：
- `NestRedisModule` — 全局单例的 ioredis 客户端
- `REDIS_CLIENT` — 额外 Provider，提供一个独立的 `new Redis({...})` 实例

### 方案 A: BullMQ 使用独立连接（推荐）

BullMQ 内部会自行创建 `duplicate()` 连接用于阻塞操作（Worker 的 BRPOPLPUSH），最稳妥的方式是让 BullMQ 自行管理连接，复用相同的配置：

```typescript
// app.module.ts
import { BullModule } from '@nestjs/bullmq';

BullModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService<AppConfig>) => {
    const redis = config.get('redis', { infer: true });
    return {
      connection: {
        host: redis.host,
        port: redis.port,
        password: redis.password,
        db: redis.db,
        // Worker 需要 maxRetriesPerRequest: null
        maxRetriesPerRequest: null,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86400, count: 50 },
      },
    };
  },
  inject: [ConfigService],
});
```

> ⚠️ 注意：`maxRetriesPerRequest: null` 对 Worker 是必需项，否则 BullMQ 会抛出异常。但注意这与现有 `redis.module.ts` 中 `maxRetriesPerRequest: redisConfig.maxRetriesPerRequest` 不同（后者用的是用户配置值）。

### 方案 B: 复用现有 ioredis 实例（不推荐）

BullMQ 的 `connection` 选项可以直接接收一个 `IORedis` 实例。但 `@nestjs-modules/ioredis` 的内部 token 与 BullMQ 的 `BullModule` 互不感知，需要手动桥接：

```typescript
// 可以 work, 但不推荐 — 会与 @nestjs-modules/ioredis 的生命周期管理冲突
BullModule.forRootAsync({
  useFactory: (redis: Redis) => ({
    connection: redis, // 直接传入 ioredis 实例
  }),
  inject: [{ token: 'default_IORedisModuleConnectionToken', optional: false }],
});
```

**不推荐原因：**
1. `@nestjs-modules/ioredis` 和 BullMQ 可能在同一连接上互相干扰（ready/fclose 事件）
2. Worker 会 `duplicate()` 连接，即使传递实例也会创建新连接
3. 两个库的生命周期钩子可能冲突

---

## 3. Queue + Worker 模块示例

### 定义队列模块

```typescript
// src/modules/zip-export/zip-export.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ZipExportProcessor } from './zip-export.processor';
import { ZipExportService } from './zip-export.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'zip-export',
      // 可覆盖全局 connection（如有特殊 Redis 需求）
      // connection: { host: '...', port: ... },
    }),
  ],
  providers: [ZipExportProcessor, ZipExportService],
  exports: [ZipExportService],
})
export class ZipExportModule {}
```

### 定义 Worker (Processor)

```typescript
// src/modules/zip-export/zip-export.processor.ts
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';

interface ZipExportJobData {
  projectId: string;
  files: { id: string; name: string; path: string }[];
  requestedBy: string;
}

interface ZipExportProgress {
  completed: number;
  total: number;
  currentFile: string;
}

@Processor('zip-export', {
  concurrency: 3,
})
export class ZipExportProcessor extends WorkerHost {
  async process(job: Job<ZipExportJobData, string, 'export'>): Promise<string> {
    const { files } = job.data;
    const total = files.length;

    for (let i = 0; i < total; i++) {
      const file = files[i];

      // 报告进度
      await job.updateProgress({
        completed: i + 1,
        total,
        currentFile: file.name,
      } satisfies ZipExportProgress);

      // 实际处理...
      await this.packFile(file);
    }

    return `/tmp/exports/${job.id}.zip`;
  }

  private async packFile(file: ZipExportJobData['files'][0]): Promise<void> {
    // 文件打包逻辑
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    console.log(`Zip export completed: ${job.id}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    console.error(`Zip export failed: ${job.id}`, error);
  }

  @OnWorkerEvent('progress')
  onProgress(job: Job, progress: ZipExportProgress) {
    console.log(
      `Job ${job.id}: ${progress.completed}/${progress.total} - ${progress.currentFile}`,
    );
  }
}
```

### 生产者 (Producer)

```typescript
// src/modules/zip-export/zip-export.service.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class ZipExportService {
  constructor(
    @InjectQueue('zip-export') private readonly queue: Queue,
  ) {}

  async scheduleExport(projectId: string, files: { id: string; name: string; path: string }[], userId: string) {
    const job = await this.queue.add('export', {
      projectId,
      files,
      requestedBy: userId,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    return job.id;
  }

  async getJobStatus(jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    return {
      id: job.id,
      state: await job.getState(),
      progress: job.progress,
      result: job.returnvalue,
      failedReason: job.failedReason,
    };
  }
}
```

---

## 4. Job Progress 报告

BullMQ 的 `job.updateProgress()` 接受 `number | object`：

```typescript
// 数字进度（0-100）
await job.updateProgress(50);

// 对象进度（推荐用于批量文件处理）
await job.updateProgress({
  completed: 5,
  total: 100,
  currentFile: 'drawing-005.dwg',
});

// Worker 端监听
@OnWorkerEvent('progress')
onProgress(job: Job, progress: ZipExportProgress) { ... }

// QueueEvents 端监听（跨进程）
const events = new QueueEvents('zip-export');
events.on('progress', ({ jobId, data }) => {
  // data 即是 updateProgress 传入的对象
});
```

**自定义进度接口建议：**

```typescript
// src/modules/zip-export/interfaces/progress.interface.ts
export interface BatchFileProgress {
  completed: number;
  total: number;
  currentFile: string;
  errors?: { file: string; message: string }[];
}
```

---

## 5. Concurrency & Retry 策略

### Concurrency

在 `@Processor()` 装饰器中设置：

```typescript
@Processor('zip-export', { concurrency: 5 })
```

含义：该 Worker 实例同时最多处理 5 个 job。如有多个 Worker 实例，总并发 = concurrency × 实例数。

### Retry + Backoff

两种设置方式：

```typescript
// 方案 A: 全局默认 (forRoot)
BullModule.forRoot({
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
});

// 方案 B: 每次 add 时覆盖
await queue.add('export', data, {
  attempts: 5,
  backoff: { type: 'fixed', delay: 5000 },
});
```

内置 backoff 类型:
| 类型 | 公式 | 适用场景 |
|------|------|----------|
| `fixed` | `delay` | 固定间隔重试 |
| `exponential` | `2^(attempt-1) × delay` | 网络故障、临时不可用 |

---

## 6. 与现有代码集成要点

| 现有文件 | 与 BullMQ 的关系 |
|----------|-----------------|
| `src/redis/redis.module.ts` | 不直接修改。BullMQ 用自己 `forRootAsync` 的连接配置，与其平行运行 |
| `src/common/concurrency/rate-limiter.ts` | 可逐步替换为 BullMQ 的 Worker concurrency + limiter |
| `src/conversion/process-runner.service.ts` | 可逐步迁移到队列模式 |
| `@nestjs/schedule` (cron) | 互补：cron 触发队列 job，而非直接执行业务逻辑 |

### 与 ConfigService 对接

Redis 配置已通过 `ConfigService<AppConfig>` 暴露。BullMQ 的 `forRootAsync` 直接使用同一 ConfigService：

```typescript
BullModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService<AppConfig>) => ({
    connection: {
      host: config.get('redis.host'),
      port: config.get('redis.port'),
      password: config.get('redis.password'),
      db: config.get('redis.db'),
      maxRetriesPerRequest: null,
    },
    defaultJobOptions: {
      attempts: config.get('queue.defaultAttempts', 3),
      backoff: { type: 'exponential', delay: 2000 },
    },
  }),
  inject: [ConfigService],
});
```

---

## 7. 已知问题 & 注意事项

1. **`maxRetriesPerRequest: null` 与现有配置冲突**
   - 现有 `redis.module.ts` 使用 `maxRetriesPerRequest: redisConfig.maxRetriesPerRequest`（用户配置值）
   - BullMQ Worker **强制要求** `maxRetriesPerRequest: null`
   - 解决：BullMQ 使用独立的连接配置（推荐），不与 `@nestjs-modules/ioredis` 共享连接

2. **TypeScript 版本注意**
   - `package.json` 声明 `typescript: ~5.0.0` 但 lockfile 解析到 5.9.3
   - BullMQ 利用 TS 5.x 特性（如 `satisfies`），需确保 CI 实际使用 5.9+
   - 建议在 `AGENTS.md` 中注明实际依赖 5.9.3

3. **不使用 `keyPrefix`**
   - BullMQ 文档明确禁止在 ioredis 中使用 `keyPrefix`
   - BullMQ 有自己的 `prefix` 选项（默认 `bull`）

4. **`noeviction` 策略**
   - Redis 必须设置 `maxmemory-policy=noeviction`，否则 Redis 自动淘汰可能损坏队列数据

5. **测试 mock**
   - 参考现有测试中 mock ioredis 的写法（`"default_IORedisModuleConnectionToken"`）
   - BullMQ 的 Queue/Worker 在测试中可替换为 `new Queue()` 连接测试 Redis，或用 `jest.mock('bullmq')`

---

## 8. 版本锁定建议

```json
{
  "dependencies": {
    "@nestjs/bullmq": "^11.0.4",
    "bullmq": "^5.79.0"
  }
}
```

使用 `pnpm add` 安装后，lockfile 会锁定具体版本。

---

## 参考来源

- [NestJS Queues 官方文档](https://docs.nestjs.com/techniques/queues)
- [BullMQ NestJS 集成](https://taskforcesh-bullmq.mintlify.app/integrations/nestjs)
- [BullMQ Connections](https://docs.bullmq.io/guide/connections)
- [BullMQ Retrying Failing Jobs](https://docs.bullmq.io/guide/retrying-failing-jobs)
- [@nestjs/bullmq npm](https://www.npmjs.com/package/@nestjs/bullmq) — peer deps: `@nestjs/common ^10||^11`, `@nestjs/core ^10||^11`, `bullmq ^3||^4||^5`
- CloudCAD 源码: `src/redis/redis.module.ts`, `src/common/concurrency/rate-limiter.ts`
- [nestjs/bull 仓库](https://github.com/nestjs/bull) — 同一 monorepo 管理 `@nestjs/bull` + `@nestjs/bullmq`
