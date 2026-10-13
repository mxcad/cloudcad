/**
 * @fileoverview 移动端访问路径名（mobileAccessPath）的唯一解析出口
 *
 * 值来自 myServerConfig.json 的 mobileAccessPath 字段，缺失 / 不可读时回落
 * mxcad_mobile。此前该解析有 3 份内联副本，候选清单各不相同：
 * - lib/context.js 2 个候选
 * - serve-static.js 3 个候选
 * - scripts/pack-lib/pack-assertions.js 1 个候选
 * 后果是同一台机器上「运维入口提示的移动端路径」与「静态服务实际服务的路径」
 * 可以不一致（serve-static 认 dist 内的配置，context 不认）。
 *
 * 两处探测顺序是**有意**不同，勿合并成一份清单：
 * - RUNTIME：部署后运行时配置优先（config-service 会把客户改过的值写进
 *   data/configs/...），仓库模板与 dist 仅作回落；
 * - PACKAGE：打包期只认仓库内模板配置（public/ini）。不得读 data/configs/ ——
 *   那是打包机自己的本地配置，读它会打出错误子目录名的部署包。
 *
 * 依赖方向：只依赖 Node 内置模块（fs/path），被 runtime/scripts/* 与
 * scripts/pack-lib/* 共用。纯读取，无写入、无缓存。
 */

const fs = require('fs');
const path = require('path');

/** myServerConfig.json 缺失 mobileAccessPath 时的默认子目录名 */
const DEFAULT_MOBILE_ACCESS_PATH = 'mxcad_mobile';

/** 运行时（部署后）候选：客户改过的运行时配置优先，模板 / dist 仅回落 */
const RUNTIME_MOBILE_ACCESS_PATH_CANDIDATES = [
  ['data', 'configs', 'frontend', 'ini', 'myServerConfig.json'],
  ['packages', 'frontend', 'public', 'ini', 'myServerConfig.json'],
  ['packages', 'frontend', 'dist', 'ini', 'myServerConfig.json'],
];

/** 打包期候选：只认仓库内模板配置 */
const PACKAGE_MOBILE_ACCESS_PATH_CANDIDATES = [
  ['packages', 'frontend', 'public', 'ini', 'myServerConfig.json'],
];

/**
 * 读单个配置文件的 mobileAccessPath。
 * 文件缺失、JSON 损坏、字段非字符串或非真值均返回 null（由调用方继续探测下一个候选）。
 *
 * @param {string} configPath 配置文件绝对路径
 * @returns {string|null}
 */
function readMobileAccessPath(configPath) {
  if (!fs.existsSync(configPath)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.mobileAccessPath && typeof config.mobileAccessPath === 'string') {
      return config.mobileAccessPath;
    }
  } catch {
    // 解析失败用下一个候选，最终回落到默认值
  }
  return null;
}

/**
 * 按优先级探测候选配置，返回首个可读到的 mobileAccessPath。
 *
 * @param {string} root 项目根绝对路径（候选为相对 root 的分段路径）
 * @param {string[][]} candidates 候选清单，按优先级排列
 * @returns {string} 移动端子目录名（无候选命中时为 DEFAULT_MOBILE_ACCESS_PATH）
 */
function resolveMobileAccessPath(root, candidates) {
  for (const segments of candidates) {
    const found = readMobileAccessPath(path.join(root, ...segments));
    if (found) return found;
  }
  return DEFAULT_MOBILE_ACCESS_PATH;
}

/** 运行时解析：部署后读取（客户改过的值优先） */
function getMobileAccessPathForRuntime(root) {
  return resolveMobileAccessPath(root, RUNTIME_MOBILE_ACCESS_PATH_CANDIDATES);
}

/** 打包期解析：只读仓库内模板配置 */
function getMobileAccessPathForPackage(root) {
  return resolveMobileAccessPath(root, PACKAGE_MOBILE_ACCESS_PATH_CANDIDATES);
}

module.exports = {
  DEFAULT_MOBILE_ACCESS_PATH,
  RUNTIME_MOBILE_ACCESS_PATH_CANDIDATES,
  PACKAGE_MOBILE_ACCESS_PATH_CANDIDATES,
  readMobileAccessPath,
  resolveMobileAccessPath,
  getMobileAccessPathForRuntime,
  getMobileAccessPathForPackage,
};
