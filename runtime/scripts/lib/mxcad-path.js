/**
 * @fileoverview mxcad 二进制路径解析 —— 跨平台误配置回退（部署/运维脚本侧的事实源）
 *
 * 与 @cloudcad/engine-exec 的 resolveMxExecutablePath（backend 与 conversion-service 共用）
 * 同语义：Linux 上 MXCAD_ASSEMBLY_PATH 配成 Windows .exe 路径时回退平台默认路径。
 *
 * 为什么本文件保留独立一份：它供 runtime/scripts 的运维脚本使用，而脚本进程族不能
 * 依赖 TS 包的 dist（干净 clone 未构建时 require 直接失败）。语义由两边测试交叉锁定：
 * 本目录 mxcad-path.test.js 与 packages/engine-exec/test/mx-path.test.ts。
 *
 * 历史背景（已修）：conversion-service 曾直接读 process.env.MXCAD_ASSEMBLY_PATH、无守卫，
 * start.js / verify-deploy.js 拉起它时若原样注入 Windows 路径，会去 spawn 部署包里不存在的
 * runtime/windows/mxcad/mxcadassembly.exe（ubuntu22 部署包内无 runtime/windows/）→ 每次
 * 转换 ENOENT、被归类为可重试的 not-started。现它已改走 engine-exec 的共享出口，
 * 本文件只剩运维脚本消费。
 *
 * 依赖方向：lib 只允许 require 其他 lib 或独立模块；本模块仅依赖 node 内置。
 */

const path = require('path');

const { IS_LINUX } = require('./context');

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
