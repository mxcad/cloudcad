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

import * as fs from 'fs';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isValidIpOrCidr,
  normalizeStoredIp,
} from '../ip-blacklist/ip-blacklist.utils';
import type { AppConfig } from '../config/app.config';

/**
 * 管理员登录 IP 白名单 —— 本地文件兜底通道
 *
 * 兜底语义（需求 ADD：管理员在界面误删自己的白名单条目后锁死）：
 * - 服务器本地维护一份白名单文件（默认 config/admin-ip-whitelist.json，
 *   可用环境变量 ADMIN_IP_WHITELIST_FILE 覆盖），与 DB 白名单**取并集**生效；
 * - 管理员 SSH 到服务器编辑该文件即可恢复自己的 IP 访问，无需登录管理界面；
 * - 文件不存在/解析失败按空处理（不阻塞启动），mtime 变化即重新加载，
 *   无需重启后端进程。
 *
 * 文件格式（两种均支持，按内容自动识别）：
 * 1. JSON：{"ips": ["1.2.3.4", "10.0.0.0/8"]} 或直接 ["1.2.3.4", ...]
 * 2. 纯文本：每行一个 IP/CIDR，支持 # 行注释（便于 echo 追加运维）
 */
@Injectable()
export class IpWhitelistFileService {
  private readonly logger = new Logger(IpWhitelistFileService.name);
  private cache: { mtimeMs: number; entries: string[] } | null = null;

  constructor(private readonly configService: ConfigService<AppConfig>) {}

  /** 白名单文件路径（configuration.ts 已归一为绝对路径） */
  get filePath(): string {
    return (
      this.configService.get<string>('adminIpWhitelist.file', {
        infer: true,
      }) ?? 'config/admin-ip-whitelist.json'
    );
  }

  /**
   * 读取文件白名单条目（归一化 + 去重 + mtime 缓存）。
   * 文件不存在（ENOENT）静默返回空数组；其他 IO/解析错误告警后返回空数组
   * （fail-close 语义由 IpWhitelistService 兜底：文件通道为空时仅剩 DB/loopback）。
   */
  getEntries(): string[] {
    try {
      const stat = fs.statSync(this.filePath);
      if (this.cache && this.cache.mtimeMs === stat.mtimeMs) {
        return this.cache.entries;
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const entries = this.parse(raw);
      this.cache = { mtimeMs: stat.mtimeMs, entries };
      return entries;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        this.logger.warn(
          `管理员 IP 白名单文件读取失败（按空处理，路径 ${this.filePath}）: ${err.message}`
        );
      }
      return [];
    }
  }

  /** 文件内容解析：JSON（对象 ips 字段 / 纯数组）或逐行纯文本（# 注释） */
  private parse(raw: string): string[] {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        const list = Array.isArray(parsed)
          ? parsed
          : Array.isArray((parsed as { ips?: unknown[] })?.ips)
            ? ((parsed as { ips: unknown[] }).ips)
            : [];
        return this.sanitize(list);
      } catch (error) {
        this.logger.warn(
          `管理员 IP 白名单文件 JSON 解析失败，降级按纯文本逐行解析: ${(error as Error).message}`
        );
      }
    }
    return this.sanitize(
      trimmed.split('\n').map((line) => line.split('#')[0].trim())
    );
  }

  /** 过滤非法项并归一化去重；非法行告警跳过（不因一行脏数据拖垮整个文件通道） */
  private sanitize(list: unknown[]): string[] {
    const result: string[] = [];
    for (const item of list) {
      if (typeof item !== 'string') continue;
      const value = item.trim();
      if (!value) continue;
      if (!isValidIpOrCidr(value)) {
        this.logger.warn(
          `管理员 IP 白名单文件含非法 IP/CIDR（已跳过）: ${value}`
        );
        continue;
      }
      result.push(normalizeStoredIp(value));
    }
    return [...new Set(result)];
  }
}
