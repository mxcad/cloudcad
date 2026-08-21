///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved. The code, documentation, and related materials of this
// software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications
// that include this software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { DatabaseService } from '../database/database.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import { BlacklistSource, Prisma, type IpWhitelistEntry } from '@cloudcad/db';
import {
  cidrContains,
  isCidr,
  isValidIpOrCidr,
  normalizeIp,
  normalizeStoredIp,
} from '../ip-blacklist/ip-blacklist.utils';
import { IpWhitelistFileService } from './ip-whitelist-file.service';
import type {
  CreateIpWhitelistEntryDto,
  IpWhitelistEntryResponseDto,
} from './dto/ip-whitelist.dto';

/** 本地文件条目的 ID 前缀（接口层禁止移除，需直接编辑服务器文件） */
export const FILE_ENTRY_ID_PREFIX = 'file:';

/**
 * 管理员登录 IP 白名单服务
 *
 * 双通道设计（DB 管理界面 + 服务器本地文件兜底），判定语义 **fail-close**：
 * - DB 条目 ∪ 本地文件条目，命中任一（精确 IP 或 CIDR 包含）才允许登录；
 * - 服务器环回地址（127.0.0.1 / ::1）恒放行：管理员被界面误删白名单锁死后，
 *   可在服务器本机恢复（配合本地文件通道形成完整自救链路）；
 * - 两通道皆空时除环回外全部拒绝（与黑名单的 fail-open 哲学相反：
 *   白名单丢的是安全边界，宁拒勿放）；
 * - DB 故障时降级为「文件 + 环回」通道（文件不可用则仅环回），不 fail-open。
 *
 * 登录为低频操作，判定直接查 DB（无 Redis 缓存，避免与黑名单共用缓存复杂度）。
 */
@Injectable()
export class IpWhitelistService {
  private readonly logger = new Logger(IpWhitelistService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly fileService: IpWhitelistFileService,
    private readonly auditLogService: AuditLogService
  ) {}

  // ────────────────────────────────────────────
  // 判定（管理员登录入口调用）
  // ────────────────────────────────────────────

  /**
   * 判断 IP 是否允许管理员登录（fail-close）。
   */
  async isAllowed(ip: string): Promise<boolean> {
    const normalized = normalizeIp(ip);
    if (!normalized || normalized === 'unknown') return false;

    // 环回恒放行：服务器本机自救通道（误删白名单后在本机仍可登录恢复）
    if (this.isLoopback(normalized)) return true;

    // 通道一：服务器本地文件（兜底，mtime 缓存 + 编辑即生效）
    if (this.matchEntries(this.fileService.getEntries(), normalized)) {
      return true;
    }

    // 通道二：DB（管理界面维护）
    try {
      const entries = await this.prisma.ipWhitelistEntry.findMany({
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        select: { ip: true },
      });
      return this.matchEntries(
        entries.map((entry) => entry.ip),
        normalized
      );
    } catch (error) {
      // fail-close：DB 故障不等于放行，仅剩文件 + 环回通道
      this.logger.error(
        `管理员 IP 白名单 DB 检查失败（fail-close，仅文件/环回通道可用）: ${(error as Error).message}`
      );
      return false;
    }
  }

  private isLoopback(normalizedIp: string): boolean {
    return (
      normalizedIp === '127.0.0.1' ||
      normalizedIp === '::1' ||
      // ::ffff:127.0.0.1 已被 normalizeIp 归一为 127.0.0.1，此处兜底其余环回段
      normalizedIp.startsWith('127.')
    );
  }

  /** 条目列表匹配：精确 IP 相等或 CIDR 包含（版本一致） */
  private matchEntries(entries: string[], normalizedIp: string): boolean {
    for (const entry of entries) {
      if (isCidr(entry)) {
        if (cidrContains(entry, normalizedIp)) return true;
      } else if (normalizeIp(entry) === normalizedIp) {
        return true;
      }
    }
    return false;
  }

  // ────────────────────────────────────────────
  // 管理 CRUD
  // ────────────────────────────────────────────

  /**
   * 分页列表（DB 未过期条目 + 本地文件条目合并展示）。
   * 文件条目置顶（id 形如 "file:<ip>"，source='file'，不可通过接口移除），
   * keyword 同样作用于文件条目的 ip 字段；total 含文件条目数。
   */
  async listEntries(
    page = 1,
    pageSize = 20,
    keyword?: string
  ): Promise<{
    items: IpWhitelistEntryResponseDto[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const fileItems: IpWhitelistEntryResponseDto[] =
      this.fileService.getEntries().map((ip) => ({
        id: `${FILE_ENTRY_ID_PREFIX}${ip}`,
        ip,
        source: 'file',
        reason: '服务器本地文件白名单（编辑服务器文件修改）',
        createdBy: 'local-file',
        createdAt: new Date(0),
        expiresAt: null,
      }));

    const trimmed = keyword?.trim().toLowerCase();
    const filteredFileItems = trimmed
      ? fileItems.filter((item) => item.ip.toLowerCase().includes(trimmed))
      : fileItems;

    const where: Prisma.IpWhitelistEntryWhereInput = {
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };
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

    const [dbItems, dbTotal] = await Promise.all([
      this.prisma.ipWhitelistEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ipWhitelistEntry.count({ where }),
    ]);

    // 合并分页：文件条目恒置顶展示（数量极小），DB 条目按查询分页拼接其后
    const items = [...filteredFileItems, ...dbItems.map((item) => this.toResponse(item))];
    return {
      items,
      total: dbTotal + filteredFileItems.length,
      page,
      pageSize,
    };
  }

  /**
   * 添加条目（DB 通道；来源固定 MANUAL）
   */
  async addEntry(
    dto: CreateIpWhitelistEntryDto,
    operatorId: string
  ): Promise<IpWhitelistEntryResponseDto> {
    try {
      const ip = dto.ip.trim();
      if (!isValidIpOrCidr(ip)) {
        throw new BadRequestException(
          I18nContext.current()?.t('error.ip_whitelist.invalid_ip') ??
            '无效的 IP 或 CIDR 格式'
        );
      }
      const storedIp = normalizeStoredIp(ip);

      // 与 DB 未过期条目查重；与文件条目重复仅告警不阻断（并集语义下无副作用）
      const duplicate = await this.prisma.ipWhitelistEntry.findFirst({
        where: {
          ip: storedIp,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (duplicate) {
        throw new ConflictException(
          I18nContext.current()?.t('error.ip_whitelist.duplicate_entry') ??
            '该 IP/CIDR 已在白名单中'
        );
      }

      const created = await this.prisma.ipWhitelistEntry.create({
        data: {
          ip: storedIp,
          source: BlacklistSource.MANUAL,
          reason: dto.reason.trim(),
          createdBy: operatorId,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
      });

      // 安全审计：加入管理员白名单（写库失败不阻塞业务）
      await this.auditLogService.log(
        AuditAction.IP_WHITELIST_ADD,
        ResourceType.IpWhitelistEntry,
        created.id,
        operatorId,
        true,
        undefined,
        undefined,
        undefined,
        storedIp,
        { ip: storedIp, reason: dto.reason, expiresAt: created.expiresAt }
      );

      return this.toResponse(created);
    } catch (error) {
      await this.auditLogService.log(
        AuditAction.IP_WHITELIST_ADD,
        ResourceType.IpWhitelistEntry,
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
   * 移除条目（物理删除；本地文件条目不允许经接口移除）
   */
  async removeEntry(id: string, operatorId: string): Promise<{ id: string }> {
    if (id.startsWith(FILE_ENTRY_ID_PREFIX)) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.ip_whitelist.file_entry_immutable') ??
          '本地文件条目请在服务器上直接编辑白名单文件移除'
      );
    }

    try {
      const existing = await this.prisma.ipWhitelistEntry.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.ip_whitelist.not_found') ??
            '白名单条目不存在'
        );
      }

      await this.prisma.ipWhitelistEntry.delete({ where: { id } });

      // 安全审计：移出管理员白名单（高危：可能把自己锁外面，审计必留痕）
      await this.auditLogService.log(
        AuditAction.IP_WHITELIST_REMOVE,
        ResourceType.IpWhitelistEntry,
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
      await this.auditLogService.log(
        AuditAction.IP_WHITELIST_REMOVE,
        ResourceType.IpWhitelistEntry,
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

  private toResponse(entry: IpWhitelistEntry): IpWhitelistEntryResponseDto {
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
