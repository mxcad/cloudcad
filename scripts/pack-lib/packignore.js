/**
 * @fileoverview 打包排除规则（极简版）
 *
 * 读取 scripts/pack-lib/packignore.json，为 pack-offline.js 的 copyDir
 * 提供过滤能力，避免把不应打包的内容（尤其是 mxcad/files 内的 .mxweb
 * 保密图纸）打进部署包/升级包。
 *
 * 配置结构（相对仓库根、用 / 分隔）：
 *   exclude.dirs  : 整个目录（含其下所有内容）不打包，目录本身也不创建
 *   exclude.files : 单个文件不打包
 *   keepEmpty.dirs: 目录本身创建但内容不打包（保留空目录，供运行时依赖路径）
 *   keepEmpty.files: 命中文件不打包（目录仍会创建）
 *
 * 匹配规则：配置项为目录时，该目录及其所有子路径均命中（前缀匹配）。
 */
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'packignore.json');

let _config = null;
function getConfig() {
  if (!_config) {
    if (!fs.existsSync(CONFIG_FILE)) {
      _config = { exclude: { dirs: [], files: [] }, keepEmpty: { dirs: [], files: [] } };
    } else {
      _config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  }
  return _config;
}

/** 统一为相对仓库根的 POSIX 路径（去首尾斜杠） */
function normalize(relPath) {
  return relPath
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+|\/+$/g, '');
}

/** 判断 rel 是否命中某个目录前缀列表 */
function hitDirPrefix(prefixes, rel) {
  return prefixes.some((p) => {
    const dir = normalize(p);
    if (!dir) return false;
    return rel === dir || rel.startsWith(dir + '/');
  });
}

/**
 * 是否完全排除（不复制、不创建）
 * @param {string} relPath 相对 PROJECT_ROOT 的路径
 */
function isExcluded(relPath) {
  const rel = normalize(relPath);
  if (!rel) return false;
  const c = getConfig();
  if (c.exclude.files.includes(rel)) return true;
  return hitDirPrefix(c.exclude.dirs, rel);
}

/**
 * 是否命中"保留空目录"（目录创建，内容不复制；文件则跳过）
 * @param {string} relPath 相对 PROJECT_ROOT 的目录路径
 */
function isKeepEmptyDir(relPath) {
  const rel = normalize(relPath);
  if (!rel) return false;
  const c = getConfig();
  return hitDirPrefix(c.keepEmpty.dirs, rel);
}

/**
 * 单个文件是否命中 keepEmpty.files（目录仍创建，文件跳过）
 * @param {string} relPath 相对 PROJECT_ROOT 的文件路径
 */
function isKeepEmptyFile(relPath) {
  const rel = normalize(relPath);
  if (!rel) return false;
  return getConfig().keepEmpty.files.includes(rel);
}

module.exports = { isExcluded, isKeepEmptyDir, isKeepEmptyFile };
