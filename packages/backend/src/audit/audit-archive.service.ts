///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use its software, documentation, and related materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as path from 'path';
import { DatabaseService } from '../database/database.service';
import { buildAuditCsv, type AuditLogListItem } from './audit-log.service';

/** 单个月度归档分片产物 */
export interface AuditArchiveFileResult {
  /** 归档月份（UTC，YYYY-MM） */
  month: string;
  csvPath: string;
  manifestPath: string;
  /** CSV 文件内容的 SHA-256 十六进制摘要（与清单一致） */
  sha256: string;
  /** 该分片包含的记录数 */
  recordCount: number;
  /** 哈希链（#420）：上一期（时间序前一个月）的 chainHash；首期为空串 */
  prevHash: string;
  /** 哈希链（#420）：本期链接哈希 = SHA-256(`${month}|${sha256}|${prevHash}`) */
  chainHash: string;
  /** 哈希链清单文件路径（`<month>.chain.json`） */
  chainPath: string;
}

/** 归档执行结果 */
export interface AuditArchiveResult {
  files: AuditArchiveFileResult[];
  /** 本次导出归档的记录总数 */
  archivedCount: number;
  /** 归档成功后从 DB 删除的记录数（fail-closed：归档失败恒为 0） */
  deletedCount: number;
}

// 哈希链类型与纯函数统一从 audit-chain 单一事实源（#420），
// 供本服务（生成/续链）与 scripts/audit-archive-query.ts（--verify-chain 核验）共用
import {
  type AuditChainHead,
  type AuditChainEntry,
  computeChainHash as computeChainHashFn,
  listChainMonths,
} from './audit-chain';

/** 归档状态校验违规项（#323 删除前置门禁） */
export interface AuditArchiveViolation {
  /** 归档月份（UTC，YYYY-MM） */
  month: string;
  reason: 'CSV_MISSING' | 'MANIFEST_MISSING' | 'HASH_MISMATCH';
  detail?: string;
}

/**
 * 审计日志按月归档服务（#322）
 *
 * 职责（等保 8.4.3.3/8.4.7.2）：超保留期审计记录必须先落盘归档才允许删除。
 * #323 扩展：对外提供归档状态校验（verifyArchivedForCutoff），供手动清理入口
 * 做"未归档拒删"门禁。
 *
 * 流程（fail-closed，#223 决议延续）：
 * 1. 查询全部超期记录（无行数上限，区别于 exportLogs 的 EXPORT_MAX_ROWS）
 * 2. 按 createdAt 的 UTC 月分片导出 CSV（复用 exportLogs 字段/编码单一事实源）
 * 3. 为每个分片生成 SHA-256 校验清单（`<hash>  <file>` 两空格格式，兼容 `sha256sum -c`）
 * 4. 全部分片（含清单）写入成功后，才按同一 cutoff 执行 DB 删除
 * 5. 任一步失败即整体失败：记录保留、异常上抛（由调用方告警），绝不出现"已删但未归档"
 *
 * 幂等性：重跑覆盖同月分片文件并重算清单；cutoff 随时间推进，已归档月份不再出现在
 * 新查询结果中。竞态说明：Prisma 自动填充 createdAt=now，正常业务不会产生"晚到的
 * 历史记录"，导出与删除之间按同一 cutoff 快照操作。
 */
@Injectable()
export class AuditArchiveService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuditArchiveService.name);
  /** 进程内互斥锁：cron 与手动触发重叠时拒绝并发归档，防止分片文件交叉覆盖 */
  private running = false;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly configService: ConfigService
  ) {}

  /**
   * 启动自检（#420）：生产环境关闭审计归档时告警（不阻塞启动）。
   * 等保 8.4.3.3/8.1.4.3 要求超期审计记录留存归档，关闭归档意味着超期记录
   * 将被直接删除而非留存，属合规缺口，需运维显式确认（AUDIT_ARCHIVE_ENABLED）。
   */
  onApplicationBootstrap(): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const archiveEnabled = this.configService.get<boolean>(
      'audit.archiveEnabled',
      false
    );
    if (isProduction && !archiveEnabled) {
      this.logger.warn(
        '生产环境已关闭审计日志归档（AUDIT_ARCHIVE_ENABLED 未开启）：超期审计记录将被直接删除而不归档留存，' +
          '不满足等保 8.4.3.3/8.1.4.3 留存要求。如需归档请设置 AUDIT_ARCHIVE_ENABLED=true。'
      );
    }
  }

  /**
   * 归档超期审计日志并在成功后删除
   *
   * @param daysToKeep 保留天数（与清理任务同一口径，默认 183）
   * @returns 归档分片明细与删除计数
   * @throws 任一月分片 CSV/清单写盘失败时抛出，DB 记录保留（fail-closed）
   */
  async archiveExpiredLogs(daysToKeep: number): Promise<AuditArchiveResult> {
    if (this.running) {
      throw new Error('审计日志归档任务已在运行中，拒绝并发执行');
    }
    this.running = true;
    try {
      return await this.doArchive(daysToKeep);
    } finally {
      this.running = false;
    }
  }

  private async doArchive(daysToKeep: number): Promise<AuditArchiveResult> {
    const archivePath = this.resolveArchivePath();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);

    const expiredLogs = await this.prisma.auditLog.findMany({
      where: { createdAt: { lt: cutoff } },
      include: { user: { select: { id: true, email: true, username: true } } },
      orderBy: { createdAt: 'asc' },
      // 刻意不设 take 上限：fail-closed 要求全部超期记录都进归档才能删库
    });

    if (expiredLogs.length === 0) {
      return { files: [], archivedCount: 0, deletedCount: 0 };
    }

    // 按 createdAt 的 UTC 月分片（CSV 时间列同为 ISO/UTC 口径）
    const byMonth = new Map<string, typeof expiredLogs>();
    for (const log of expiredLogs) {
      const month = log.createdAt.toISOString().slice(0, 7);
      const bucket = byMonth.get(month);
      if (bucket) {
        bucket.push(log);
      } else {
        byMonth.set(month, [log]);
      }
    }

    await this.ensureArchiveDir(archivePath);

    // 先完成全部分片落盘，任何失败都在 deleteMany 之前抛出
    const files: AuditArchiveFileResult[] = [];
    for (const [month, logs] of byMonth) {
      files.push(await this.writeMonthlyShard(archivePath, month, logs));
    }

    // #420：构建/续接哈希链（时间序），回填 prevHash/chainHash 并更新链头状态文件
    await this.buildChain(archivePath, files);

    const deleted = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    this.logger.log(
      `审计日志归档完成: ${files.length} 个月度分片 / ${expiredLogs.length} 条记录, ` +
        `删除 ${deleted.count} 条, 目录: ${archivePath}`
    );

    return {
      files,
      archivedCount: expiredLogs.length,
      deletedCount: deleted.count,
    };
  }

  /**
   * 查询超期记录覆盖的月度分片集合（UTC 月，YYYY-MM 升序）
   *
   * 供删除前置校验确定"哪些月份必须有归档产物"。用 SQL DISTINCT 聚合，
   * 避免把全部超期记录拉进内存。
   */
  async getExpiredMonths(cutoff: Date): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ month: string }[]>`
      SELECT DISTINCT to_char("createdAt", 'YYYY-MM') AS month
      FROM "audit_logs"
      WHERE "createdAt" < ${cutoff}
      ORDER BY month`;
    return rows.map((row) => row.month);
  }

  /**
   * 删除前置校验（#323，等保 8.4.3.3）：目标时间段记录必须已归档才允许删库
   *
   * 对 cutoff 覆盖的每个月度分片逐一校验：
   * 1. `<month>.csv` 与 `<month>.sha256` 清单均存在；
   * 2. CSV 实际内容哈希与清单一致（清单存在但内容损坏同样拒绝——防归档落盘后
   *    被截断/篡改仍放行删除）。
   *
   * 已知边界：本方法证明的是"归档产物存在且完整"，不证明"归档内容覆盖到当前
   * cutoff 快照"（cron 归档与本次删除之间新过期的记录不在旧分片中）。
   * 运行约定：每日 cron 归档保持产物新鲜，手动清理仅作为恢复手段；若需严格
   * 快照一致，先触发一次 cron 归档任务再执行手动清理。
   *
   * @returns 违规列表；空数组 = 校验通过，可执行删除
   */
  async verifyArchivedForCutoff(cutoff: Date): Promise<AuditArchiveViolation[]> {
    const months = await this.getExpiredMonths(cutoff);
    const archivePath = this.resolveArchivePath();

    const violations: AuditArchiveViolation[] = [];
    for (const month of months) {
      const csvPath = path.join(archivePath, `${month}.csv`);
      const manifestPath = path.join(archivePath, `${month}.sha256`);

      try {
        await fs.access(csvPath);
      } catch {
        violations.push({ month, reason: 'CSV_MISSING', detail: csvPath });
        continue;
      }
      try {
        await fs.access(manifestPath);
      } catch {
        violations.push({
          month,
          reason: 'MANIFEST_MISSING',
          detail: manifestPath,
        });
        continue;
      }

      // 清单格式 `<hash>  <file>`（两空格，见 writeMonthlyShard），取首段为期望摘要
      const manifest = await fs.readFile(manifestPath, 'utf8');
      const expected = manifest.trim().split(/ {2}/)[0]?.toLowerCase();
      const actual = await this.sha256File(csvPath);
      if (!expected || expected !== actual) {
        violations.push({
          month,
          reason: 'HASH_MISMATCH',
          detail: `manifest=${expected ?? '解析失败'} actual=${actual}`,
        });
      }
    }

    if (violations.length > 0) {
      this.logger.warn(
        `审计归档校验未通过（cutoff=${cutoff.toISOString()}）: ${violations
          .map((v) => `${v.month}:${v.reason}`)
          .join(', ')}`
      );
    }

    return violations;
  }

  /** 归档目录解析（doArchive 与 #323 校验共用单一事实源） */
  private resolveArchivePath(): string {
    return (
      this.configService.get<string>('audit.archivePath') ??
      path.resolve('data/archives/audit-logs')
    );
  }

  /** 流式计算文件 SHA-256（月度 CSV 可达数十 MB，避免整文件载入内存） */
  private sha256File(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  /** 创建归档目录并收紧权限（0750；Windows 无 POSIX 权限语义，best-effort） */
  private async ensureArchiveDir(archivePath: string): Promise<void> {
    await fs.mkdir(archivePath, { recursive: true });
    try {
      await fs.chmod(archivePath, 0o750);
    } catch (error) {
      this.logger.warn(
        `归档目录权限设置失败（不影响归档数据完整性）: ${(error as Error).message}`
      );
    }
  }

  /**
   * 写入单个月度分片：YYYY-MM.csv + YYYY-MM.sha256 清单
   * 文件权限 0640（best-effort，同目录权限处理）
   */
  private async writeMonthlyShard(
    archivePath: string,
    month: string,
    logs: AuditLogListItem[]
  ): Promise<AuditArchiveFileResult> {
    const csvBuffer = buildAuditCsv(logs);
    const csvPath = path.join(archivePath, `${month}.csv`);
    const sha256 = createHash('sha256').update(csvBuffer).digest('hex');

    await fs.writeFile(csvPath, csvBuffer);
    await this.chmodFile(csvPath);

    // `<hash>  <file>` 两空格格式，兼容 `sha256sum -c`
    const manifestPath = path.join(archivePath, `${month}.sha256`);
    await fs.writeFile(manifestPath, `${sha256}  ${month}.csv\n`, 'utf8');
    await this.chmodFile(manifestPath);

    // 哈希链字段由 buildChain 统一回填（prevHash 依赖时间序前一期，须全部分片落盘后计算）
    return {
      month,
      csvPath,
      manifestPath,
      sha256,
      recordCount: logs.length,
      prevHash: '',
      chainHash: '',
      chainPath: path.join(archivePath, `${month}.chain.json`),
    };
  }

  // ==================== 哈希链（#420，等保 8.1.4.3 审计记录保护） ====================

  /**
   * 计算单期链接哈希（委托 audit-chain 纯函数，单一事实源）。
   * 保留 static 形式供既有单测直接调用。
   */
  static computeChainHash(
    month: string,
    csvSha256: string,
    prevHash: string
  ): string {
    return computeChainHashFn(month, csvSha256, prevHash);
  }

  /** 链头状态文件路径（`<archivePath>/chain-head.json`） */
  private chainHeadPath(archivePath: string): string {
    return path.join(archivePath, 'chain-head.json');
  }

  /**
   * 构建/续接哈希链（#420）：对本次归档的各月度分片按时间序回填 prevHash/chainHash，
   * 写入 `<month>.chain.json`，并更新链头状态文件（当前最新期哈希）。
   *
   * 链接规则：
   * - 本期 prevHash = 时间序前一期（已存在的 chain.json）的 chainHash；无前一期则为空串（首期约定）。
   * - 本期 chainHash = SHA-256(`${month}|${csvSha256}|${prevHash}`)。
   *
   * 幂等性：已存在的 `<month>.chain.json` 不重算（保留首次生成的 prevHash 链接），
   * 仅对缺失的期补链；链头取全部期（含历史）中时间最大者。
   */
  private async buildChain(
    archivePath: string,
    files: AuditArchiveFileResult[]
  ): Promise<void> {
    // 收集本次涉及的月份，按时间序升序（YYYY-MM 字符串序即时间序）
    const months = files.map((f) => f.month).sort();
    const fileByMonth = new Map(files.map((f) => [f.month, f]));

    let latestMonth = '';
    let latestChainHash = '';

    for (const month of months) {
      const file = fileByMonth.get(month)!;
      const chainPath = path.join(archivePath, `${month}.chain.json`);

      let entry: AuditChainEntry;
      try {
        const existing = JSON.parse(await fs.readFile(chainPath, 'utf8'));
        // 已存在则沿用（幂等，不重算 prevHash，避免破坏既有链接）
        entry = existing as AuditChainEntry;
      } catch {
        // 无前一期或前一期无 chain.json 时 prevHash 为空串（首期约定）
        const prevHash = await this.findPrevChainHash(archivePath, month);
        entry = {
          month,
          csvSha256: file.sha256,
          prevHash,
          chainHash: computeChainHashFn(month, file.sha256, prevHash),
        };
        await fs.writeFile(
          chainPath,
          JSON.stringify(entry, null, 2) + '\n',
          'utf8'
        );
        await this.chmodFile(chainPath);
      }

      // 回填到分片结果
      file.prevHash = entry.prevHash;
      file.chainHash = entry.chainHash;

      // 追踪最新期（时间最大）
      if (month > latestMonth) {
        latestMonth = month;
        latestChainHash = entry.chainHash;
      }
    }

    // 更新链头状态文件（当前最新期哈希，随每日异地推送上行）
    if (latestMonth) {
      await this.writeChainHead(archivePath, {
        latestMonth,
        latestChainHash,
      });
    }
  }

  /**
   * 查找时间序前一期的 chainHash（用于 prevHash 链接）。
   * 扫描已存在的 `<month>.chain.json`，取严格小于 month 的最大月份的 chainHash；
   * 找不到返回空串（首期约定）。
   */
  private async findPrevChainHash(
    archivePath: string,
    month: string
  ): Promise<string> {
    const candidates = (await listChainMonths(archivePath)).filter(
      (m) => m < month
    );
    if (candidates.length === 0) return '';
    const prevMonth = candidates[candidates.length - 1];
    try {
      const entry = JSON.parse(
        await fs.readFile(
          path.join(archivePath, `${prevMonth}.chain.json`),
          'utf8'
        )
      ) as AuditChainEntry;
      return entry.chainHash ?? '';
    } catch {
      return '';
    }
  }

  private async writeChainHead(
    archivePath: string,
    head: AuditChainHead
  ): Promise<void> {
    const p = this.chainHeadPath(archivePath);
    await fs.writeFile(p, JSON.stringify(head, null, 2) + '\n', 'utf8');
    await this.chmodFile(p);
  }

  private async chmodFile(filePath: string): Promise<void> {
    try {
      await fs.chmod(filePath, 0o640);
    } catch (error) {
      this.logger.warn(
        `归档文件权限设置失败（不影响归档数据完整性）: ${(error as Error).message}`
      );
    }
  }
}
