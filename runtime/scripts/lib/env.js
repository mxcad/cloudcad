/**
 * @fileoverview 环境变量解析工具（纯函数层）
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - parseEnvFileSimple：cli.js:84-104（getPorts 用，简单版）
 * - parseEnvFile：cli.js:2844-2868（完整版）
 * - updateEnvFile：cli.js:2882-2884（委托 config-updater）
 *
 * 依赖方向铁律：lib 只允许 require 其他 lib 或独立模块，禁止 require commands。
 * 本模块为纯函数，不依赖 lib/context（所有路径由调用方传入）。
 */

const fs = require('fs');

// 委托 config-updater（独立模块，无循环依赖）
const { updateEnvFile: updateEnvFileEnhanced } = require('../config-updater');

/**
 * 解析 .env 文件（简单版，供 getPorts 使用）
 * @param {string} filePath
 * @returns {Object} 键值对
 */
function parseEnvFileSimple(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};
  content.split('\n').forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eqIndex = line.indexOf('=');
    if (eqIndex > 0) {
      const key = line.substring(0, eqIndex).trim();
      let value = line.substring(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  });
  return result;
}

/**
 * 解析 .env 文件（完整版）
 * @param {string} filePath .env 文件路径
 * @returns {Object} 键值对
 */
function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};

  content.split('\n').forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;

    const eqIndex = line.indexOf('=');
    if (eqIndex > 0) {
      const key = line.substring(0, eqIndex).trim();
      let value = line.substring(eqIndex + 1).trim();
      // 移除引号
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  });

  return result;
}

/**
 * 写入 .env 文件（增强版）
 *
 * 委托给 config-updater.js，支持：
 * - 更新已有 KEY 的值
 * - 新增 KEY（原版忽略新增）
 * - 可选传入 examplePath 同步注释和结构
 *
 * @param {string} filePath .env 文件路径
 * @param {Object} updates 要更新的键值对
 * @param {string} [examplePath] .env.example 路径
 */
function updateEnvFile(filePath, updates, examplePath) {
  updateEnvFileEnhanced(filePath, updates, examplePath);
}

module.exports = {
  parseEnvFileSimple,
  parseEnvFile,
  updateEnvFile,
};
