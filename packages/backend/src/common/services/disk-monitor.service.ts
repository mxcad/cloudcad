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
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { AppConfig } from '../../config/app.config';

export interface DiskStats {
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
   * @returns 磁盘统计信息
   */
  getDiskStats(filePath?: string): DiskStats {
    const targetPath = filePath || this.filesDataPath;
    const resolvedPath = path.resolve(targetPath);

    try {
      // 获取磁盘信息（Windows 和 Linux/macOS 兼容）
      const stats = fs.statSync(resolvedPath);
      const drive = path.parse(resolvedPath).root || resolvedPath;

      // 获取磁盘空间信息
      const diskInfo = this.getDiskInfo(drive);

      return {
        path: drive,
        total: diskInfo.total,
        free: diskInfo.free,
        used: diskInfo.used,
        usagePercentage: diskInfo.usagePercentage,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get disk stats: ${resolvedPath}`,
        error.stack
      );
      return {
        path: resolvedPath,
        total: 0,
        free: 0,
        used: 0,
        usagePercentage: 0,
      };
    }
  }

  /**
   * 获取磁盘信息
   * @param drivePath 驱动器路径
   * @returns 磁盘信息
   */
  private getDiskInfo(drivePath: string): {
    total: number;
    free: number;
    used: number;
    usagePercentage: number;
  } {
    try {
      // 检测操作系统平台
      const platform = process.platform;

      if (platform === 'win32') {
        // Windows 平台：使用 exec 执行 WMIC 命令获取磁盘信息
        try {
          // 确保驱动器路径格式正确（例如：D:）
          const drive = path.parse(drivePath).root || drivePath;
          // WMIC 的 DeviceID 格式应该是 "D:"（只有冒号，没有反斜杠）
          const deviceId = drive.replace(/\\/g, '');

          // 使用 buffer 编码执行 WMIC 命令，然后转换为字符串
          const buffer = execSync(
            `wmic logicaldisk where "DeviceID='${deviceId}'" get FreeSpace,Size /value`,
            { windowsHide: true }
          );
          const output = buffer.toString('latin1');

          // 解析输出
          const freeSpaceMatch = output.match(/FreeSpace=(\d+)/);
          const totalSizeMatch = output.match(/Size=(\d+)/);

          if (freeSpaceMatch && totalSizeMatch) {
            const free = parseInt(freeSpaceMatch[1], 10);
            const total = parseInt(totalSizeMatch[1], 10);
            const used = total - free;
            const usagePercentage = total > 0 ? (used / total) * 100 : 0;

            return { total, free, used, usagePercentage };
          }
        } catch (execError) {
          this.logger.warn(
            `Windows disk query failed, trying fallback method: ${execError.message}`
          );
          // 尝试使用 PowerShell 备用方法
          try {
            const drive = path.parse(drivePath).root || drivePath;
            const driveLetter = drive.replace(/[:\\]/g, ''); // 去掉冒号和反斜杠
            const psOutput = execSync(
              `powershell -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-PSDrive ${driveLetter} | Select-Object Used,Free | ConvertTo-Json"`,
              { encoding: 'utf-8', windowsHide: true }
            );
            const psData = JSON.parse(psOutput);
            const free = psData.Free || 0;
            const used = psData.Used || 0;
            const total = used + free;
            const usagePercentage = total > 0 ? (used / total) * 100 : 0;

            return { total, free, used, usagePercentage };
          } catch (psError) {
            this.logger.error(
              `PowerShell query also failed: ${psError.message}`
            );
          }
        }
      } else if (platform === 'linux' || platform === 'darwin') {
        // Linux/macOS 平台：使用 statvfs 命令
        try {
          const output = execSync(`df -k "${drivePath}"`, {
            encoding: 'utf-8',
            windowsHide: true,
          });
          const lines = output.trim().split('\n');
          if (lines.length >= 2) {
            const parts = lines[1].split(/\s+/);
            const total = parseInt(parts[1], 10) * 1024; // KB to Bytes
            const free = parseInt(parts[3], 10) * 1024; // KB to Bytes
            const used = total - free;
            const usagePercentage = parseFloat(parts[4]);

            return { total, free, used, usagePercentage };
          }
        } catch (execError) {
          this.logger.error(
            `Linux/macOS disk query failed: ${execError.message}`
          );
        }
      }

      // 所有方法都失败，返回默认值
      this.logger.warn(
        `Unable to get disk info, returning default values: ${drivePath}`
      );
      return {
        total: 0,
        free: 0,
        used: 0,
        usagePercentage: 0,
      };
    } catch (error) {
      this.logger.error(`Failed to get disk info: ${drivePath}`, error.stack);
      return {
        total: 0,
        free: 0,
        used: 0,
        usagePercentage: 0,
      };
    }
  }

  /**
   * 检查磁盘状态
   * @param filePath 文件路径（默认为 FILES_DATA_PATH）
   * @returns 磁盘状态
   */
  checkDiskStatus(filePath?: string): DiskStatus {
    const stats = this.getDiskStats(filePath);

    let warning = false;
    let critical = false;
    let message = `Disk status normal (Available: ${this.formatBytes(stats.free)})`;

    if (stats.free < this.criticalThreshold) {
      critical = true;
      message = `Disk space critically low! Available: ${this.formatBytes(stats.free)}, please clean up immediately`;
    } else if (stats.free < this.warningThreshold) {
      warning = true;
      message = `Disk space low! Available: ${this.formatBytes(stats.free)}, recommended to clean up`;
    }

    return {
      stats,
      warning,
      critical,
      message,
    };
  }

  /**
   * 检查是否允许上传
   * @param filePath 文件路径（默认为 FILES_DATA_PATH）
   * @returns 是否允许上传
   */
  allowUpload(filePath?: string): boolean {
    const status = this.checkDiskStatus(filePath);
    return !status.critical;
  }

  /**
   * 格式化字节数
   * @param bytes 字节数
   * @returns 格式化字符串
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
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

    if (status.critical) {
      recommendation =
        'Immediate action required: 1. Stop upload operations 2. Clean up expired files 3. Expand disk capacity';
    } else if (status.warning) {
      recommendation =
        'Recommendation: 1. Check storage cleanup schedule 2. Evaluate disk expansion needs';
    }

    return {
      healthy: !status.critical,
      status,
      recommendation,
    };
  }
}
