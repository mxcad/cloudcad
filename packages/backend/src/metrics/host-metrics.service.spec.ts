// default import：esModuleInterop 下直接指向 node 内建模块的真实导出对象，
// jest.spyOn 才能拦截被测服务（经 star-import 包装的独立命名空间）内部的调用
import fs from 'node:fs';
import os from 'node:os';
import client from 'prom-client';
import {
  HOST_METRICS_SAMPLE_INTERVAL_MS,
  HostMetricsService,
  computeCpuUsagePercent,
  computeMemoryUsagePercent,
  type CpuTimesSample,
} from './host-metrics.service';

function makeConfigService(diskPaths?: string[]) {
  return { get: jest.fn().mockReturnValue(diskPaths) };
}

async function gaugeValue(name: string, labels?: Record<string, string>) {
  const metric = client.register.getSingleMetric(name);
  if (!metric) return undefined;
  const json = await metric.get();
  const match = json.values.find((v) =>
    labels
      ? Object.entries(labels).every(([k, val]) => v.labels[k] === val)
      : true
  );
  return match?.value;
}

describe('host metrics 纯函数（#316）', () => {
  describe('computeCpuUsagePercent', () => {
    it('全空闲增量为 0%', () => {
      const prev: CpuTimesSample = { idle: 100, total: 200 };
      const next: CpuTimesSample = { idle: 150, total: 250 };
      expect(computeCpuUsagePercent(prev, next)).toBeCloseTo(0);
    });

    it('一半忙闲为 50%', () => {
      const prev: CpuTimesSample = { idle: 100, total: 200 };
      const next: CpuTimesSample = { idle: 125, total: 250 };
      expect(computeCpuUsagePercent(prev, next)).toBeCloseTo(50);
    });

    it('增量非正时返回 null（避免除零/时钟回拨误报）', () => {
      const prev: CpuTimesSample = { idle: 100, total: 200 };
      expect(computeCpuUsagePercent(prev, prev)).toBeNull();
    });
  });

  describe('computeMemoryUsagePercent', () => {
    it('按总量归一化', () => {
      expect(computeMemoryUsagePercent(1000, 200)).toBeCloseTo(80);
    });
    it('总量非法时返回 0 而非 NaN', () => {
      expect(computeMemoryUsagePercent(0, 0)).toBe(0);
    });
  });
});

describe('HostMetricsService', () => {
  // jest 配置 resetMocks/restoreMocks 会还原跨测试的 spy，
  // 因此 os / fs 的 mock 在每个用例内单独安装
  let cpuTimes: { idle: number; busy: number };
  let memoryState: { total: number; free: number };
  const statfsResults = new Map<
    string,
    { blocks: number; bavail: number } | Error
  >();

  function installHostMocks(): void {
    cpuTimes = { idle: 0, busy: 0 };
    memoryState = { total: 1000, free: 300 };
    statfsResults.clear();
    jest.spyOn(os, 'cpus').mockImplementation(
      () =>
        [
          {
            model: 'test',
            speed: 2400,
            times: {
              user: cpuTimes.busy,
              nice: 0,
              sys: 0,
              idle: cpuTimes.idle,
              irq: 0,
            },
          },
        ] as unknown as os.CpuInfo[]
    );
    jest.spyOn(os, 'totalmem').mockImplementation(() => memoryState.total);
    jest.spyOn(os, 'freemem').mockImplementation(() => memoryState.free);
    jest
      .spyOn(fs.promises, 'statfs')
      .mockImplementation(async (path: unknown) => {
        const entry = statfsResults.get(String(path));
        if (!entry) throw new Error(`no statfs stub for ${String(path)}`);
        if (entry instanceof Error) throw entry;
        return entry as unknown as fs.StatsFs;
      });
  }

  function createService(diskPaths?: string[]): HostMetricsService {
    return new HostMetricsService(makeConfigService(diskPaths) as never);
  }

  async function runSample(service: HostMetricsService): Promise<void> {
    await (
      service as unknown as { runSample: () => Promise<void> }
    ).runSample();
  }

  it('采样后暴露 host_cpu_usage_percent 与 host_memory_usage_percent', async () => {
    installHostMocks();
    const service = createService([]);
    cpuTimes = { idle: 100, busy: 100 }; // prev: idle=100,total=200
    await runSample(service);

    cpuTimes = { idle: 110, busy: 140 }; // dIdle=10,dTotal=50 → 80%
    await runSample(service);

    memoryState = { total: 1000, free: 300 };
    await runSample(service);

    expect(await gaugeValue('host_cpu_usage_percent')).toBeCloseTo(80, 1);
    expect(await gaugeValue('host_memory_usage_percent')).toBeCloseTo(70, 1);

    service.onModuleDestroy();
  });

  it('磁盘采样路径来自 metrics.hostDiskPaths 配置并带 mount 标签', async () => {
    installHostMocks();
    statfsResults.set('/data', { blocks: 1000, bavail: 100 });
    statfsResults.set('/app/logs', { blocks: 1000, bavail: 900 });
    const service = createService(['/data', '/app/logs']);

    await runSample(service);

    expect(
      await gaugeValue('host_disk_free_percent', { mount: '/data' })
    ).toBeCloseTo(10, 1);
    expect(
      await gaugeValue('host_disk_free_percent', { mount: '/app/logs' })
    ).toBeCloseTo(90, 1);

    service.onModuleDestroy();
  });

  it('未配置磁盘路径时回退进程工作目录', async () => {
    installHostMocks();
    statfsResults.set(process.cwd(), { blocks: 100, bavail: 50 });
    const service = createService(undefined);

    await runSample(service);

    expect(
      await gaugeValue('host_disk_free_percent', { mount: process.cwd() })
    ).toBeCloseTo(50, 1);

    service.onModuleDestroy();
  });

  it('statfs 失败不抛出且不影响其他指标', async () => {
    installHostMocks();
    statfsResults.set('/broken', new Error('permission denied'));
    const service = createService(['/broken']);

    await expect(runSample(service)).resolves.not.toThrow();

    expect(await gaugeValue('host_memory_usage_percent')).toBeCloseTo(70, 1);
    expect(
      await gaugeValue('host_disk_free_percent', { mount: '/broken' })
    ).toBeUndefined();

    service.onModuleDestroy();
  });

  it('采样间隔常量为 5 秒（Prometheus 15s 抓取内保证新鲜）', () => {
    expect(HOST_METRICS_SAMPLE_INTERVAL_MS).toBe(5_000);
  });
});
