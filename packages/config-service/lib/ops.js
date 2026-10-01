/**
 * @fileoverview 运维能力桥接层 —— config-service → runtime/scripts 函数级复用
 *
 * ADR-0071：CLI 交互菜单是运维能力的单一事实源，config-service 只做薄壳。
 * 本模块延迟 require runtime/scripts 的命令函数（部署/迁移/启停/TOTP）与
 * 日志中心（清单/打包/查看），并做参数校验。禁止把 CLI 逻辑复制进来。
 *
 * 所有 runtime 依赖走延迟 require：包布局异常（runtime/scripts 缺失）时
 * 返回结构化错误，而不是让 config-service 启动失败。
 */

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('./constants');
const { log } = require('./utils');

const RUNTIME_SCRIPTS_DIR = path.join(PROJECT_ROOT, 'runtime', 'scripts');

function requireRuntime(relPath) {
  return require(path.join(RUNTIME_SCRIPTS_DIR, relPath));
}

/** 包装延迟 require：runtime/scripts 不可用时返回结构化错误而非抛异常 */
function tryRuntime(fn) {
  try {
    return fn();
  } catch (err) {
    log('error', `runtime/scripts 调用失败: ${err.message}`);
    return { ok: false, error: `runtime/scripts 不可用：${err.message}` };
  }
}

// ==================== 长任务动作（交给 job runner 执行） ====================

/** 部署 / 升级（非交互：PM2 后台、不重建）。fn(task) 由 job runner 调用。 */
async function runDeploy(skipBuild, task) {
  return tryRuntime(() => {
    const { deployMode } = requireRuntime('commands/deploy');
    const { getActiveLogFile } = requireRuntime('lib/deploy-log');
    const pending = deployMode(skipBuild, { mode: 'pm2', rebuild: false });
    // deployMode 内部同步注册了输出镜像 tee，这里立刻取进度日志文件路径
    task.logFile = getActiveLogFile('deploy');
    return pending;
  });
}

/** 数据库迁移（非交互：迁移前备份失败一律中止） */
async function runMigrate() {
  return tryRuntime(() =>
    requireRuntime('commands/migrate').runDatabaseMigration({
      continueOnBackupFailure: false,
    })
  );
}

/** 启动服务（PM2 后台，基础服务幂等复用；基础服务未就绪直接中止） */
async function runStart() {
  return tryRuntime(() =>
    requireRuntime('commands/start').startMode({ mode: 'pm2' })
  );
}

/** 停止应用层（backend/frontend/conversion），基础服务保持在线 */
async function runStopApps() {
  return tryRuntime(() =>
    requireRuntime('commands/stop').stopAppServices()
  );
}

/** 完全停止（含 PG/Redis/config-service）——执行后本页面将失联 */
async function runStopAll() {
  return tryRuntime(() =>
    requireRuntime('commands/stop').stopInfrastructure()
  );
}

/** 管理员 TOTP 解绑（同步快任务，网页侧已双重确认） */
async function runMfaUnbind(username) {
  return tryRuntime(() =>
    requireRuntime('commands/mfa').mfaTotpUnbind(username, { confirmed: true })
  );
}

// ==================== 日志中心（复用 runtime/scripts/lib/log-center） ====================

function getLogLocations() {
  return tryRuntime(() => {
    const { listLogLocations } = requireRuntime('lib/log-center');
    return listLogLocations();
  });
}

function runLogBundle(days) {
  return tryRuntime(() => {
    const { bundleLogs } = requireRuntime('lib/log-center');
    console.log(`正在收集日志（${days > 0 ? `最近 ${days} 天` : '全部'}）...`);
    const result = bundleLogs(days > 0 ? { days } : {});
    if (result.ok) {
      console.log(
        `打包完成: ${result.fileCount} 个日志文件 → ${result.outPath}`
      );
    } else {
      console.log('未找到任何日志文件，无可打包内容');
    }
    return result;
  });
}

/** zip 内相对名的合法形态：<slug>/<单个文件名>.log（禁止路径穿越） */
function isValidLogZipName(zipName) {
  if (typeof zipName !== 'string') return false;
  const idx = zipName.indexOf('/');
  if (idx === -1 || idx !== zipName.lastIndexOf('/')) return false;
  const slug = zipName.slice(0, idx);
  const name = zipName.slice(idx + 1);
  if (!slug || slug.includes('..') || slug.includes('\\')) return false;
  if (!/^[A-Za-z0-9._-]+\.log$/.test(name) || name.includes('..')) return false;
  return true;
}

/**
 * 在线查看某个日志文件的尾部。
 * @param {string} zipName log-center 打包用的相对名（slug/文件名.log）
 * @param {number} [lines=200] 返回尾部行数（1..1000）
 */
function viewLogFile(zipName, lines = 200) {
  return tryRuntime(() => {
    const { LOG_SOURCES } = requireRuntime('lib/log-center');
    if (!isValidLogZipName(zipName)) {
      return { ok: false, error: '非法的日志文件名' };
    }
    const count = Math.min(Math.max(parseInt(lines, 10) || 200, 1), 1000);

    const slug = zipName.slice(0, zipName.indexOf('/'));
    const name = zipName.slice(zipName.indexOf('/') + 1);
    const source = LOG_SOURCES.find((s) => s.slug === slug);
    if (!source) return { ok: false, error: '未知的日志源' };
    if (source.filter && !source.filter(name)) {
      return { ok: false, error: '该日志源不含此文件' };
    }

    const absPath = path.join(PROJECT_ROOT, source.dir, name);
    // 纵深防御：解析后的绝对路径必须仍在源目录内
    const absDir = path.join(PROJECT_ROOT, source.dir);
    if (!absPath.startsWith(absDir + path.sep)) {
      return { ok: false, error: '非法的日志文件路径' };
    }

    let stat;
    try {
      stat = fs.statSync(absPath);
    } catch {
      return { ok: false, error: '日志文件不存在' };
    }

    // 只读尾部 512KB（日志文件可能很大），足够 1000 行
    const READ_MAX = 512 * 1024;
    const start = Math.max(0, stat.size - READ_MAX);
    const len = stat.size - start;
    const buf = Buffer.alloc(len);
    const fd = fs.openSync(absPath, 'r');
    try {
      fs.readSync(fd, buf, 0, len, start);
    } finally {
      fs.closeSync(fd);
    }

    const text = buf.toString('utf8');
    const rawLines = text.split(/\r?\n/);
    if (start > 0) rawLines.shift(); // 掐掉截断处的半行
    if (rawLines.length && rawLines[rawLines.length - 1] === '') rawLines.pop();
    const totalLines = (start > 0 ? -1 : 0) + rawLines.length; // 截断时行数未知
    const tail = rawLines.slice(-count);

    return {
      ok: true,
      file: zipName,
      sizeBytes: stat.size,
      mtime: stat.mtime.toISOString(),
      truncated: start > 0 || rawLines.length > count,
      lines: tail,
    };
  });
}

/**
 * 为日志打包产物签发下载凭证（复用 session download-token 机制）。
 * 只允许 data/log-bundles 下形如 logs-<时间戳>.zip 的文件，防任意文件读。
 */
function isValidLogBundleName(filename) {
  return (
    typeof filename === 'string' && /^logs-\d{8}-\d{6}\.zip$/.test(filename)
  );
}

function getLogBundlePath(filename) {
  return path.join(PROJECT_ROOT, 'data', 'log-bundles', filename);
}

module.exports = {
  RUNTIME_SCRIPTS_DIR,
  runDeploy,
  runMigrate,
  runStart,
  runStopApps,
  runStopAll,
  runMfaUnbind,
  getLogLocations,
  runLogBundle,
  viewLogFile,
  isValidLogZipName,
  isValidLogBundleName,
  getLogBundlePath,
};
