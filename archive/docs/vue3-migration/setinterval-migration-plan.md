# setInterval 迁移方案：cache-monitor.service.ts

汇报人：Trea

## 一、现状分析

### 1.1 setInterval 用途与间隔

**文件位置**：`packages/backend/src/cache-architecture/services/cache-monitor.service.ts`

**使用位置**：构造函数中（第 53 行）

```typescript
private readonly monitoringInterval = 60000; // 1 分钟

constructor(...) {
  // 定期清理过期的性能数据
  setInterval(() => this.cleanOldPerformanceData(), this.monitoringInterval);
}
```

**用途**：定期清理过期的性能数据，保留最近 24 小时的数据（`cleanOldPerformanceData` 方法）

**执行间隔**：每分钟执行一次（60000ms）

### 1.2 现有定时任务模式参考

项目中已有多处使用 `@nestjs/schedule` 的定时任务实现，主要模式如下：

| 文件 | 装饰器使用 | 执行频率 |
|------|-----------|---------|
| `cache-cleanup.scheduler.ts` | `@Cron(CronExpression.EVERY_10_MINUTES)` | 每10分钟 |
| `cache-cleanup.scheduler.ts` | `@Cron(CronExpression.EVERY_HOUR)` | 每小时 |
| `cache-cleanup.scheduler.ts` | `@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)` | 每天午夜 |
| `cache-warmup.service.ts` | `@Cron(CronExpression.EVERY_HOUR)` | 每小时 |

**模块注册方式**（参考 `scheduler.module.ts`）：
```typescript
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ScheduleModule.forRoot(), CommonModule],
  providers: [CacheCleanupScheduler],
})
export class SchedulerModule {}
```

## 二、迁移方案

### 2.1 推荐方案

**方案一：使用 `@Interval` 装饰器（推荐）**

适用场景：固定间隔执行的任务，与原 `setInterval` 行为最接近

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
// ... 其他导入

@Injectable()
export class CacheMonitorService {
  private readonly logger = new Logger(CacheMonitorService.name);
  private readonly performanceData: Map<string, PerformanceDataPoint[]> =
    new Map();
  private readonly maxDataPoints = 1000;
  // 移除 monitoringInterval 常量（不再需要）

  constructor(
    private readonly cacheService: MultiLevelCacheService,
    private readonly l1Cache: L1CacheProvider,
    private readonly l2Cache: L2CacheProvider,
    private readonly l3Cache: L3CacheProvider
  ) {
    // 移除构造函数中的 setInterval 调用
  }

  @Interval(60000) // 每分钟执行一次
  private cleanOldPerformanceData(): void {
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 保留 24 小时的数据

    for (const [levelKey, data] of this.performanceData.entries()) {
      const filteredData = data.filter(
        (point) => point.timestamp >= cutoffTime
      );
      this.performanceData.set(levelKey, filteredData);
    }

    this.logger.debug('已清理过期的性能数据');
  }

  // ... 其他方法
}
```

**方案二：使用 `@Cron` 装饰器**

适用场景：需要更灵活的调度策略

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CacheMonitorService {
  // ... 

  @Cron(CronExpression.EVERY_MINUTE) // 每分钟执行一次
  private cleanOldPerformanceData(): void {
    // ... 清理逻辑
  }
}
```

### 2.2 模块配置检查

**当前状态**：`cache-architecture.module.ts` 已导入 `ScheduleModule`

```typescript
import { ScheduleModule } from '@nestjs/schedule'; // 第 15 行
```

**确认事项**：无需额外配置，模块已支持定时任务

### 2.3 代码修改清单

| 修改位置 | 修改内容 |
|---------|---------|
| `cache-monitor.service.ts:13` | 添加 `import { Interval } from '@nestjs/schedule'` |
| `cache-monitor.service.ts:44` | 移除 `private readonly monitoringInterval = 60000;` |
| `cache-monitor.service.ts:51-54` | 移除构造函数中的 `setInterval` 调用 |
| `cache-monitor.service.ts:419` | 在 `cleanOldPerformanceData` 方法前添加 `@Interval(60000)` 装饰器 |

## 三、影响评估

### 3.1 功能影响

| 方面 | 影响 | 评估 |
|-----|------|------|
| 执行频率 | 保持每分钟执行一次 | 无变化 |
| 清理逻辑 | 完全一致 | 无变化 |
| 数据保留 | 仍保留24小时数据 | 无变化 |

### 3.2 架构影响

| 方面 | 影响 | 评估 |
|-----|------|------|
| 可测试性 | 可通过 `SchedulerRegistry` 控制任务 | 提升 |
| 生命周期 | NestJS 自动管理，模块销毁时自动停止 | 提升 |
| 一致性 | 与项目其他定时任务保持一致 | 提升 |
| 可观测性 | 可通过 `SchedulerRegistry` 获取任务状态 | 提升 |

### 3.3 风险评估

| 风险 | 等级 | 缓解措施 |
|-----|------|---------|
| `ScheduleModule` 未正确配置 | 低 | 模块已导入，风险极低 |
| 方法访问修饰符问题 | 低 | `cleanOldPerformanceData` 为 private，迁移后仍为 private |
| 定时任务冲突 | 低 | 无其他每分钟执行的同类任务 |

## 四、迁移验证清单

- [ ] 添加 `@nestjs/schedule` 导入
- [ ] 移除构造函数中的 `setInterval` 调用
- [ ] 添加 `@Interval(60000)` 装饰器
- [ ] 移除未使用的 `monitoringInterval` 常量
- [ ] 运行单元测试确认功能正常
- [ ] 启动应用验证定时任务正常执行

## 五、总结

本迁移方案将 `cache-monitor.service.ts` 中的原生 `setInterval` 迁移到 `@nestjs/schedule` 的 `@Interval` 装饰器，实现了：

1. **功能等价**：保持每分钟清理一次的行为
2. **架构一致性**：与项目现有定时任务模式统一
3. **可测试性提升**：便于在测试中控制和验证定时任务
4. **生命周期管理**：由 NestJS 容器自动管理任务启停

迁移工作量小，风险低，收益明显。