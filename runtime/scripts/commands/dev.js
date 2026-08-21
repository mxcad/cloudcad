/**
 * @fileoverview 开发模式命令
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - devMode：cli.js:1832-1883
 * - rimdir：cli.js:1886-1898
 *
 * 依赖方向：commands → lib + commands/infra、commands/migrate。
 */

const fs = require('fs');
const path = require('path');

const { PORTS } = require('../lib/context');
const { PRODUCT_NAME } = require('../lib/branding');
const { colors, log, clearScreen, printHeader } = require('../lib/logger');
const { runInNewWindow } = require('../lib/proc');
const { getAdminLoginPath } = require('../lib/admin-login');
const { waitForPort, waitAndOpenBrowsers } = require('../lib/health');
const { startInfrastructure } = require('./infra');
const { stopAppServices } = require('./stop');
const { runDatabaseMigration } = require('./migrate');

async function devMode() {
  clearScreen();
  printHeader();
  log('bright', '>>> 开发模式');
  console.log('');

  // 0. 只停止应用层（后端/前端），保留基础服务；避免切换模式时旧后端占用端口
  await stopAppServices();

  // 1. 启动基础服务（前台模式，幂等：已在运行则复用）
  if (!(await startInfrastructure(false))) {
    return;
  }

  // 等待基础服务就绪
  log('cyan', '等待服务就绪...');
  try {
    await waitForPort(PORTS.postgresql, 'PostgreSQL', 30000);
    await waitForPort(PORTS.redis, 'Redis', 30000);
  } catch (err) {
    log('red', `[错误] ${err.message}`);
    return;
  }

  // 2. 数据库迁移
  if (!(await runDatabaseMigration())) {
    return;
  }

  // 3. 启动开发服务器（新窗口）
  log('blue', '[3/3] 启动开发服务器...');

  runInNewWindow(`${PRODUCT_NAME} Backend`, 'pnpm', ['--filter', 'backend', 'dev']);
  runInNewWindow(`${PRODUCT_NAME} Frontend`, 'pnpm', ['--filter', 'frontend', 'dev']);
  runInNewWindow(`${PRODUCT_NAME} Mobile`, 'pnpm', ['--filter', 'frontend_mobile', 'dev']);

  console.log('');
  log('green', '╔══════════════════════════════════════════════════════════╗');
  log('green', '║        开发环境已就绪                                     ║');
  log('green', '╠══════════════════════════════════════════════════════════╣');
  log('green', '║  后端:  http://localhost:' + PORTS.backend + '           ║');
  log('green', '║  前端:  http://localhost:' + PORTS.frontend + '           ║');
  log('green', '║  移动端: http://localhost:' + PORTS.frontend + '/mxcad_mobile/  ║');
  log('green', '║  API:   http://localhost:' + PORTS.backend + '/api       ║');
  log('green', '║  API文档: http://localhost:' + PORTS.backend + '/api/docs ║');
  log('green', '║  管理员: http://localhost:' + PORTS.frontend + getAdminLoginPath() + '  ║');
  log(
    'green',
    '║  配置:  http://localhost:' + PORTS.configService + '           ║'
  );
  log('green', '╠══════════════════════════════════════════════════════════╣');
  log('green', '║  停止:  选择菜单 [停止服务]                               ║');
  log('green', '╚══════════════════════════════════════════════════════════╝');

  await waitAndOpenBrowsers();
}

// 递归删除目录
function rimdir(dir) {
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach((file) => {
      const curPath = path.join(dir, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        rimdir(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dir);
  }
}

module.exports = {
  devMode,
  rimdir,
};
