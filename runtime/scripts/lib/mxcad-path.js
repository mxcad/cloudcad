/**
 * @fileoverview mxcad 二进制路径解析 —— 跨平台误配置回退（单一事实源）
 *
 * 与后端 packages/backend/src/config/configuration.ts 的 resolveMxExecutablePath 同语义：
 * Linux 上 MXCAD_ASSEMBLY_PATH 配成 Windows .exe 路径时回退平台默认路径。
 *
 * 为什么部署侧也需要这份回退：后端自己会回退（.env.example 明写"跨平台复制 .env 时无需删除
 * 此配置"，linux-init.service.ts 亦仅做防御性告警不阻塞启动），但独立 conversion-service 直接
 * 读 process.env.MXCAD_ASSEMBLY_PATH、无守卫。start.js / verify-deploy.js 拉起转换服务时若原样
 * 注入，会让它去 spawn 部署包里不存在的 runtime/windows/mxcad/mxcadassembly.exe（ubuntu22
 * 部署包内无 runtime/windows/）→ 每次转换 ENOENT。
 *
 * 依赖方向：lib 只允许 require 其他 lib 或独立模块；本模块仅依赖 node 内置。
 */

const os = require('os');
const path = require('path');

const IS_LINUX = os.platform() === 'linux';

const LINUX_DEFAULT = 'runtime/linux/mxcad/mxcadassembly';
const WINDOWS_DEFAULT = 'runtime/windows/mxcad/mxcadassembly.exe';

/**
 * 解析应使用的 mxcad 二进制路径。
 *
 * @param {Object} [envConfig] parseEnvFile 读出的后端 .env 键值对
 * @param {boolean} [isLinux] 目标平台；默认取当前进程平台（可注入以便跨平台单测）
 * @returns {string} 原配置路径（相对或绝对），或回退后的平台默认相对路径
 */
function resolveMxcadAssemblyPath(envConfig, isLinux = IS_LINUX) {
  const raw =
    envConfig && envConfig.MXCAD_ASSEMBLY_PATH
      ? String(envConfig.MXCAD_ASSEMBLY_PATH)
      : '';
  const platformDefault = isLinux ? LINUX_DEFAULT : WINDOWS_DEFAULT;

  if (!raw) return platformDefault;
  // Linux 上以 .exe 结尾的一定是 Windows 路径（跨平台复制 .env 带进来的），回退平台默认
  if (isLinux && path.extname(raw).toLowerCase() === '.exe')
    return platformDefault;
  return raw;
}

module.exports = {
  resolveMxcadAssemblyPath,
  LINUX_DEFAULT,
  WINDOWS_DEFAULT,
};
