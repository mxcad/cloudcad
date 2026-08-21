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

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import Redis from 'ioredis';
import { DatabaseService } from '../database/database.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import { BlacklistSource, Prisma, type IpBlacklistEntry } from '@cloudcad/db';
import {
  cidrContains,
  isCidr,
  isValidIpOrCidr,
  normalizeIp,
  normalizeStoredIp,
} from './ip-blacklist.utils';
import type {
  CreateIpBlacklistEntryDto,
  IpBlacklistEntryResponseDto,
} from './dto/ip-blacklist.dto';

const EXACT_KEY = 'ip-blacklist:exact';
const CIDR_KEY = 'ip-blacklist:cidr';
const CACHE_TTL_SECONDS = 300;
/** hash value 中的永久标记 */
const PERMANENT = '0';

/**
 * IP 黑名单服务
 *
 * 判定链路（ADR-0044 Q8）：
 * - 写路径：DB 为权威源，变更后重建 Redis 缓存
 * - 读路径：Redis 缓存（精确 IP 走 SET、CIDR 线性扫描）→ miss 时从 DB 重建缓存
 * - 降级：Redis 故障时回源 DB 查询；DB 故障时 fail-open（放行）
 *
 * 与限流的降级哲学不同：限流可 fail-open（丢的是拦截），黑名单不能
 * fail-open（丢的是安全），因此 Redis 故障只降级 DB、不直接放行。
 */
@Injectable()
export class IpBlacklistService {
  private readonly logger = new Logger(IpBlacklistService.name);

  constructor(
    private readonly prisma: DatabaseService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly auditLogService: AuditLogService
  ) {}

  // ────────────────────────────────────────────
  // 判定（Guard 调用）
  // ────────────────────────────────────────────

  /**
   * 判断 IP 是否命中黑名单（含过期惰性过滤）。
   * Redis 故障降级 DB；DB 故障 fail-open（返回 false）。
   */
  async isBlocked(ip: string): Promise<boolean> {
    const normalized = normalizeIp(ip);
    if (!normalized) return false;

    try {
      const cached = await this.checkCache(normalized);
      if (cached !== null) return cached;

      // 缓存未构建（Redis key 不存在）：从 DB 重建后重查
      try {
        await this.rebuildCache();
        const afterRebuild = await this.checkCache(normalized);
        if (afterRebuild !== null) return afterRebuild;
      } catch (error) {
        this.logger.warn(
          `IP 黑名单缓存重建失败，降级 DB 查询: ${(error as Error).message}`
        );
      }
    } catch (error) {
      this.logger.warn(
        `IP 黑名单缓存检查失败，降级 DB 查询: ${(error as Error).message}`
      );
    }

    try {
      return await this.checkDatabase(normalized);
    } catch (error) {
      this.logger.error(
        `IP 黑名单 DB 检查失败（fail-open）: ${(error as Error).message}`
      );
      return false;
    }
  }

  private async checkCache(ip: string): Promise<boolean | null> {
    const keyExists = await this.redis.exists(EXACT_KEY);
    if (!keyExists) return null;
    const now = Date.now();

    // 精确 IP：hash field=ip, value=到期时间戳（'0' = 永久）
    const exactExpiresAt = await this.redis.hget(EXACT_KEY, ip);
    if (exactExpiresAt !== null) {
      if (exactExpiresAt === PERMANENT || Number(exactExpiresAt) > now) {
        return true;
      }
      // 过期条目惰性删除（下次重建时彻底消失）
      await this.redis.hdel(EXACT_KEY, ip).catch(() => undefined);
      return false;
    }

    // CIDR：hash field=cidr, value=到期时间戳（'0' = 永久）
    const cidrEntries = await this.redis.hgetall(CIDR_KEY);
    for (const [cidr, expiresAt] of Object.entries(cidrEntries)) {
      if (expiresAt !== PERMANENT && Number(expiresAt) <= now) continue;
      if (cidrContains(cidr, ip)) return true;
    }
    return false;
  }

  private async checkDatabase(ip: string): Promise<boolean> {
    const entries = await this.prisma.ipBlacklistEntry.findMany({
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { ip: true },
    });
    for (const entry of entries) {
      if (isCidr(entry.ip)) {
        if (cidrContains(entry.ip, ip)) return true;
      } else if (normalizeIp(entry.ip) === ip) {
        return true;
      }
    }
    return false;
  }

  /**
   * 从 DB 全量重建 Redis 缓存（条目量小，重建成本可忽略）。
   * hash 结构：field = IP/CIDR，value = 到期时间戳（'0' = 永久），
   * 判定时校验时间，保证过期条目在缓存路径同样惰性失效（ADR-0044 Q5）。
   */
  async rebuildCache(): Promise<void> {
    const entries = await this.prisma.ipBlacklistEntry.findMany({
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { ip: true, expiresAt: true },
    });

    const exactFields: string[] = [];
    const cidrFields: string[] = [];
    for (const entry of entries) {
      const value = entry.expiresAt
        ? String(entry.expiresAt.getTime())
        : PERMANENT;
      if (isCidr(entry.ip)) {
        cidrFields.push(entry.ip, value);
      } else {
        exactFields.push(entry.ip, value);
      }
    }

    const multi = this.redis.multi();
    multi.del(EXACT_KEY, CIDR_KEY);
    if (exactFields.length > 0) multi.hset(EXACT_KEY, exactFields);
    if (cidrFields.length > 0) multi.hset(CIDR_KEY, cidrFields);
    multi.expire(EXACT_KEY, CACHE_TTL_SECONDS);
    multi.expire(CIDR_KEY, CACHE_TTL_SECONDS);
    await multi.exec();
  }

  // ────────────────────────────────────────────
  // 管理 CRUD
  // ────────────────────────────────────────────

  /**
   * 分页列表（只含未过期条目，过期的惰性消失；支持 keyword 模糊搜索）
   */
  async listEntries(
    page = 1,
    pageSize = 20,
    keyword?: string
  ): Promise<{
    items: IpBlacklistEntryResponseDto[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const where: Prisma.IpBlacklistEntryWhereInput = {
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };
    const trimmed = keyword?.trim();
    if (trimmed) {
      where.AND = [
        {
          OR: [
            { ip: { contains: trimmed, mode: 'insensitive' } },
            { reason: { contains: trimmed, mode: 'insensitive' } },
            { createdBy: { contains: trimmed, mode: 'insensitive' } },
          ],
        },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.ipBlacklistEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ipBlacklistEntry.count({ where }),
    ]);
    return {
      items: items.map((item) => this.toResponse(item)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 添加条目（来源固定为手动 MANUAL；自动封禁为后续任务，经 source: AUTO 复用本模型）
   */
  async addEntry(
    dto: CreateIpBlacklistEntryDto,
    operatorId: string
  ): Promise<IpBlacklistEntryResponseDto> {
    try {
      const ip = dto.ip.trim();
      if (!isValidIpOrCidr(ip)) {
        throw new BadRequestException(
          I18nContext.current()?.t('error.ip_blacklist.invalid_ip') ??
            '无效的 IP 或 CIDR 格式'
        );
      }
      const storedIp = normalizeStoredIp(ip);

      const duplicate = await this.prisma.ipBlacklistEntry.findFirst({
        where: {
          ip: storedIp,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (duplicate) {
        throw new ConflictException(
          I18nContext.current()?.t('error.ip_blacklist.duplicate_entry') ??
            '该 IP/CIDR 已在黑名单中'
        );
      }

      const created = await this.prisma.ipBlacklistEntry.create({
        data: {
          ip: storedIp,
          source: BlacklistSource.MANUAL,
          reason: dto.reason.trim(),
          createdBy: operatorId,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
      });

      await this.safeRebuildCache();

      // 安全审计：加入 IP 黑名单（名称快照=IP，写库失败不阻塞业务）
      await this.auditLogService.log(
        AuditAction.IP_BLACKLIST_ADD,
        ResourceType.IpBlacklistEntry,
        created.id,
        operatorId,
        true,
        undefined,
        undefined,
        undefined,
        storedIp,
        {
          ip: storedIp,
          reason: dto.reason,
          expiresAt: created.expiresAt,
        }
      );

      return this.toResponse(created);
    } catch (error) {
      // 失败也记（写库失败不阻塞业务）
      await this.auditLogService.log(
        AuditAction.IP_BLACKLIST_ADD,
        ResourceType.IpBlacklistEntry,
        undefined,
        operatorId,
        false,
        error instanceof Error ? error.message : String(error),
        undefined,
        undefined,
        dto.ip,
        { ip: dto.ip }
      );
      throw error;
    }
  }

  /**
   * 移除条目（物理删除，操作痕迹由审计日志承担）
   */
  async removeEntry(id: string, operatorId: string): Promise<{ id: string }> {
    try {
      const existing = await this.prisma.ipBlacklistEntry.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.ip_blacklist.not_found') ??
            '黑名单条目不存在'
        );
      }

      await this.prisma.ipBlacklistEntry.delete({ where: { id } });
      await this.safeRebuildCache();

      // 安全审计：移出 IP 黑名单（名称快照=IP，写库失败不阻塞业务）
      await this.auditLogService.log(
        AuditAction.IP_BLACKLIST_REMOVE,
        ResourceType.IpBlacklistEntry,
        id,
        operatorId,
        true,
        undefined,
        undefined,
        undefined,
        existing.ip,
        { ip: existing.ip }
      );

      return { id };
    } catch (error) {
      // 失败也记（写库失败不阻塞业务）
      await this.auditLogService.log(
        AuditAction.IP_BLACKLIST_REMOVE,
        ResourceType.IpBlacklistEntry,
        id,
        operatorId,
        false,
        error instanceof Error ? error.message : String(error),
        undefined,
        undefined,
        id,
        { id }
      );
      throw error;
    }
  }

  private async safeRebuildCache(): Promise<void> {
    try {
      await this.rebuildCache();
    } catch (error) {
      // 缓存重建失败不阻塞写操作：下次缓存 miss 时会再次重建
      this.logger.warn(`IP 黑名单缓存重建失败: ${(error as Error).message}`);
    }
  }

  private toResponse(entry: IpBlacklistEntry): IpBlacklistEntryResponseDto {
    return {
      id: entry.id,
      ip: entry.ip,
      source: entry.source === 'MANUAL' ? 'manual' : 'auto',
      reason: entry.reason,
      createdBy: entry.createdBy,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
    };
  }
}
