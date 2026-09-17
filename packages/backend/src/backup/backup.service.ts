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
/////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { AppConfig } from '../config/app.config';
import { PROJECT_ROOT } from '../config/configuration';
import { CleanupMetricsService } from '../metrics/cleanup-metrics.service';
import { TASK_NAMES } from '../task-run/task-run.constants';

/** 单个备份文件信息 */
export interface BackupFileInfo {
  /** 文件名（cloudcad-YYYYMMDD-HHmmss.dump） */
  name: string;
  /** 文件大小（字节） */
  sizeBytes: number;
  /** 最后修改时间 */
  modifiedAt: Date;
}

/** 执行一次备份的结果 */
export interface BackupResult {
  filename: string;
  sizeBytes: number;
  durationMs: number;
  /** 轮转清理掉的旧备份数量 */
  deletedCount: number;
}

/** 恢复演练结果（#320） */
export interface RestoreDrillResult {
  /** 用于演练的备份文件名 */
  backupName: string;
  /** 实际参与行数比对的表数量（无快照时为 0） */
  tablesChecked: number;
  /** 行数不一致的表（actual 为 null 表示临时库查询失败） */
  mismatches: { table: string; expected: number; actual: number | null }[];
  durationMs: number;
}

/** 异地推送结果（#319） */
export interface PushRemoteResult {
  /** 推送通道类型 */
  type: 'rsync' | 'oss' | 's3';
  /** 推送的备份文件名（默认最新本地备份） */
  filename: string;
  sizeBytes: number;
  durationMs: number;
  /** 远端目标描述（rsync: user@host:path；对象存储: bucket/key） */
  remoteTarget: string;
  /** rsync 远端轮转清理的旧备份数（其他模式为 0，保留期走存储生命周期规则） */
  remoteDeletedCount: number;
}

/** 审计归档目录异地同步结果（#420，等保 8.1.4.3 异地留存） */
export interface AuditArchiveSyncResult {
  /** 同步通道类型 */
  type: 'rsync' | 'oss' | 's3';
  /** 同步的归档文件数 */
  fileCount: number;
  durationMs: number;
  /** 远端目标描述 */
  remoteTarget: string;
}

/**
 * 备份完整性校验失败（pg_restore --list 不可读），供调度器区分 P1 告警来源
 */
export class BackupVerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupVerifyError';
  }
}

const BACKUP_FILENAME_PATTERN = /^cloudcad-\d{8}-\d{6}\.dump$/;

/** 表名标识符白名单（防 SQL 注入，演练行数校验用） */
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** 恢复演练临时库（每次演练前重建、后删除） */
const DRILL_TEMP_DB = 'cloudcad_restore_drill';

/**
 * pg_dump 子进程超时（毫秒）：全量备份可能较慢，默认 2 小时上限
 */
const BACKUP_PROCESS_TIMEOUT_MS = 2 * 60 * 60 * 1000;

/** rsync 单次推送超时（秒） */
const RSYNC_TIMEOUT_SECONDS = 1800;

/** 异地推送通道类型（排除 none） */
type RemotePushType = Exclude<AppConfig['backup']['remote']['type'], 'none'>;

/** POSIX 单引号转义（远端轮转命令用） */
function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** ssh 裸命令（PATH 探测） */
function sshCommand(): string {
  return process.platform === 'win32' ? 'ssh.exe' : 'ssh';
}

type ExecFileCallback = (
  error: Error | null,
  stdout: string,
  stderr: string
) => void;

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly cleanupMetrics: CleanupMetricsService
  ) {}

  private get backupConfig() {
    return this.configService.get<AppConfig['backup']>('backup');
  }

  /**
   * 执行全量备份：pg_dump -Fc → pg_restore --list 完整性校验 → 本地轮转
   */
  async backup(): Promise<BackupResult> {
    const cfg = this.backupConfig;
    if (!cfg) {
      throw new Error('备份配置缺失（config.backup）');
    }

    const startedAt = Date.now();
    const dir = this.resolveBackupDir();
    await fsp.mkdir(dir, { recursive: true });

    const filename = `cloudcad-${this.formatTimestamp(new Date())}.dump`;
    const outputFile = path.join(dir, filename);
    const pgDumpPath = await this.resolvePgDumpPath();

    const db = this.configService.get<AppConfig['database']>('database');
    if (!db) {
      throw new Error('数据库配置缺失（config.database）');
    }

    const args = [
      '-h',
      db.host,
      '-p',
      String(db.port),
      '-U',
      db.username,
      '-d',
      db.database,
      '-Fc',
      '-f',
      outputFile,
      '--no-owner',
      '--no-privileges',
    ];

    this.logger.log(`开始数据库备份: ${filename}`);
    await this.exec(pgDumpPath, args, {
      env: { ...process.env, PGPASSWORD: db.password },
    });

    // 完整性校验（#320：失败标记 .invalid 保留现场，不删除、不轮转）
    try {
      await this.verify(outputFile);
    } catch (error) {
      await this.markInvalid(outputFile);
      throw new BackupVerifyError(
        `备份完整性校验失败（pg_restore --list）: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    const stats = await fsp.stat(outputFile);

    // 行数快照（#320 恢复演练比对基线，best-effort 不阻塞备份）
    await this.writeCountsSnapshotSafe(outputFile, filename);

    const deletedCount = await this.rotateBackups(cfg.keepLocal);

    const result: BackupResult = {
      filename,
      sizeBytes: stats.size,
      durationMs: Date.now() - startedAt,
      deletedCount,
    };
    this.logger.log(
      `数据库备份完成: ${filename} (${this.formatSize(result.sizeBytes)}, 耗时 ${result.durationMs}ms, 清理旧备份 ${deletedCount} 份)`
    );
    return result;
  }

  /**
   * 完整性校验：pg_restore --list 验证 dump 文件可读（#320）
   */
  async verify(dumpPath: string): Promise<void> {
    const db = this.configService.get<AppConfig['database']>('database');
    if (!db) {
      throw new Error('数据库配置缺失（config.database）');
    }
    const pgDumpPath = await this.resolvePgDumpPath();
    const pgRestorePath = this.derivePgRestorePath(pgDumpPath);
    await this.exec(pgRestorePath, ['--list', dumpPath], {
      env: { ...process.env, PGPASSWORD: db.password },
    });
  }

  /**
   * 月度恢复演练（#320）：取最近一份通过完整性校验的备份，
   * 恢复到临时库 cloudcad_restore_drill，与备份时行数快照比对后清理临时库
   */
  async restoreDrill(): Promise<RestoreDrillResult> {
    const startedAt = Date.now();
    const db = this.configService.get<AppConfig['database']>('database');
    if (!db) {
      throw new Error('数据库配置缺失（config.database）');
    }

    const dir = this.resolveBackupDir();
    const candidates = await this.listBackups();
    if (!candidates.length) {
      throw new Error('无可用备份文件，恢复演练中止');
    }

    // 选最近一份有效备份：校验失败的标记 .invalid 并跳过
    let target: BackupFileInfo | undefined;
    for (const candidate of candidates) {
      const fullPath = path.join(dir, candidate.name);
      try {
        await this.verify(fullPath);
        target = candidate;
        break;
      } catch (error) {
        await this.markInvalid(fullPath);
        this.logger.warn(
          `演练候选备份完整性校验失败，已标记并跳过 (${candidate.name}): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
    if (!target) {
      throw new Error('全部备份完整性校验均失败，恢复演练中止');
    }

    const psqlPath = await this.resolvePsqlPath();
    const env = { ...process.env, PGPASSWORD: db.password };
    try {
      await this.exec(
        psqlPath,
        ['-d', db.database, '-c', `DROP DATABASE IF EXISTS "${DRILL_TEMP_DB}"`],
        { env }
      );
      await this.exec(
        psqlPath,
        ['-d', db.database, '-c', `CREATE DATABASE "${DRILL_TEMP_DB}"`],
        { env }
      );

      const pgDumpPath = await this.resolvePgDumpPath();
      const pgRestorePath = this.derivePgRestorePath(pgDumpPath);
      await this.exec(
        pgRestorePath,
        [
          '-h',
          db.host,
          '-p',
          String(db.port),
          '-U',
          db.username,
          '-d',
          DRILL_TEMP_DB,
          '--no-owner',
          '--no-privileges',
          path.join(dir, target.name),
        ],
        { env }
      );

      const mismatches = await this.compareCountsSafe(target.name);
      const result: RestoreDrillResult = {
        backupName: target.name,
        tablesChecked: mismatches.tablesChecked,
        mismatches: mismatches.rows,
        durationMs: Date.now() - startedAt,
      };
      this.logger.log(
        `恢复演练完成: ${target.name} → ${DRILL_TEMP_DB}（校验 ${result.tablesChecked} 张表，不一致 ${result.mismatches.length} 张，耗时 ${result.durationMs}ms）`
      );
      return result;
    } finally {
      await this.dropTempDbQuietly(psqlPath, db.database, env);
    }
  }

  // ==================== 异地推送（#319，ADR-0055 §5） ====================

  /**
   * 推送指定（默认最新）本地备份到异地：
   * - rsync：SSH key 认证子进程，推后按 BACKUP_REMOTE_KEEP 清理远端最旧备份
   * - oss/s3：CLI 子进程上传（ossutil / aws cli，零新依赖），保留期由存储生命周期规则负责
   * 推送失败抛错，本地备份不受影响；由调度器上报告警
   */
  async pushRemote(filename?: string): Promise<PushRemoteResult> {
    const cfg = this.backupConfig?.remote;
    if (!cfg || cfg.type === 'none') {
      throw new Error('未配置异地推送（BACKUP_REMOTE_TYPE=none）');
    }

    const target = filename ?? (await this.listBackups())[0]?.name;
    if (!target) {
      throw new Error('本地无可用备份文件，异地推送中止');
    }
    if (!BACKUP_FILENAME_PATTERN.test(target)) {
      throw new Error(`非法备份文件名: ${target}`);
    }
    const fullPath = path.join(this.resolveBackupDir(), target);
    let sizeBytes: number;
    try {
      const stats = await fsp.stat(fullPath);
      if (!stats.isFile()) throw new Error('not a file');
      sizeBytes = stats.size;
    } catch {
      throw new Error(`备份文件不存在或不可读: ${target}`);
    }

    const startedAt = Date.now();
    this.validateRemoteConfig(cfg);
    const cliPath = await this.resolveRemoteCli(cfg);
    const remoteTarget = this.buildRemoteTarget(cfg, target);

    this.logger.log(`开始异地推送 (${cfg.type}): ${target} → ${remoteTarget}`);
    if (cfg.type === 'rsync') {
      await this.exec(
        cliPath,
        [
          '-az',
          '--timeout',
          String(RSYNC_TIMEOUT_SECONDS),
          '-e',
          'ssh -o BatchMode=yes -o ConnectTimeout=30',
          fullPath,
          remoteTarget,
        ],
        { env: process.env }
      );
    } else if (cfg.type === 'oss') {
      await this.exec(
        cliPath,
        [
          'cp',
          '-f',
          fullPath,
          remoteTarget,
          '-e',
          cfg.endpoint,
          '-i',
          cfg.accessKey,
          '-k',
          cfg.secret,
        ],
        { env: process.env }
      );
    } else {
      await this.exec(
        cliPath,
        [
          's3',
          'cp',
          fullPath,
          remoteTarget,
          ...(cfg.endpoint ? ['--endpoint-url', cfg.endpoint] : []),
        ],
        {
          env: {
            ...process.env,
            AWS_ACCESS_KEY_ID: cfg.accessKey,
            AWS_SECRET_ACCESS_KEY: cfg.secret,
          },
        }
      );
    }

    let remoteDeletedCount = 0;
    if (cfg.type === 'rsync' && cfg.keep > 0) {
      remoteDeletedCount = await this.rotateRemoteRsync(cfg);
    }

    const result: PushRemoteResult = {
      type: cfg.type,
      filename: target,
      sizeBytes,
      durationMs: Date.now() - startedAt,
      remoteTarget,
      remoteDeletedCount,
    };
    this.logger.log(
      `异地推送完成 (${cfg.type}): ${target} → ${remoteTarget}（耗时 ${result.durationMs}ms${
        remoteDeletedCount ? `，远端清理 ${remoteDeletedCount} 份` : ''
      }）`
    );
    return result;
  }

  /** 按通道校验必填配置，缺失即抛错（错误进入 TaskRun errorSummary 与告警 detail） */
  private validateRemoteConfig(cfg: AppConfig['backup']['remote']): void {
    if (cfg.type === 'rsync') {
      if (!cfg.host)
        throw new Error('rsync 异地推送缺少 BACKUP_REMOTE_HOST 配置');
      if (!cfg.path)
        throw new Error('rsync 异地推送缺少 BACKUP_REMOTE_PATH 配置');
      return;
    }
    if (!cfg.bucket) {
      throw new Error(`${cfg.type} 异地推送缺少 BACKUP_REMOTE_BUCKET 配置`);
    }
    if (!cfg.accessKey || !cfg.secret) {
      throw new Error(
        `${cfg.type} 异地推送缺少 BACKUP_REMOTE_ACCESS_KEY / BACKUP_REMOTE_SECRET 配置`
      );
    }
    if (cfg.type === 'oss' && !cfg.endpoint) {
      throw new Error('oss 异地推送缺少 BACKUP_REMOTE_ENDPOINT 配置');
    }
  }

  /** CLI 探活：显式路径（env 注入）必须存在且可执行，否则回退 PATH 裸命令 */
  private async resolveRemoteCli(
    cfg: AppConfig['backup']['remote']
  ): Promise<string> {
    const isWindows = process.platform === 'win32';
    const suffix = isWindows ? '.exe' : '';
    const configuredByType: Record<RemotePushType, string> = {
      rsync: cfg.rsyncPath,
      oss: cfg.ossutilPath,
      s3: cfg.awsCliPath,
    };
    const fallbackByType: Record<RemotePushType, string> = {
      rsync: `rsync${suffix}`,
      oss: `ossutil${suffix}`,
      s3: `aws${suffix}`,
    };

    const configured = configuredByType[cfg.type];
    if (configured) {
      try {
        await fsp.access(configured, fs.constants.X_OK);
        return configured;
      } catch {
        throw new Error(`配置的 CLI 不存在或不可执行: ${configured}`);
      }
    }
    return fallbackByType[cfg.type];
  }

  private buildRemoteTarget(
    cfg: AppConfig['backup']['remote'],
    filename: string
  ): string {
    if (cfg.type === 'rsync') {
      const userSpec = cfg.host.includes('@')
        ? ''
        : cfg.user
          ? `${cfg.user}@`
          : '';
      const dirPart = cfg.path.endsWith('/') ? cfg.path : `${cfg.path}/`;
      return `${userSpec}${cfg.host}:${dirPart}`;
    }
    const bucketPart = cfg.bucket.endsWith('/')
      ? cfg.bucket.slice(0, -1)
      : cfg.bucket;
    return `${cfg.type === 's3' ? 's3' : 'oss'}://${bucketPart}/${filename}`;
  }

  /**
   * rsync 远端轮转：ssh 列出远端 cloudcad-*.dump（字典序即时间序），
   * 本地计算超出 BACKUP_REMOTE_KEEP 的最旧文件并逐个删除。
   * 假定远端为 POSIX shell（Linux/macOS），轮转失败仅告警日志不阻塞推送结果
   */
  private async rotateRemoteRsync(
    cfg: AppConfig['backup']['remote']
  ): Promise<number> {
    const sshArgs = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=30'];
    const hostSpec = cfg.host.includes('@')
      ? cfg.host
      : cfg.user
        ? `${cfg.user}@${cfg.host}`
        : cfg.host;

    try {
      const { stdout } = await this.exec(
        sshCommand(),
        [
          ...sshArgs,
          hostSpec,
          `cd ${shellSingleQuote(cfg.path)} && ls -1 cloudcad-*.dump 2>/dev/null | sort`,
        ],
        { env: process.env }
      );
      const files = stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const victims = files.slice(0, Math.max(0, files.length - cfg.keep));
      for (const victim of victims) {
        await this.exec(
          sshCommand(),
          [...sshArgs, hostSpec, `rm -f -- ${shellSingleQuote(victim)}`],
          { env: process.env }
        );
        this.logger.log(`远端轮转清理旧备份: ${victim}`);
      }
      return victims.length;
    } catch (error) {
      this.logger.warn(
        `远端备份轮转失败（不影响本次推送）: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return 0;
    }
  }

  // ==================== 审计归档异地同步（#420，等保 8.1.4.3 异地留存） ====================

  /**
   * 审计归档目录异地同步（#420）：复用备份异地推送通道（BACKUP_REMOTE_*），
   * 将归档目录（audit.archivePath）整体同步到远端备份目标的 audit-logs 子目录：
   * - rsync：目录同步（`rsync -az <dir>/ <target>/audit-logs/`，增量、保留权限）
   * - oss/s3：目录递归上传（`ossutil cp -r` / `aws s3 cp --recursive`）
   *
   * 与本地归档→删库解耦：本方法失败只上报告警，不影响已完成的本地归档与删库。
   * 归档目录不存在或无文件时跳过（返回 null）；未配置异地通道时抛错。
   */
  async pushAuditArchiveRemote(): Promise<AuditArchiveSyncResult | null> {
    const cfg = this.backupConfig?.remote;
    if (!cfg || cfg.type === 'none') {
      throw new Error(
        '未配置异地推送（BACKUP_REMOTE_TYPE=none），审计归档无法异地同步'
      );
    }
    this.validateRemoteConfig(cfg);
    const cliPath = await this.resolveRemoteCli(cfg);

    const archiveDir = this.resolveAuditArchiveDir();
    const files = await this.listAuditArchiveFiles(archiveDir);
    if (files.length === 0) {
      this.logger.log(
        `审计归档目录无文件，跳过异地同步: ${archiveDir}（BACKUP_REMOTE_TYPE=${cfg.type}）`
      );
      return null;
    }

    const remoteTarget = this.buildAuditArchiveRemoteTarget(cfg);
    const startedAt = Date.now();
    this.logger.log(
      `开始审计归档异地同步 (${cfg.type}): ${archiveDir} → ${remoteTarget}（${files.length} 个文件）`
    );

    if (cfg.type === 'rsync') {
      // 源目录带尾斜杠 = 同步目录内容；-a 保留权限/时间戳，-z 压缩传输
      await this.exec(
        cliPath,
        [
          '-az',
          '--timeout',
          String(RSYNC_TIMEOUT_SECONDS),
          '-e',
          'ssh -o BatchMode=yes -o ConnectTimeout=30',
          `${archiveDir}/`,
          remoteTarget,
        ],
        { env: process.env }
      );
    } else if (cfg.type === 'oss') {
      // ossutil 递归上传目录内容到远端 audit-logs 前缀
      await this.exec(
        cliPath,
        [
          'cp',
          '-r',
          '-f',
          `${archiveDir}/`,
          remoteTarget,
          '-e',
          cfg.endpoint,
          '-i',
          cfg.accessKey,
          '-k',
          cfg.secret,
        ],
        { env: process.env }
      );
    } else {
      // aws s3 递归上传目录内容
      await this.exec(
        cliPath,
        [
          's3',
          'cp',
          `${archiveDir}/`,
          remoteTarget,
          '--recursive',
          ...(cfg.endpoint ? ['--endpoint-url', cfg.endpoint] : []),
        ],
        {
          env: {
            ...process.env,
            AWS_ACCESS_KEY_ID: cfg.accessKey,
            AWS_SECRET_ACCESS_KEY: cfg.secret,
          },
        }
      );
    }

    const result: AuditArchiveSyncResult = {
      type: cfg.type,
      fileCount: files.length,
      durationMs: Date.now() - startedAt,
      remoteTarget,
    };
    this.logger.log(
      `审计归档异地同步完成 (${cfg.type}): ${files.length} 个文件 → ${remoteTarget}（耗时 ${result.durationMs}ms）`
    );
    return result;
  }

  /** 归档目录解析（audit.archivePath，相对路径基于项目根，与 AuditArchiveService 同源） */
  private resolveAuditArchiveDir(): string {
    const rawDir =
      this.configService.get<string>('audit.archivePath') ||
      'data/archives/audit-logs';
    return path.isAbsolute(rawDir)
      ? path.normalize(rawDir)
      : path.resolve(PROJECT_ROOT, rawDir);
  }

  /** 列出归档目录中的归档产物文件（CSV/清单/链文件/链头），目录缺失返回空 */
  private async listAuditArchiveFiles(dir: string): Promise<string[]> {
    let entries: string[];
    try {
      entries = await fsp.readdir(dir);
    } catch {
      return [];
    }
    const exts = ['.csv', '.sha256', '.chain.json'];
    const files: string[] = [];
    for (const name of entries) {
      if (name === 'chain-head.json' || exts.some((e) => name.endsWith(e))) {
        try {
          const stats = await fsp.stat(path.join(dir, name));
          if (stats.isFile()) files.push(name);
        } catch {
          // stat 失败的文件跳过
        }
      }
    }
    return files;
  }

  /** 审计归档远端目标：备份目标的 audit-logs 子目录（与数据库备份隔离存放） */
  private buildAuditArchiveRemoteTarget(
    cfg: AppConfig['backup']['remote']
  ): string {
    const base = this.buildRemoteTarget(cfg, '');
    if (cfg.type === 'rsync') {
      const dirPart = base.endsWith('/') ? base : `${base}/`;
      return `${dirPart}audit-logs/`;
    }
    // oss/s3：buildRemoteTarget('') 返回 `oss://bucket/`（尾斜杠），去尾斜杠后拼子目录
    const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${trimmed}/audit-logs/`;
  }

  // ==================== #319 结束 ====================

  /**
   * 列出现有备份文件（按时间倒序）
   */
  async listBackups(): Promise<BackupFileInfo[]> {
    const dir = this.resolveBackupDir();

    let entries: string[];
    try {
      entries = await fsp.readdir(dir);
    } catch {
      // 目录不存在或不可读视为无备份
      return [];
    }
    if (!Array.isArray(entries)) return [];

    const files = entries.filter((name) => BACKUP_FILENAME_PATTERN.test(name));
    const infos: (BackupFileInfo & { path: string })[] = [];
    for (const name of files) {
      const fullPath = path.join(dir, name);
      try {
        const stats = await fsp.stat(fullPath);
        if (!stats.isFile()) continue;
        infos.push({
          name,
          sizeBytes: stats.size,
          modifiedAt: stats.mtime,
          path: fullPath,
        });
      } catch {
        // stat 失败的文件跳过，不影响列表整体返回
      }
    }

    infos.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
    return infos.map(({ name, sizeBytes, modifiedAt }) => ({
      name,
      sizeBytes,
      modifiedAt,
    }));
  }

  /**
   * 手动删除指定备份文件（严格校验文件名防路径穿越）
   */
  async deleteBackup(name: string): Promise<void> {
    if (!BACKUP_FILENAME_PATTERN.test(name)) {
      throw new Error(`非法备份文件名: ${name}`);
    }
    const dir = this.resolveBackupDir();
    const fullPath = path.resolve(dir, name);
    if (!fullPath.startsWith(path.resolve(dir) + path.sep)) {
      throw new Error(`非法备份文件路径: ${name}`);
    }
    await fsp.unlink(fullPath);
    this.logger.log(`已删除备份文件: ${name}`);
  }

  /**
   * 本地轮转：保留最新 keepLocal 份，超出清理最旧备份
   * @returns 清理数量
   */
  async rotateBackups(keepLocal: number): Promise<number> {
    const backups = await this.listBackups();
    if (backups.length <= keepLocal) {
      return 0;
    }

    const toDelete = backups.slice(keepLocal);
    let deleted = 0;
    let freedBytes = 0;
    const startedAt = Date.now();
    for (const backup of toDelete) {
      const fullPath = path.join(this.resolveBackupDir(), backup.name);
      try {
        await fsp.unlink(fullPath);
        deleted++;
        freedBytes += backup.sizeBytes;
        this.logger.log(`轮转清理旧备份: ${backup.name}`);
        // 同步清理行数快照，避免孤儿文件堆积（#320）
        await this.removeFileQuietly(`${fullPath}.counts.json`);
      } catch (error) {
        this.logger.warn(
          `轮转清理备份失败 (${backup.name}): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
    // cleanup_* 指标埋点（#325）：本地轮转清理
    this.cleanupMetrics.observe({
      task: TASK_NAMES.BACKUP.ROTATE,
      recordsDeleted: deleted,
      spaceFreedBytes: freedBytes,
      durationSeconds: (Date.now() - startedAt) / 1000,
    });
    return deleted;
  }

  /**
   * pg_dump 探活路径（参考 config-service lib/db-backup.js）：
   * 1. backup.pgDumpPath 配置（来源 PG_DUMP_PATH env，必须存在且可执行）
   * 2. runtime/<platform> 内置 PostgreSQL 目录
   * 3. 系统 PATH（裸命令回退）
   */
  async resolvePgDumpPath(): Promise<string> {
    const configured = this.backupConfig?.pgDumpPath;

    if (configured) {
      try {
        await fsp.access(configured, fs.constants.X_OK);
        return configured;
      } catch {
        throw new Error(
          `PG_DUMP_PATH 指向的 pg_dump 不存在或不可执行: ${configured}`
        );
      }
    }

    const isWindows = process.platform === 'win32';
    const runtimeCandidate = isWindows
      ? path.join(
          PROJECT_ROOT,
          'runtime',
          'windows',
          'postgresql',
          'pgsql',
          'bin',
          'pg_dump.exe'
        )
      : path.join(
          PROJECT_ROOT,
          'runtime',
          'linux',
          'postgres',
          'bin',
          'pg_dump'
        );

    if (fs.existsSync(runtimeCandidate)) {
      return runtimeCandidate;
    }

    return isWindows ? 'pg_dump.exe' : 'pg_dump';
  }

  private derivePgRestorePath(pgDumpPath: string): string {
    return this.deriveSiblingTool(pgDumpPath, 'pg_restore');
  }

  private async resolvePsqlPath(): Promise<string> {
    const pgDumpPath = await this.resolvePgDumpPath();
    return this.deriveSiblingTool(pgDumpPath, 'psql');
  }

  private deriveSiblingTool(pgDumpPath: string, tool: string): string {
    const isWindows = process.platform === 'win32';
    const suffix = isWindows ? '.exe' : '';
    const dir = path.dirname(pgDumpPath);
    if (dir && dir !== '.' && fs.existsSync(dir)) {
      const candidate = path.join(dir, `${tool}${suffix}`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return `${tool}${suffix}`;
  }

  /**
   * 校验失败标记：重命名为 <name>.invalid（不匹配 BACKUP_FILENAME_PATTERN，
   * 自动排除在列表/轮转之外，保留现场供人工排查）
   */
  private async markInvalid(fullPath: string): Promise<void> {
    try {
      await fsp.rename(fullPath, `${fullPath}.invalid`);
    } catch {
      // 标记失败不掩盖原始错误
    }
  }

  /**
   * 备份成功后写行数快照 <name>.counts.json（#320 演练比对基线），
   * best-effort：任何失败仅告警日志，不影响备份结果
   */
  private async writeCountsSnapshotSafe(
    outputFile: string,
    filename: string
  ): Promise<void> {
    const tables = this.backupConfig?.drillTables ?? [];
    if (!tables.length) return;
    try {
      const counts: Record<string, number> = {};
      for (const table of tables) {
        const n = await this.countTable(table);
        if (n !== null) counts[table] = n;
      }
      const snapshot = {
        filename,
        takenAt: new Date().toISOString(),
        tables: counts,
      };
      await fsp.writeFile(
        `${outputFile}.counts.json`,
        JSON.stringify(snapshot, null, 2),
        'utf8'
      );
    } catch (error) {
      this.logger.warn(
        `行数快照写入失败（演练将跳过行数比对）: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 对生产库单表 COUNT(*)，失败返回 null（跳过该表）
   */
  private async countTable(table: string): Promise<number | null> {
    if (!IDENTIFIER_PATTERN.test(table)) {
      this.logger.warn(`非法表名，跳过行数统计: ${table}`);
      return null;
    }
    const db = this.configService.get<AppConfig['database']>('database');
    if (!db) return null;
    try {
      const psqlPath = await this.resolvePsqlPath();
      const { stdout } = await this.exec(
        psqlPath,
        [
          '-tA',
          '-d',
          db.database,
          '-c',
          `SELECT COUNT(*)::bigint FROM "${table}"`,
        ],
        { env: { ...process.env, PGPASSWORD: db.password } }
      );
      const trimmed = stdout.trim();
      return /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : null;
    } catch (error) {
      this.logger.warn(
        `表行数统计失败 (${table}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  /**
   * 演练行数比对：读备份时快照逐表比对临时库实际行数；
   * 无快照文件时跳过比对（恢复本身已验证可恢复性）
   */
  private async compareCountsSafe(backupName: string): Promise<{
    tablesChecked: number;
    rows: RestoreDrillResult['mismatches'];
  }> {
    const snapshotPath = path.join(
      this.resolveBackupDir(),
      `${backupName}.counts.json`
    );
    let snapshot: { tables?: Record<string, number> };
    try {
      snapshot = JSON.parse(await fsp.readFile(snapshotPath, 'utf8'));
    } catch {
      this.logger.warn('无行数快照，演练跳过行数比对');
      return { tablesChecked: 0, rows: [] };
    }

    const expected = snapshot.tables ?? {};
    const rows: RestoreDrillResult['mismatches'] = [];
    let checked = 0;
    for (const [table, expectedCount] of Object.entries(expected)) {
      const actual = await this.countTableOnDb(table, DRILL_TEMP_DB);
      if (actual === null) continue;
      checked++;
      if (actual !== expectedCount) {
        rows.push({ table, expected: expectedCount, actual });
      }
    }
    return { tablesChecked: checked, rows };
  }

  /**
   * 对指定库单表 COUNT(*)（演练临时库），失败返回 null
   */
  private async countTableOnDb(
    table: string,
    database: string
  ): Promise<number | null> {
    if (!IDENTIFIER_PATTERN.test(table)) return null;
    const db = this.configService.get<AppConfig['database']>('database');
    if (!db) return null;
    try {
      const psqlPath = await this.resolvePsqlPath();
      const { stdout } = await this.exec(
        psqlPath,
        [
          '-tA',
          '-d',
          database,
          '-c',
          `SELECT COUNT(*)::bigint FROM "${table}"`,
        ],
        { env: { ...process.env, PGPASSWORD: db.password } }
      );
      const trimmed = stdout.trim();
      return /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : null;
    } catch {
      return null;
    }
  }

  private async dropTempDbQuietly(
    psqlPath: string,
    maintenanceDb: string,
    env: NodeJS.ProcessEnv
  ): Promise<void> {
    try {
      await this.exec(
        psqlPath,
        [
          '-d',
          maintenanceDb,
          '-c',
          `DROP DATABASE IF EXISTS "${DRILL_TEMP_DB}"`,
        ],
        { env }
      );
    } catch (error) {
      this.logger.warn(
        `演练临时库清理失败 (${DRILL_TEMP_DB}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private resolveBackupDir(): string {
    const cfg = this.backupConfig;
    const rawDir = cfg?.dir || 'data/backups';
    return path.isAbsolute(rawDir)
      ? path.normalize(rawDir)
      : path.resolve(PROJECT_ROOT, rawDir);
  }

  private formatTimestamp(date: Date): string {
    const pad = (n: number, width = 2) => String(n).padStart(width, '0');
    return (
      `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
      `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    );
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  private exec(
    file: string,
    args: string[],
    options: { env: NodeJS.ProcessEnv }
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      execFile(
        file,
        args,
        {
          ...options,
          timeout: BACKUP_PROCESS_TIMEOUT_MS,
          maxBuffer: 64 * 1024 * 1024,
          windowsHide: true,
        },
        (error: Error | null, stdout: string, stderr: string): void => {
          if (error) {
            const stderrText = stderr?.trim();
            reject(
              new Error(
                `${file} 执行失败: ${error.message}${stderrText ? ` — ${stderrText}` : ''}`
              )
            );
            return;
          }
          resolve({ stdout, stderr });
        }
      );
    });
  }

  private async removeFileQuietly(fullPath: string): Promise<void> {
    try {
      await fsp.unlink(fullPath);
    } catch {
      // 清理失败不掩盖原始错误
    }
  }
}
