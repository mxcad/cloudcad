const { log, parseBody, sendJson } = require('../lib/utils');
const { authMiddleware, createDownloadToken, consumeDownloadToken } = require('../lib/session');
const { parseEnvFile } = require('../lib/env');
const { ENV_PATH, BACKUP_DIR } = require('../lib/constants');
const { testTcpConnection } = require('../lib/network');
const {
  listBackupFiles,
  backupDatabase,
  restoreDatabase,
  cleanupOldBackups,
  isValidBackupFilename,
} = require('../lib/db-backup');
const fs = require('fs');
const path = require('path');

async function handle(req, res, pathname, method) {
  if (pathname === '/api/test/database' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const env = parseEnvFile(ENV_PATH);
    const result = await testTcpConnection({
      host: env.DB_HOST || 'localhost',
      port: parseInt(env.DB_PORT || '5432'),
    });

    sendJson(res, 200, result);
    return true;
  }

  if (pathname === '/api/test/redis' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const env = parseEnvFile(ENV_PATH);
    const result = await testTcpConnection({
      host: env.REDIS_HOST || 'localhost',
      port: parseInt(env.REDIS_PORT || '6379'),
    });

    sendJson(res, 200, result);
    return true;
  }

  if (pathname === '/api/db/backups' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const backups = listBackupFiles();
    sendJson(res, 200, { success: true, backups });
    return true;
  }

  if (pathname === '/api/db/backup' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const result = await backupDatabase();
    sendJson(res, result.success ? 200 : 500, result);
    return true;
  }

  if (pathname === '/api/db/restore' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const { filename, confirm } = body;

    if (!confirm) {
      sendJson(res, 400, { success: false, error: '需要确认恢复操作' });
      return true;
    }

    if (!filename) {
      sendJson(res, 400, { success: false, error: '需要指定备份文件名' });
      return true;
    }

    const result = await restoreDatabase(filename);
    sendJson(res, result.success ? 200 : 500, result);
    return true;
  }

  if (pathname === '/api/db/cleanup' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const maxBackups = body.maxBackups || 10;

    const result = await cleanupOldBackups(maxBackups);
    sendJson(res, 200, { success: true, ...result });
    return true;
  }

  if (pathname.match(/^\/api\/db\/download\//) && method === 'GET') {
    const downloadToken = req.url.includes('?')
      ? new URL(req.url, `http://${req.headers.host}`).searchParams.get('token')
      : null;

    if (!downloadToken) {
      sendJson(res, 401, { error: '缺少下载凭证' });
      return true;
    }

    const filename = consumeDownloadToken(downloadToken);
    if (!filename) {
      sendJson(res, 401, { error: '下载凭证无效或已过期' });
      return true;
    }

    // 纵深防御：token 内的 filename 在 download-token 端点已校验，此处再校验一次
    // 防任意文件读（filename 经 path.join 拼 BACKUP_DIR，无校验可越界读任意文件）
    if (!isValidBackupFilename(filename)) {
      sendJson(res, 400, { error: '非法的备份文件名' });
      return true;
    }

    const filePath = path.join(BACKUP_DIR, filename);

    if (!fs.existsSync(filePath)) {
      sendJson(res, 404, { error: '备份文件不存在' });
      return true;
    }

    res.writeHead(200, {
      'Content-Type': 'application/sql',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': fs.statSync(filePath).size,
    });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }

  if (pathname === '/api/db/download-token' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const { filename } = body;

    if (!filename) {
      sendJson(res, 400, { success: false, error: '需要指定文件名' });
      return true;
    }

    // 只允许为合法备份文件签发下载凭证，否则可借 download 端点读任意文件
    if (!isValidBackupFilename(filename)) {
      sendJson(res, 400, { success: false, error: '非法的备份文件名' });
      return true;
    }

    const downloadToken = createDownloadToken(filename);
    sendJson(res, 200, { success: true, downloadToken });
    return true;
  }

  if (pathname.match(/^\/api\/db\/backup\//) && method === 'DELETE') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const filename = decodeURIComponent(pathname.split('/').pop());

    // filename 经 decodeURIComponent 还原（%2e%2e%2f → ../），无校验可越界删任意文件
    if (!isValidBackupFilename(filename)) {
      sendJson(res, 400, { success: false, error: '非法的备份文件名' });
      return true;
    }

    const filePath = path.join(BACKUP_DIR, filename);

    if (!fs.existsSync(filePath)) {
      sendJson(res, 404, { success: false, error: '备份文件不存在' });
      return true;
    }

    try {
      fs.unlinkSync(filePath);
      log('info', `已删除备份: ${filename}`);
      sendJson(res, 200, { success: true, message: '已删除' });
    } catch (err) {
      log('error', `删除备份失败: ${err.message}`);
      sendJson(res, 500, { success: false, error: '删除失败' });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
