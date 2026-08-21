/**
 * @fileoverview 管理员登录入口路径 —— 单一事实源
 *
 * 管理员登录入口（VITE_ADMIN_LOGIN_PATH）在**打包时确定**（Vite 构建时编译进前端
 * bundle），部署时需展示给用户作为管理员登录地址。该值随部署包携带到目标机。
 *
 * 读取优先级：
 *   1. 部署包元信息 runtime/scripts/config/deploy-meta.json
 *      （打包时由 pack-offline.js 的 writeDeployMeta 写入，离线部署目标机无源码 .env）
 *   2. 源码环境 packages/frontend/.env.local / .env（本机/开发部署兜底）
 *   3. 默认 /admin-login
 *
 * 依赖方向：lib → lib，禁止 require commands。
 */

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('./context');
const { parseEnvFile } = require('./env');

/**
 * 读取管理员登录入口路径（VITE_ADMIN_LOGIN_PATH）
 * @returns {string} 管理员登录路径（以 / 开头）
 */
function getAdminLoginPath() {
  // 1. 部署包元信息（离线部署场景：目标机无源码 .env，靠它读取打包时确定的值）
  const deployMetaPath = path.join(
    PROJECT_ROOT,
    'runtime',
    'scripts',
    'config',
    'deploy-meta.json'
  );
  if (fs.existsSync(deployMetaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(deployMetaPath, 'utf-8'));
      const value = meta.adminLoginPath;
      if (typeof value === 'string' && value.startsWith('/')) {
        return value.length > 1 ? value.replace(/\/+$/, '') : '/';
      }
    } catch {
      // 解析失败则继续走源码环境兜底
    }
  }

  // 2. 源码环境兜底（Vite 优先级：.env.local > .env）
  let value = '';
  for (const envFile of [
    path.join(PROJECT_ROOT, 'packages', 'frontend', '.env.local'),
    path.join(PROJECT_ROOT, 'packages', 'frontend', '.env'),
  ]) {
    if (!fs.existsSync(envFile)) continue;
    const config = parseEnvFile(envFile);
    if (config.VITE_ADMIN_LOGIN_PATH) {
      value = config.VITE_ADMIN_LOGIN_PATH;
      break;
    }
  }
  if (!value || !value.startsWith('/')) return '/admin-login';
  return value.length > 1 ? value.replace(/\/+$/, '') : '/';
}

module.exports = { getAdminLoginPath };
