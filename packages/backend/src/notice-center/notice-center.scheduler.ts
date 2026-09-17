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

/**
 * 通知定时任务：到点推送 + 到期自动下线。
 *
 * 不需要分布式锁：两个任务都用数据库 compare-and-set（updateMany 返回的 count）
 * 做原子抢占，多实例并发跑时只有一个实例能完成同一次状态迁移，其余 count=0 直接跳过。
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NoticeCenterService } from './notice-center.service';

/** 每分钟检查一次；公告的到点精度到分钟已足够（停机公告给的是分钟级提前量） */
const NOTICE_REFRESH_CRON = '* * * * *';

@Injectable()
export class NoticeCenterScheduler {
  private readonly logger = new Logger(NoticeCenterScheduler.name);

  constructor(private readonly noticeService: NoticeCenterService) {}

  @Cron(NOTICE_REFRESH_CRON)
  async refresh(): Promise<void> {
    try {
      // 两个任务互相独立，一起跑；任一失败不影响另一个
      await Promise.all([
        this.noticeService.pushDueNotices(),
        this.noticeService.expireDueNotices(),
      ]);
    } catch (err) {
      this.logger.error(`通知定时任务失败: ${(err as Error).message}`);
    }
  }
}
