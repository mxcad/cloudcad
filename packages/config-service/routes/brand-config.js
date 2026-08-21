const { log, parseBody, parseMultipart, sendJson } = require('../lib/utils');
const { authMiddleware } = require('../lib/session');
const brand = require('../brand');

async function handle(req, res, pathname, method) {
  // 此接口为公开品牌信息（title/logo，登录页品牌展示），刻意不鉴权：
  // 品牌数据不含敏感信息（仅 title/logo 字符串），且 /brand/* 静态文件与 /public 静态资源同样无需鉴权，
  // 登录页在用户登录前就需要渲染品牌信息。写操作（PUT /api/brand、POST /api/brand/logo）仍需 authMiddleware。
  if (pathname === '/api/brand' && method === 'GET') {
    const config = brand.getConfig();
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/brand' && method === 'PUT') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const errors = brand.validateConfig(body);

    if (errors.length > 0) {
      sendJson(res, 400, { success: false, error: errors.join(', ') });
      return true;
    }

    const config = brand.updateConfig(body);
    log('info', `品牌配置已更新: ${Object.keys(body).join(', ')}`);
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/brand/logo' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      sendJson(res, 400, {
        success: false,
        error: '需要 multipart/form-data 格式',
      });
      return true;
    }

    const { file, error } = await parseMultipart(req);

    if (error) {
      sendJson(res, 400, { success: false, error });
      return true;
    }

    if (!file || file.fieldname !== 'logo') {
      sendJson(res, 400, {
        success: false,
        error: '请上传名为 logo 的图片文件',
      });
      return true;
    }

    const result = brand.uploadLogo(file.buffer, file.contentType);

    if (!result.success) {
      sendJson(res, 400, result);
      return true;
    }

    log('info', `Logo 已上传: ${file.filename}`);
    sendJson(res, 200, { success: true, message: 'Logo 上传成功' });
    return true;
  }

  return false;
}

module.exports = { handle };
