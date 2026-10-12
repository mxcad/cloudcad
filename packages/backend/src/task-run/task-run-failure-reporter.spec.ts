import { TaskRunFailureReporter } from './task-run-failure-reporter';
import { TASK_RUN_FAILED_LEVEL } from '../alert/enums/alert.enum';

describe('TaskRunFailureReporter', () => {
  let raise: jest.Mock;
  let reporter: TaskRunFailureReporter;

  beforeEach(() => {
    raise = jest.fn().mockResolvedValue({});
    reporter = new TaskRunFailureReporter({ raise } as never);
  });

  it('协议单点：messageKey=task_run_failed + level=TASK_RUN_FAILED_LEVEL', async () => {
    await reporter.reportTaskFailed({
      source: 'scheduler:billing',
      task: 'timeoutPendingOrders',
      error: new Error('boom'),
    });

    expect(raise).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'scheduler:billing',
        messageKey: 'task_run_failed',
        level: TASK_RUN_FAILED_LEVEL,
      })
    );
  });

  it('默认前缀：source 去 scheduler: 前缀 → 定时任务 billing 失败（task）: 错误文本', async () => {
    await reporter.reportTaskFailed({
      source: 'scheduler:billing',
      task: 'timeoutPendingOrders',
      error: new Error('boom'),
    });

    expect(raise).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '定时任务 billing 失败（timeoutPendingOrders）: boom',
        detail: { task: 'timeoutPendingOrders', error: 'boom' },
      })
    );
  });

  it('无前缀 source 原样使用（cache-monitor 形态）', async () => {
    await reporter.reportTaskFailed({
      source: 'cache-monitor',
      task: 'cleanOldPerformanceData',
      error: new Error('boom'),
    });

    expect(raise).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '定时任务 cache-monitor 失败（cleanOldPerformanceData）: boom',
      })
    );
  });

  it('自定义前缀（真 adapter 措辞：备份/演练/手动触发）', async () => {
    await reporter.reportTaskFailed({
      source: 'scheduler:backup',
      task: 'backup:database',
      error: new Error('pg_dump failed'),
      messagePrefix: '数据库备份失败',
    });

    expect(raise).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '数据库备份失败: pg_dump failed',
      })
    );
  });

  it('extraDetail 合并进 detail（手动触发 triggeredBy）', async () => {
    await reporter.reportTaskFailed({
      source: 'task-run:manual',
      task: 'billing:timeout-orders',
      error: new Error('boom'),
      messagePrefix: '手动触发任务 billing:timeout-orders 失败',
      extraDetail: { triggeredBy: 'op-1' },
    });

    expect(raise).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          task: 'billing:timeout-orders',
          error: 'boom',
          triggeredBy: 'op-1',
        },
      })
    );
  });

  it('非 Error 的 error → String() 提取', async () => {
    await reporter.reportTaskFailed({
      source: 'scheduler:billing',
      task: 'timeoutPendingOrders',
      error: 'plain failure',
    });

    expect(raise).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '定时任务 billing 失败（timeoutPendingOrders）: plain failure',
        detail: { task: 'timeoutPendingOrders', error: 'plain failure' },
      })
    );
  });

  it('告警上报失败仅记日志，不向调用方抛出', async () => {
    raise.mockRejectedValue(new Error('alert down'));

    await expect(
      reporter.reportTaskFailed({
        source: 'scheduler:billing',
        task: 'timeoutPendingOrders',
        error: new Error('boom'),
      })
    ).resolves.toBeUndefined();
  });
});
