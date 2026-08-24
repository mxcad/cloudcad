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

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { normalizeStoredIp } from '../ip-blacklist/ip-blacklist.utils';
import { IpWhitelistService } from '../ip-whitelist/ip-whitelist.service';
import { IpBlacklistService } from '../ip-blacklist/ip-blacklist.service';
import type { SecurityAttemptReason } from '@cloudcad/db';
import type {
  SecurityAccessAttemptAggregateDto,
  SecurityAccessAttemptListResponseDto,
} from './dto/security-access-attempt.dto';

/** 被记录的高危接口（仅管理员登录入口；后续如需扩展可在此追加） */
export const SECURITY_ENDPOINT_ADMIN_LOGIN = '/api/v1/admin/auth/login';

/**
 * 高危接口访问尝试记录服务
 *
 * 目的：认证前（IP 白名单拦截 / 账号不存在等）拿不到合法 userId，
 * audit_logs.userId 为强外键无法写入，故独立存储到 security_access_attempts，
 * 供安全回溯、按 IP 聚合展示、一键拉白/拉黑。
 *
 * 写路径：AdminAuthService 在被拒分支调用 record()；写库失败不阻塞登录流程（fail-open）。
 * 读路径：按 IP 聚合（groupBy），附当前 IP 在白名单 / 黑名单的状态，供前端决策。
 */
@Injectable()
export class SecurityAccessAttemptService {
  private readonly logger = new Logger(SecurityAccessAttemptService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly ipWhitelistService: IpWhitelistService,
    private readonly ipBlacklistService: IpBlacklistService
  ) {}

  /**
   * 记录一次高危接口访问尝试。IP 归一化失败（非法/空）则跳过（防御脏数据）。
   * 写库失败仅告警日志，不抛出（登录拒绝流程不能被审计副作用打断）。
   */
  async record(params: {
    ip: string;
    endpoint: string;
    reason: SecurityAttemptReason;
    account?: string;
    userAgent?: string;
  }): Promise<void> {
    const ip = normalizeStoredIp(params.ip);
    if (!ip) {
      this.logger.warn(
        `高危访问尝试跳过记录：非法 IP=${params.ip} reason=${params.reason}`
      );
      return;
    }
    try {
      await this.prisma.securityAccessAttempt.create({
        data: {
          ip,
          endpoint: params.endpoint,
          reason: params.reason,
          account: params.account?.slice(0, 200) || null,
          userAgent: params.userAgent?.slice(0, 500) || null,
        },
      });
    } catch (error) {
      this.logger.error(
        `高危访问尝试记录写入失败（业务不阻塞）: ${
          (error as Error).message
        } ip=${ip} reason=${params.reason}`
      );
    }
  }

  /**
   * 按 IP 聚合分页查询高危访问尝试。
   * 聚合维度：count / firstSeen / lastSeen / reasons 分布 / 最近一条 account / userAgent，
   * 并标注该 IP 当前是否已在白名单 / 黑名单。
   */
  async listAggregated(
    page = 1,
    pageSize = 20,
    keyword?: string
  ): Promise<SecurityAccessAttemptListResponseDto> {
    const safePage = Number(page) || 1;
    const safeSize = Number(pageSize) || 20;
    const skip = (safePage - 1) * safeSize;

    // groupBy 拿到每个 IP 的聚合计数与时序
    const grouped = await this.prisma.securityAccessAttempt.groupBy({
      by: ['ip'],
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    });

    // 关键词过滤（IP / 账号无法在 groupBy 上直接过滤，这里先聚合后按 IP 再查明细过滤）
    let ipList = grouped.map((g) => g.ip);
    if (keyword?.trim()) {
      // 按 IP 匹配
      ipList = ipList.filter((ip) => ip.includes(keyword.trim().toLowerCase()));
    }
    ipList.sort((a, b) => {
      const ta =
        grouped.find((g) => g.ip === a)?._max.createdAt ?? new Date(0);
      const tb =
        grouped.find((g) => g.ip === b)?._max.createdAt ?? new Date(0);
      return tb.getTime() - ta.getTime();
    });

    const total = ipList.length;
    const pageIps = ipList.slice(skip, skip + safeSize);

    const items = await Promise.all(
      pageIps.map((ip) => this.buildAggregate(ip, grouped))
    );

    return { items, total, page: safePage, pageSize: safeSize };
  }

  private async buildAggregate(
    ip: string,
    grouped: {
      ip: string;
      _count: { _all: number };
      _min: { createdAt: Date | null };
      _max: { createdAt: Date | null };
    }[]
  ): Promise<SecurityAccessAttemptAggregateDto> {
    const group = grouped.find((g) => g.ip === ip);

    // reasons 分布 + 最近一条 account/userAgent
    const [reasons, latest] = await Promise.all([
      this.prisma.securityAccessAttempt.groupBy({
        by: ['reason'],
        where: { ip },
        _count: { _all: true },
      }),
      this.prisma.securityAccessAttempt.findFirst({
        where: { ip },
        orderBy: { createdAt: 'desc' },
        select: { account: true, userAgent: true },
      }),
    ]);

    const [inWhitelist, inBlacklist] = await Promise.all([
      this.ipWhitelistService.isAllowed(ip),
      this.ipBlacklistService.isBlocked(ip),
    ]);

    const reasonsMap: Record<string, number> = {};
    for (const r of reasons) {
      reasonsMap[r.reason] = r._count._all;
    }

    return {
      ip,
      firstSeen: group?._min.createdAt ?? new Date(),
      lastSeen: group?._max.createdAt ?? new Date(),
      count: group?._count._all ?? 0,
      reasons: reasonsMap,
      account: latest?.account ?? null,
      userAgent: latest?.userAgent ?? null,
      inWhitelist,
      inBlacklist,
    };
  }
}
