/**
 * @fileoverview 运维中心路由（ADR-0071）
 *
 * 端点分三类：
 * - 长任务（job runner 执行 + current-task 轮询）：部署/迁移/启动/停止双档/日志打包
 * - 同步快任务：TOTP 解绑（psql 两三次调用）
 * - 只读/下载：任务状态、日志位置、日志尾部分、日志包下载（download-token 防越权）
 *
 * 依赖方向：routes → lib（job-runner、ops、session）。
 */

const fs = require('fs');
const { sendJson, parseBody } = require('../lib/utils');
const {
  authMiddleware,
  createDownloadToken,
  consumeDownloadToken,
} = require('../lib/session');
const { jobRunner } = require('../lib/job-runner');
const ops = require('../lib/ops');

/** 长任务启动的公共封装：忙时返回 409 */
function startLongTask(res, { kind, label, fn }) {
  const result = jobRunner.startJob({ kind, label, fn });
  if (!result.started) {
    sendJson(res, 409, {
      success: false,
      error: `已有任务正在执行（${result.task?.label || result.task?.kind}），请等待其完成`,
      task: result.task,
    });
    return;
  }
  sendJson(res, 200, { success: true, task: result.task });
}

async function handle(req, res, pathname, method) {
  // ---- 任务状态轮询 ----
  if (pathname === '/api/ops/current-task' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const task = jobRunner.getCurrentTask() || jobRunner.readPersistedTask();
    sendJson(res, 200, { success: true, task });
    return true;
  }

  // ---- 部署 / 升级（长任务；版本检查/验证已织入部署流程自动执行） ----
  if (pathname === '/api/ops/deploy' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const skipBuild = body.skipBuild !== false; // 缺省跳过构建（部署包/已有 dist 场景）
    startLongTask(res, {
      kind: 'deploy',
      label: skipBuild ? '部署 / 升级（使用现有构建产物）' : '部署 / 升级（重新构建）',
      fn: (task) => ops.runDeploy(skipBuild, task),
    });
    return true;
  }

  // ---- 数据库迁移（长任务） ----
  if (pathname === '/api/ops/migrate' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    startLongTask(res, {
      kind: 'migrate',
      label: '数据库迁移',
      fn: () => ops.runMigrate(),
    });
    return true;
  }

  // ---- 启动服务（长任务；PM2 后台） ----
  if (pathname === '/api/ops/start' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    startLongTask(res, {
      kind: 'start',
      label: '启动服务（PM2 后台）',
      fn: () => ops.runStart(),
    });
    return true;
  }

  // ---- 停止服务：仅应用层（主按钮；基础设施保持在线，页面不失联） ----
  if (pathname === '/api/ops/stop-apps' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    startLongTask(res, {
      kind: 'stop-apps',
      label: '停止应用服务（backend/frontend/conversion）',
      fn: () => ops.runStopApps(),
    });
    return true;
  }

  // ---- 完全停止（危险操作：含 PG/Redis/config-service，执行后页面失联） ----
  if (pathname === '/api/ops/stop-all' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    if (body.confirm !== 'STOP') {
      sendJson(res, 400, {
        success: false,
        error: '需要确认（confirm=STOP）才能完全停止所有服务',
      });
      return true;
    }

    startLongTask(res, {
      kind: 'stop-all',
      label: '完全停止（含数据库/缓存，本页面将随之失联）',
      fn: () => ops.runStopAll(),
    });
    return true;
  }

  // ---- 管理员 TOTP 解绑（同步快任务；网页侧已双重确认） ----
  if (pathname === '/api/ops/mfa-unbind' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const username = (body.username || '').trim();
    if (!username) {
      sendJson(res, 400, { success: false, error: '需要提供管理员用户名' });
      return true;
    }

    const result = await ops.runMfaUnbind(username);
    const ok = result && result.ok === true;
    sendJson(res, ok ? 200 : 400, {
      success: ok,
      message: result?.message || result?.error || '未知结果',
    });
    return true;
  }

  // ---- 日志位置一览 ----
  if (pathname === '/api/ops/logs/locations' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const result = ops.getLogLocations();
    sendJson(res, result?.ok === false ? 500 : 200, {
      success: result?.ok !== false,
      groups: Array.isArray(result) ? result : [],
      error: result?.error,
    });
    return true;
  }

  // ---- 在线查看日志尾部 ----
  if (pathname === '/api/ops/logs/view' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const url = new URL(req.url, `http://${req.headers.host}`);
    const result = ops.viewLogFile(
      url.searchParams.get('file'),
      url.searchParams.get('lines')
    );
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  // ---- 日志打包（长任务） ----
  if (pathname === '/api/ops/logs/bundle' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const days = parseInt(body.days, 10);
    startLongTask(res, {
      kind: 'logs-bundle',
      label: Number.isFinite(days) && days > 0 ? `打包最近 ${days} 天日志` : '打包全部日志',
      fn: () => ops.runLogBundle(Number.isFinite(days) && days > 0 ? days : 0),
    });
    return true;
  }

  // ---- 日志包下载凭证（同 db download-token 模式，防任意文件读） ----
  if (pathname === '/api/ops/logs/bundle-download-token' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const { filename } = body;
    if (!ops.isValidLogBundleName(filename)) {
      sendJson(res, 400, { success: false, error: '非法的日志包文件名' });
      return true;
    }
    if (!fs.existsSync(ops.getLogBundlePath(filename))) {
      sendJson(res, 404, { success: false, error: '日志包不存在' });
      return true;
    }
    const downloadToken = createDownloadToken(filename);
    sendJson(res, 200, { success: true, downloadToken });
    return true;
  }

  // ---- 日志包下载（token 一次性，5 分钟有效） ----
  if (pathname.startsWith('/api/ops/logs/download') && method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const downloadToken = url.searchParams.get('token');
    if (!downloadToken) {
      sendJson(res, 401, { error: '缺少下载凭证' });
      return true;
    }

    const filename = consumeDownloadToken(downloadToken);
    if (!filename || !ops.isValidLogBundleName(filename)) {
      sendJson(res, 401, { error: '下载凭证无效或已过期' });
      return true;
    }

    const filePath = ops.getLogBundlePath(filename);
    if (!fs.existsSync(filePath)) {
      sendJson(res, 404, { error: '日志包不存在' });
      return true;
    }

    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': fs.statSync(filePath).size,
    });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }

  return false;
}

module.exports = { handle };
