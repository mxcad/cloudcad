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
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { AppConfig } from '../../config/app.config';
import { NodeUtils } from '../../common/utils/node-utils';

/**
 * 磁盘探测失败原因。
 * 探测失败与「磁盘真满」必须可区分——前者是运维问题，后者才是空间问题。
 */
export type DiskStatsReason =
  | 'path-unreachable' // 路径不存在、挂载丢失或不可达（ENOENT 等）
  | 'statfs-unavailable'; // 运行时 Node 版本过旧，无 fs.statfs

export interface DiskStats {
  /**
   * 是否成功测得。false 时 total/free/used 全为 0——那是「没测到」的占位值，
   * 不是实测值，禁止直接拿 free 与容量阈值比较。
   */
  ok: boolean;
  /** ok=false 时的原因 */
  reason?: DiskStatsReason;
  path: string;
  total: number; // 总容量（字节）
  free: number; // 可用空间（字节）
  used: number; // 已用空间（字节）
  usagePercentage: number; // 使用率（0-100）
}

export interface DiskStatus {
  stats: DiskStats;
  warning: boolean; // 是否警告（< 20GB）
  critical: boolean; // 是否严重（< 10GB）
  message: string;
}

@Injectable()
export class DiskMonitorService {
  private readonly logger = new Logger(DiskMonitorService.name);
  // 磁盘空间阈值（字节）
  private readonly warningThreshold = 20 * 1024 * 1024 * 1024; // 20GB
  private readonly criticalThreshold = 10 * 1024 * 1024 * 1024; // 10GB
  private readonly filesDataPath: string;

  constructor(private configService: ConfigService<AppConfig>) {
    this.filesDataPath = this.configService.get('filesDataPath', {
      infer: true,
    });
  }

  /**
   * 获取磁盘统计信息
   * @param filePath 文件路径（默认为 FILES_DATA_PATH）
   * @returns 磁盘统计信息；探测失败时 ok=false 且 total/free/used 为 0
   */
  getDiskStats(filePath?: string): DiskStats {
    const resolvedPath = path.resolve(filePath || this.filesDataPath);

    // Node 18.15.0+ 才有 fs.statfs；本仓 node floor >=20，正常不会命中
    if (typeof fs.statfsSync !== 'function') {
      this.logger.error(
        `fs.statfs unavailable, cannot read disk stats: ${resolvedPath}`
      );
      return this.unavailable(resolvedPath, 'statfs-unavailable');
    }

    let stats: fs.StatsFs;
    try {
      // 直接对目标路径查询其所在卷——不再把路径猜成盘符去问 WMIC。
      // 旧实现对 UNC 路径 / 未挂载盘符必然查不到实例，且 WMIC 查无结果时
      // 退出码仍为 0，正则落空后会静默返回全 0，被调用方当成「磁盘已满」。
      stats = fs.statfsSync(resolvedPath);
    } catch (error) {
      this.logger.error(
        `Failed to get disk stats: ${resolvedPath}`,
        error.stack
      );
      return this.unavailable(resolvedPath, 'path-unreachable');
    }

    // bavail = 非特权用户可用（尊重保留空间），与 df 的 Available 列同义；
    // 乘数必须是 bsize——Windows 的 statfs 没有 frsize 字段，误用会得到 NaN，
    // 而 NaN 与阈值比较恒为 false，会让容量门禁静默失效。
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize;
    const used = Math.max(total - free, 0);

    return {
      ok: true,
      path: resolvedPath,
      total,
      free,
      used,
      usagePercentage: total > 0 ? (used / total) * 100 : 0,
    };
  }

  private unavailable(
    resolvedPath: string,
    reason: DiskStatsReason
  ): DiskStats {
    return {
      ok: false,
      reason,
      path: resolvedPath,
      total: 0,
      free: 0,
      used: 0,
      usagePercentage: 0,
    };
  }

  /**
   * 检查磁盘状态
   * @param filePath 文件路径（默认为 FILES_DATA_PATH）
   * @returns 磁盘状态
   */
  checkDiskStatus(filePath?: string): DiskStatus {
    const stats = this.getDiskStats(filePath);

    // 测不到与「空间不足」是两回事：不置 warning/critical（否则会上报
    // disk_space_low 告警，而实际并未空间紧张），但也不伪装成正常
    if (!stats.ok) {
      return {
        stats,
        warning: false,
        critical: false,
        message: `Disk status unknown (${stats.reason}): ${stats.path}`,
      };
    }

    let warning = false;
    let critical = false;
    let message = `Disk status normal (Available: ${NodeUtils.formatFileSize(stats.free)})`;

    if (stats.free < this.criticalThreshold) {
      critical = true;
      message = `Disk space critically low! Available: ${NodeUtils.formatFileSize(stats.free)}, please clean up immediately`;
    } else if (stats.free < this.warningThreshold) {
      warning = true;
      message = `Disk space low! Available: ${NodeUtils.formatFileSize(stats.free)}, recommended to clean up`;
    }

    return {
      stats,
      warning,
      critical,
      message,
    };
  }

  /**
   * 获取磁盘健康报告
   * @returns 健康报告
   */
  getHealthReport(): {
    healthy: boolean;
    status: DiskStatus;
    recommendation: string;
  } {
    const status = this.checkDiskStatus();
    let recommendation = 'Disk status good, no action needed';

    if (!status.stats.ok) {
      recommendation = `Disk stats unavailable (${status.stats.reason}): check that ${status.stats.path} exists, is mounted and is writable`;
    } else if (status.critical) {
      recommendation =
        'Immediate action required: 1. Stop upload operations 2. Clean up expired files 3. Expand disk capacity';
    } else if (status.warning) {
      recommendation =
        'Recommendation: 1. Check storage cleanup schedule 2. Evaluate disk expansion needs';
    }

    return {
      healthy: status.stats.ok && !status.critical,
      status,
      recommendation,
    };
  }
}
