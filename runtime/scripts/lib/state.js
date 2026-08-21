/**
 * @fileoverview 运行时可变共享状态
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js 的模块级可变状态：
 * - isFirstDeploy：cli.js:41（bootstrap 设置，showCurrentPasswords/autoSetupAndShowPasswords 读取）
 * - childProcesses：cli.js:2375（前台进程表）
 *
 * 说明：A-1 阶段为保持"机械拆分、零行为变更"，将 cli.js 的模块级可变变量
 * 原样迁至此处共享。A-2 收口时：
 * - childProcesses 应仅由 foreground/supervisor.js 内部持有（§4.2）
 * - isFirstDeploy 应改为显式参数传递（§4.2）
 */

// 标记是否为首次部署（.env 刚创建）
let isFirstDeploy = false;

// 前台模式子进程表（含基础服务与应用服务，cleanupForeground 全清）
const childProcesses = new Set();

// 仅记录"应用层"（后端/前端）前台进程，供 stopAppServices 在切换模式时单独停止，
// 基础服务（PG/Redis/协同/配置中心）不在此集合，切换时保持复用。
const appProcesses = new Set();

module.exports = {
  isFirstDeploy,
  childProcesses,
  appProcesses,
};
