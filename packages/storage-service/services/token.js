const { verifyToken } = require('../lib/utils');
const { log } = require('../lib/utils');

/**
 * 上传令牌验证
 * 验证 JWT token，提取文件路径和权限
 */
class TokenValidator {
  /**
   * 验证上传令牌
   * @returns {object|null} { path, operation, exp } 或 null
   */
  validate(token) {
    const payload = verifyToken(token);
    if (!payload) {
      log('[Token] 令牌验证失败');
      return null;
    }
    if (payload.operation !== 'upload' && payload.operation !== 'file:write') {
      log(`[Token] 非法操作: ${payload.operation}`);
      return null;
    }
    return {
      path: payload.path,
      operation: payload.operation,
      exp: payload.exp,
    };
  }

  /**
   * 中间件：从 Authorization header 提取并验证 token
   */
  middleware(req, res) {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      return null;
    }
    const token = auth.slice(7);
    const result = this.validate(token);
    if (!result) {
      return null;
    }
    return result;
  }
}

module.exports = TokenValidator;
