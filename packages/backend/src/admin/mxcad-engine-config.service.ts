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

import * as fs from 'node:fs/promises';
import path from 'node:path';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nContext } from 'nestjs-i18n';
import { runMxcadAssembly, salvageSuccessResult } from '@cloudcad/engine-exec';
import { MxcadEngineConfigDto } from './dto/mxcad-engine-config.dto';

/** mxcad_ini.json 中协同日志开关的键名（MX 引擎约定，勿改） */
const COORDINATE_LOG_KEY = 'coordinate_log_enable';

/** 引擎 ini 配置文件名（与 mxcadassembly 可执行文件同目录） */
const INI_FILE_NAME = 'mxcad_ini.json';

/** about 探测超时（毫秒）——about 是轻量命令，正常毫秒级返回 */
const ABOUT_TIMEOUT_MS = 10_000;

/** local_path 进程内缓存有效期：引擎重装/迁移后最多 5 分钟更新显示 */
const LOG_PATH_CACHE_TTL_MS = 5 * 60_000;

/**
 * MX 引擎 ini 配置（mxcad_ini.json）读写服务。
 *
 * 单一事实源是引擎目录下磁盘上的 mxcad_ini.json 本身（不进 DB / runtime-config），
 * 引擎进程直接读该文件，手动编辑也能在管理界面如实显示。
 * 写入只 upsert 顶层布尔键，其余键（含 dwg 子对象）原样保留。
 */
@Injectable()
export class MxcadEngineConfigService {
  private readonly logger = new Logger(MxcadEngineConfigService.name);

  /** mxcadassembly 可执行文件路径（configuration.ts 已解析为绝对路径） */
  private readonly assemblyPath: string;

  /** 引擎目录：mxcad_ini.json 与 mxcadassembly 同级，协同进程 cwd 也在此 */
  private readonly engineDir: string;

  /** about 探测成功的 local_path 进程内缓存（引擎本机数据目录）及其取得时间 */
  private cachedLogPath: string | null = null;
  private cachedLogPathAt = 0;

  constructor(private readonly configService: ConfigService) {
    // configuration.ts 恒定义 mxcad.assemblyPath（env MXCAD_ASSEMBLY_PATH 可覆盖），
    // 此处不复制其平台解析回退逻辑（file-conversion.service 的第二份 fallback 是历史存量）
    const assemblyPath = this.configService.get<string>('mxcad.assemblyPath');
    if (!assemblyPath) {
      throw new Error('配置 mxcad.assemblyPath 缺失，无法定位引擎 mxcad_ini.json');
    }
    this.assemblyPath = assemblyPath;
    this.engineDir = path.dirname(this.assemblyPath);
  }

  /** 组装管理界面所需的引擎配置状态（enabled 实时读 ini；logPath 走缓存探测） */
  async getEngineConfig(): Promise<MxcadEngineConfigDto> {
    const [enabled, logPath] = await Promise.all([
      this.getCoordinateLogEnabled(),
      this.getLogPath(),
    ]);
    return { enabled, logPath };
  }

  /** 读取协同日志开关当前值。ini 文件不存在（首次部署）视为关闭 */
  async getCoordinateLogEnabled(): Promise<boolean> {
    const raw = await this.readIniOrNull();
    if (raw === null) return false;
    return this.parseIni(raw)[COORDINATE_LOG_KEY] === true;
  }

  /**
   * 写入协同日志开关并回显状态（读-改-写 upsert 顶层布尔键）。
   * 注意：协同（cooperate）是 PM2 长驻进程，仅在启动时读取 ini——写入后需重启
   * 协同服务才对协同编辑生效；转换进程每次新起，写完即对后续转换生效。
   * 回显的 logPath 只取缓存，保存链路绝不拉起引擎 about 进程。
   */
  async setCoordinateLogEnabled(
    enabled: boolean
  ): Promise<MxcadEngineConfigDto> {
    const raw = await this.readIniOrNull();
    const data = this.parseIni(raw ?? '{}');
    data[COORDINATE_LOG_KEY] = enabled;
    try {
      await fs.writeFile(this.iniPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      this.logger.error(`写入引擎配置失败（${this.iniPath}）: ${err.message}`);
      throw this.engineError(
        'ini_write_failed',
        `写入引擎配置文件失败: ${this.iniPath}`
      );
    }
    return { enabled, logPath: this.getCachedLogPath() };
  }

  /**
   * 引擎 about 探测取 local_path（引擎本机数据目录，即日志位置）。
   *
   * about 是诊断探测而非转换协议，不走 interpretEngineRun 的转换结果判定
   * （newpath 回落/超时救回是转换专属语义，且其入参要求转换参数形状），
   * 只复用引擎唯一出口传输 + 「完整 code=0 JSON」唯一解析器提取 local_path；
   * 任何失败统一降级为 null，由前端展示降级文案。
   */
  async getLogPath(): Promise<string | null> {
    if (
      this.cachedLogPath &&
      Date.now() - this.cachedLogPathAt < LOG_PATH_CACHE_TTL_MS
    ) {
      return this.cachedLogPath;
    }
    const result = await runMxcadAssembly(
      this.assemblyPath,
      JSON.stringify({ about: true }),
      { cwd: this.engineDir, timeoutMs: ABOUT_TIMEOUT_MS, logger: this.logger }
    );
    const salvaged = salvageSuccessResult(result.stdout || result.stderr);
    const localPath = salvaged
      ? (salvaged as Record<string, unknown>)['local_path']
      : undefined;
    if (typeof localPath === 'string' && localPath.length > 0) {
      this.cachedLogPath = localPath;
      this.cachedLogPathAt = Date.now();
      return localPath;
    }
    this.logger.warn(
      `引擎 about 探测未取得 local_path（exitCode=${result.exitCode}, timedOut=${result.timedOut}）`
    );
    return null;
  }

  /** 仅供保存链路回显：取缓存中的 local_path，绝不拉起引擎进程 */
  getCachedLogPath(): string | null {
    return this.cachedLogPath;
  }

  /** 读取 ini 原文；文件不存在返回 null，其他 IO 失败抛 500 */
  private async readIniOrNull(): Promise<string | null> {
    try {
      return await fs.readFile(this.iniPath, 'utf-8');
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return null;
      this.logger.error(`读取引擎配置失败（${this.iniPath}）: ${err.message}`);
      throw this.engineError(
        'ini_read_failed',
        `读取引擎配置文件失败: ${this.iniPath}`
      );
    }
  }

  /** ini 解析：容错 BOM；不是有效 JSON 对象抛 500（必须让管理员看到，不能静默当关闭） */
  private parseIni(raw: string): Record<string, unknown> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    } catch {
      throw this.iniParseError();
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw this.iniParseError();
    }
    return parsed as Record<string, unknown>;
  }

  /** 引擎配置错误的统一出口：i18n 键（4 语言）+ 中文兜底，文案不在调用点各写一份 */
  private engineError(
    key: 'ini_read_failed' | 'ini_parse_failed' | 'ini_write_failed',
    fallback: string
  ): InternalServerErrorException {
    return new InternalServerErrorException(
      I18nContext.current()?.t(`error.mxcad_engine_extra.${key}`, {
        args: { path: this.iniPath },
      }) ?? fallback
    );
  }

  private iniParseError(): InternalServerErrorException {
    return this.engineError(
      'ini_parse_failed',
      `引擎配置文件不是有效 JSON: ${this.iniPath}`
    );
  }

  private get iniPath(): string {
    return path.join(this.engineDir, INI_FILE_NAME);
  }
}
