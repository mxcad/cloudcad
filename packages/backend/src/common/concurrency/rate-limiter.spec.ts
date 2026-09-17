///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { RateLimiter } from './rate-limiter';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('RateLimiter', () => {
  describe('duration stats', () => {
    it('should return zero-sample stats initially', () => {
      const limiter = new RateLimiter(2);
      expect(limiter.getDurationStats()).toEqual({
        sampleCount: 0,
        p50DurationMs: null,
        p95DurationMs: null,
        p50WaitMs: null,
        p95WaitMs: null,
      });
    });

    it('should record duration and wait samples for completed tasks', async () => {
      const limiter = new RateLimiter(2);
      await limiter.execute(async () => {
        await sleep(30);
      });

      const stats = limiter.getDurationStats();
      expect(stats.sampleCount).toBe(1);
      expect(stats.p50DurationMs).toBeGreaterThanOrEqual(25);
      expect(stats.p95DurationMs).toBeGreaterThanOrEqual(25);
      // 单任务无需排队，等待时长应为 0
      expect(stats.p50WaitMs).toBe(0);
    });

    it('should keep the sample buffer bounded at 500', async () => {
      const limiter = new RateLimiter(2);
      for (let i = 0; i < 505; i += 1) {
        await limiter.execute(async () => {
          await sleep(1);
        });
      }
      expect(limiter.getDurationStats().sampleCount).toBe(500);
    });

    it('should not record samples for tasks rejected by clearQueue (never started)', async () => {
      const limiter = new RateLimiter(1);
      // 占住唯一槽位
      const blocker = limiter.execute(async () => {
        await sleep(50);
      });
      const queued = limiter.execute(async () => {
        /* 被 clearQueue 取消 */
      });
      await sleep(10);
      expect(limiter.clearQueue()).toBe(1);
      await expect(queued).rejects.toThrow('队列已清空');
      await blocker;

      // 仅 blocker 正常完成并记 1 个样本；被取消任务未开始执行，不记样本
      const stats = limiter.getDurationStats();
      expect(stats.sampleCount).toBe(1);
      expect(stats.p50DurationMs).toBeGreaterThanOrEqual(45);
    });

    it('should reject a hung task on timeout, free the slot, and skip its sample', async () => {
      const limiter = new RateLimiter(1, 50);
      // 卡死任务：远超 50ms 超时。回归：旧实现超时定时器在任务开始时即被清除，
      // 卡死任务永不 reject、槽位永不释放
      const hung = limiter.execute(async () => {
        await sleep(500);
      });
      const hungExpect = expect(hung).rejects.toThrow('任务执行超时 (50ms)');
      await sleep(80);
      await hungExpect;

      // 超时 handler 已释放槽位：新任务立即可执行
      const t0 = Date.now();
      await limiter.execute(async () => {
        await sleep(10);
      });
      expect(Date.now() - t0).toBeLessThan(300);
      expect(limiter.getRunningCount()).toBe(0);

      // 超时任务未真正执行完，不计入耗时样本；仅后续正常任务记 1 个
      expect(limiter.getDurationStats().sampleCount).toBe(1);
    });

    it('should clear the timeout timer when a task finishes before the deadline', async () => {
      const limiter = new RateLimiter(1, 500);
      await limiter.execute(async () => {
        await sleep(10);
      });
      // 正常完成的任务不应留下待触发的定时器：再等远超超时时长后无副作用
      await sleep(20);
      expect(limiter.getRunningCount()).toBe(0);
      expect(limiter.getDurationStats().sampleCount).toBe(1);
    });
  });
});
