/**
 * @fileoverview 日志中心 —— 全部日志源清单 / 位置一览 / 一键打包
 *
 * 日志位置的**单一事实源**：CLI（菜单 [3] 日志中心 / logs:locations /
 * logs:bundle）与运维中心（config-service，ADR-0071）共用本模块，新增服务
 * 日志只改 LOG_SOURCES 一处，禁止在消费方各自抄第二份清单。
 *
 * 覆盖的日志源（ADR-0071 前调研结论）：
 * - PM2 各托管应用 out/error（backend/frontend/conversion/cooperate/
 *   config-service/postgresql/redis，redis/cooperate 无独立文件、输出并入此处）
 * - PostgreSQL（data/logs/postgres.log，pg_ctl -l 指定）
 * - backend pino-roll 按天轮转 app.log + access-*.log
 * - conversion-service / config-service / storage-service 按天 JSON 日志
 * - 部署 / 升级过程（lib/deploy-log.js 镜像落盘）
 * - 运维 CLI 留痕（data/ops-log/YYYYMM.ops.log）
 *
 * 依赖方向：lib → lib。本模块属 lib，只允许 require 其他 lib。
 */

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('./context');
const { createZip } = require('./zip-writer');

/**
 * 日志源清单。slug 同时用作 zip 内的一级目录名（不同源存在同名文件，
 * 如 backend/conversion-service/config-service 都有 app-*.log，必须隔离）。
 * filter：源目录里只挑部分文件的场合（如 data/logs 根下仅 postgres.log，
 * 子目录由各自独立条目覆盖）。
 */
const LOG_SOURCES = [
  {
    slug: 'pm2',
    service: 'PM2 托管服务（backend/frontend/conversion/cooperate/config-service/postgresql/redis）',
    dir: path.join('data', 'pm2', 'logs'),
  },
  {
    slug: 'postgres',
    service: 'PostgreSQL',
    dir: path.join('data', 'logs'),
    filter: (name) => name === 'postgres.log',
  },
  {
    slug: 'backend',
    service: 'Backend 应用日志（app.log 按天轮转 / access 访问日志）',
    dir: path.join('data', 'logs', 'backend'),
  },
  {
    slug: 'conversion',
    service: '转换服务',
    dir: path.join('data', 'logs', 'conversion-service'),
  },
  {
    slug: 'config-service',
    service: '配置中心',
    dir: path.join('data', 'logs', 'config-service'),
  },
  {
    slug: 'storage',
    service: '存储服务',
    dir: path.join('data', 'logs', 'storage-service'),
  },
  {
    slug: 'deploy',
    service: '部署 / 升级过程',
    dir: path.join('data', 'logs', 'deploy'),
  },
  {
    slug: 'ops',
    service: '运维 CLI 留痕',
    dir: path.join('data', 'ops-log'),
  },
];

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function formatStamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * 收集全部日志文件。
 * @param {{days?: number, rootDir?: string}} [options]
 *   days 为正数时仅收集最近 N 天内有修改的文件；默认全部。
 * @returns {Array<{absPath: string, zipName: string, source: string, size: number, mtime: Date}>}
 */
function collectLogFiles({ days, rootDir = PROJECT_ROOT } = {}) {
  const cutoff =
    Number.isFinite(days) && days > 0 ? Date.now() - days * 24 * 3600 * 1000 : 0;
  const files = [];
  for (const source of LOG_SOURCES) {
    const absDir = path.join(rootDir, source.dir);
    let names;
    try {
      names = fs.readdirSync(absDir);
    } catch {
      continue; // 目录不存在（服务未装/未运行过）——跳过不算错误
    }
    for (const name of names) {
      if (!name.endsWith('.log')) continue;
      if (source.filter && !source.filter(name)) continue;
      const absPath = path.join(absDir, name);
      let stat;
      try {
        stat = fs.statSync(absPath);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      if (cutoff && stat.mtimeMs < cutoff) continue;
      files.push({
        absPath,
        zipName: `${source.slug}/${name}`,
        source: source.service,
        size: stat.size,
        mtime: stat.mtime,
      });
    }
  }
  return files;
}

/**
 * 日志位置一览（清单 + 实际文件明细）。
 * @returns {Array<{service: string, dir: string, exists: boolean, files: Array<{name: string, size: number, sizeText: string, mtimeText: string}>}>}
 */
function listLogLocations({ rootDir = PROJECT_ROOT } = {}) {
  return LOG_SOURCES.map((source) => {
    const absDir = path.join(rootDir, source.dir);
    const exists = fs.existsSync(absDir);
    const files = exists
      ? collectLogFiles({ rootDir })
          .filter((f) => path.dirname(f.absPath) === absDir)
          .map((f) => ({
            name: path.basename(f.absPath),
            size: f.size,
            sizeText: formatSize(f.size),
            mtimeText: formatTime(f.mtime),
          }))
      : [];
    return {
      slug: source.slug,
      service: source.service,
      dir: absDir,
      exists,
      files,
    };
  });
}

/**
 * 一键打包全部日志为 zip。
 * @param {{days?: number, rootDir?: string, outDir?: string, now?: Date}} [options]
 * @returns {{ok: boolean, outPath?: string, fileCount?: number, totalBytes?: number,
 *            zipSize?: number, skipped: string[], reason?: string}}
 *   skipped 为不存在的日志目录（相对路径）——缺失不是错误，但要让用户知道打了哪些。
 */
function bundleLogs({ days, rootDir = PROJECT_ROOT, outDir, now = new Date() } = {}) {
  const skipped = LOG_SOURCES.filter((s) => {
    try {
      return !fs.statSync(path.join(rootDir, s.dir)).isDirectory();
    } catch {
      return true;
    }
  }).map((s) => s.dir);

  const files = collectLogFiles({ days, rootDir });
  if (!files.length) {
    return { ok: false, skipped, reason: 'no-files' };
  }

  const targetDir = outDir || path.join(rootDir, 'data', 'log-bundles');
  const outPath = path.join(targetDir, `logs-${formatStamp(now)}.zip`);
  createZip(
    files.map((f) => ({
      name: f.zipName,
      data: fs.readFileSync(f.absPath),
      mtime: f.mtime,
    })),
    outPath
  );
  return {
    ok: true,
    outPath,
    fileCount: files.length,
    totalBytes: files.reduce((sum, f) => sum + f.size, 0),
    zipSize: fs.statSync(outPath).size,
    skipped,
  };
}

module.exports = {
  LOG_SOURCES,
  collectLogFiles,
  listLogLocations,
  bundleLogs,
  formatSize,
  formatTime,
  formatStamp,
};
