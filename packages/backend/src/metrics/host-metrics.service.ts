import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import client from 'prom-client';
import * as fs from 'node:fs';
import * as os from 'node:os';

/** 主机指标采样间隔（毫秒）：Prometheus 抓取间隔 15s，5s 采样保证抓到新鲜值 */
export const HOST_METRICS_SAMPLE_INTERVAL_MS = 5_000;

export interface CpuTimesSample {
  idle: number;
  total: number;
}

/** 采样一次全核 CPU 时间片累计（/proc 与 Windows 均可从 os.cpus() 取得） */
export function sampleCpuTimes(): CpuTimesSample {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.idle +
      cpu.times.irq;
  }
  return { idle, total };
}

/** 由两次采样增量计算 CPU 使用率百分比（0-100） */
export function computeCpuUsagePercent(
  prev: CpuTimesSample,
  next: CpuTimesSample
): number | null {
  const dTotal = next.total - prev.total;
  if (dTotal <= 0) return null;
  return ((dTotal - (next.idle - prev.idle)) / dTotal) * 100;
}

/** 计算内存使用率百分比（0-100） */
export function computeMemoryUsagePercent(total: number, free: number): number {
  if (total <= 0) return 0;
  return ((total - free) / total) * 100;
}

// 模块级单例注册：prom-client 全局注册表同名指标只能注册一次，
// 进程内服务为单例，测试中重复实例化也不会冲突
const cpuUsagePercent = new client.Gauge({
  name: 'host_cpu_usage_percent',
  help: 'Host-wide CPU usage percentage (sampled)',
});
const memoryUsagePercent = new client.Gauge({
  name: 'host_memory_usage_percent',
  help: 'Host-wide memory usage percentage',
});
const diskFreePercent = new client.Gauge({
  name: 'host_disk_free_percent',
  help: 'Free space percentage per monitored filesystem path',
  labelNames: ['mount'] as const,
});

/**
 * 主机级指标采集（ADR-0055 §4 / #316）：
 * 后端进程内采样 CPU / 内存 / 磁盘剩余，暴露 host_* gauge 到 /api/metrics，
 * 使 alert-rules.yml 的三条主机级告警（CPU>85% / 内存>85% / 磁盘剩余<10%）无需
 * 额外部署 node_exporter——与「与部署形态无关」硬约束一致（Windows 裸机同样可用）。
 */
@Injectable()
export class HostMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HostMetricsService.name);

  private timer: NodeJS.Timeout | undefined;
  private prevCpuSample: CpuTimesSample = sampleCpuTimes();
  private readonly diskPaths: string[];

  constructor(configService: ConfigService) {
    this.diskPaths = configService.get<string[]>('metrics.hostDiskPaths') ?? [
      process.cwd(),
    ];
  }

  onModuleInit(): void {
    this.sample();
    this.timer = setInterval(
      () => this.sample(),
      HOST_METRICS_SAMPLE_INTERVAL_MS
    );
    // 不阻止进程退出
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** 供单测直接驱动一轮采样（等待本轮磁盘采样完成，避免断言竞态） */
  protected async runSample(): Promise<void> {
    this.inflight = [];
    this.sample();
    await Promise.allSettled(this.inflight);
  }

  private inflight: Array<Promise<void>> = [];

  private sample(): void {
    try {
      const next = sampleCpuTimes();
      const cpuPercent = computeCpuUsagePercent(this.prevCpuSample, next);
      if (cpuPercent !== null) {
        cpuUsagePercent.set(cpuPercent);
      }
      this.prevCpuSample = next;

      memoryUsagePercent.set(
        computeMemoryUsagePercent(os.totalmem(), os.freemem())
      );

      for (const path of this.diskPaths) {
        this.inflight.push(this.sampleDisk(path));
      }
    } catch (err) {
      this.logger.warn(
        `host metrics sampling failed: ${(err as Error).message}`
      );
    }
  }

  private async sampleDisk(path: string): Promise<void> {
    try {
      const stats = await fs.promises.statfs(path);
      if (stats.blocks > 0) {
        diskFreePercent.set(
          { mount: path },
          (stats.bavail / stats.blocks) * 100
        );
      }
    } catch (err) {
      this.logger.warn(
        `disk metrics failed for ${path}: ${(err as Error).message}`
      );
    }
  }
}
