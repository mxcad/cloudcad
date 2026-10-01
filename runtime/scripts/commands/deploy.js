/**
 * @fileoverview 部署模式命令
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js:deployMode（cli.js:1911-2068）。
 * 依赖方向：commands → lib + commands/infra、commands/migrate、commands/start、commands/dev。
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const { PROJECT_ROOT, PORTS } = require('../lib/context');
const { colors, log, clearScreen, printHeader } = require('../lib/logger');
const { runPnpm } = require('../lib/proc');
const { promptChoice } = require('../lib/prompt');
const { waitForPort } = require('../lib/health');
const versionHelper = require('../drawing-version-helper');
const { startInfrastructure, setupPm2Startup } = require('./infra');
const { stopAppServices } = require('./stop');
const { runDatabaseMigration, runPiiBackfill } = require('./migrate');
const { startAppServices, assertNoForeignAppConflict } = require('./start');
const { rimdir } = require('./dev');
const { runWithDeployLog } = require('../lib/deploy-log');

async function deployModeImpl(skipBuild = false, options = null) {
  clearScreen();
  printHeader();
  log('bright', '>>> 部署模式');
  console.log('');

  // 0. 确定启动模式。options 非空 = 非交互调用（运维中心 ADR-0071）：
  //    不打印菜单、不询问，mode 固定由 options.mode 决定（缺省 pm2）。
  let usePm2;
  if (options) {
    usePm2 = options.mode !== 'foreground';
    log('cyan', `启动模式: ${usePm2 ? 'PM2 后台运行' : '前台运行'}（非交互）`);
    console.log('');
  } else {
    console.log(`${colors.cyan}请选择启动模式：${colors.reset}`);
    console.log('');
    console.log(
      `  ${colors.cyan}[1]${colors.reset} PM2 后台运行（生产模式，推荐）`
    );
    console.log(
      `  ${colors.cyan}[2]${colors.reset} 前台运行（终端关闭则服务退出）`
    );
    console.log('');

    // 只接受 1/2（空输入=默认 1）；3 等任意输入不再被静默当成默认项
    const modeChoice = await promptChoice(
      `${colors.bright}请输入选项 [1]: ${colors.reset}`,
      ['1', '2'],
      '1'
    );

    usePm2 = modeChoice !== '2';

    console.log('');
  }

  // 0. 只停止应用层（后端/前端），保留基础服务。
  //    避免切换前后台/重复启动时，PM2 旧后端占用 3001 端口导致前台启动 EADDRINUSE。
  //    基础服务（PG/Redis）由下方 startInfrastructure 幂等复用，不重启。
  await stopAppServices();

  // 前置归属审计门禁：必须早于 startInfrastructure 的任何破坏性动作（见 start.js 注释）。
  // 部署路径直接调 startInfrastructure + startAppServices、不经 startAppServicesWithInfra，
  // 故此处必须独立把关——否则打包部署（用户的主要升级路径）会成为跨目录混用的绕过口：
  // 基础服务被换成新包（新 .env 密钥），backend/frontend 沿用旧包定义，本目录后端用旧
  // REDIS_PASSWORD 连新 redis → AUTH 恒失败（ERR invalid password）。
  if (!(await assertNoForeignAppConflict())) return false;

  // 1. 启动基础服务（幂等：已在运行则复用，不重启）
  //    基础服务（PG/Redis 等）是有状态的数据服务，切换前后台/重复启动时
  //    若已在运行则应复用，避免每次全量停止重建造成数据中断。
  if (!(await startInfrastructure(usePm2))) {
    return false;
  }

  // 等待基础服务就绪
  log('cyan', '等待服务就绪...');
  try {
    await waitForPort(PORTS.postgresql, 'PostgreSQL', 30000);
    await waitForPort(PORTS.redis, 'Redis', 30000);
  } catch (err) {
    log('red', `[错误] ${err.message}`);
    return false;
  }

  // 2. 图纸版本部署前检查
  log('blue', '[2/6] 图纸版本检查...');
  const healthResult = await versionHelper.runHealthCheck({ silent: false });
  if (healthResult.failures > 0) {
    log('red', '[错误] 图纸版本检查未通过，请修复后重新部署');
    return false;
  }
  if (healthResult.warnings > 0) {
    log('yellow', '[警告] 图纸版本检查存在警告，继续部署...');
  } else {
    log('green', '[✓] 图纸版本检查通过');
  }

  // 3. 数据库迁移（依赖已在 setupOffline 中安装）
  if (!(await runDatabaseMigration())) {
    return false;
  }

  // 3.5 PII 字段级加密存量回填（#417 等保 8.1.4.8）：migration 应用后、读切换代码
  //     启动前，用当前 .env 密钥回填 users 表 phone/email 派生列（enc/hmac）。
  //     幂等：已回填则秒跳过（升级部署无额外开销）。失败则中止部署——读切换代码
  //     查 HMAC 列，若存量行 HMAC 列缺失，存量用户登录/查重会落空。
  if (!(await runPiiBackfill())) {
    return false;
  }

  // 3. 检测是否已有构建产物
  const backendDist = path.join(PROJECT_ROOT, 'packages', 'backend', 'dist');
  const frontendDist = path.join(PROJECT_ROOT, 'packages', 'frontend', 'dist');
  const mobileDist = path.join(PROJECT_ROOT, 'packages', 'frontend_mobile', 'dist');

  const hasBackendDist =
    fs.existsSync(backendDist) && fs.readdirSync(backendDist).length > 0;
  const hasFrontendDist =
    fs.existsSync(frontendDist) && fs.readdirSync(frontendDist).length > 0;
  const hasMobileDist =
    fs.existsSync(mobileDist) && fs.readdirSync(mobileDist).length > 0;
  const hasDist = hasBackendDist && hasFrontendDist && hasMobileDist;

  let shouldBuild = true;

  if (skipBuild) {
    if (!hasBackendDist) {
      log('red', '[错误] 指定了 --skip-build 但构建产物不存在');
      return false;
    }
      log('green', '[4/6] 跳过构建，使用现有 dist');
    shouldBuild = false;
  } else if (hasDist) {
    log('yellow', '[4/6] 检测到已有构建产物');
    console.log('');
    log('cyan', '  后端 dist: ' + (hasBackendDist ? '✓ 存在' : '✗ 不存在'));
    log('cyan', '  前端 dist: ' + (hasFrontendDist ? '✓ 存在' : '✗ 不存在'));
    log('cyan', '  移动端 dist: ' + (hasMobileDist ? '✓ 存在' : '✗ 不存在'));
    console.log('');

    if (options) {
      // 非交互（运维中心）：是否重建由 options.rebuild 决定，缺省不重建
      shouldBuild = options.rebuild === true;
      log(
        'cyan',
        `非交互模式：${shouldBuild ? '重新构建' : '使用现有构建产物'}`
      );
    } else {
      // 询问用户是否重新构建
      const rl2 = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise((resolve) => {
        rl2.question(
          `${colors.yellow}是否重新构建？(y/N): ${colors.reset}`,
          (ans) => {
            rl2.close();
            resolve(ans.trim().toLowerCase());
          }
        );
      });

      shouldBuild = answer === 'y' || answer === 'yes';
    }

    if (!shouldBuild) {
      log('green', '[✓] 跳过构建，使用现有 dist');
    }
  }

  // 4. 构建前后端（如果需要）
  if (shouldBuild) {
    log('blue', '[5/6] 清理旧构建文件...');
    rimdir(backendDist);
    rimdir(frontendDist);
    rimdir(mobileDist);
    log('green', '[✓] 清理完成');

    log('blue', '[5/6] 构建项目...');

    if (!runPnpm(['build'])) {
      log('red', '[错误] 构建失败');
      return false;
    }

    log('green', '[✓] 构建完成');
  }

  // 7. 图纸版本部署后验证 + 记录变更
  // P2.4 时序修正：前台模式下该回调在"服务就绪后、阻塞等待退出前"执行，
  // 确保验证的是仍在运行的系统；PM2 模式下由下面显式调用。
  let lastVerifyResult = null;
  const doTailVerification = async () => {
    log('blue', '[6/6] 图纸版本验证...');
    const verifyResult = await versionHelper.runVerification({ silent: false });
    lastVerifyResult = verifyResult;
    if (verifyResult.failures > 0) {
      log('red', '[错误] 图纸版本验证未通过，请检查版本仓库状态');
    } else {
      log('green', '[✓] 图纸版本验证通过');
    }

    // 记录变更
    try {
      const changedFiles = [];
      const configUpdated = [];
      versionHelper.writeChangelog(
        changedFiles,
        configUpdated,
        healthResult,
        verifyResult
      );
    } catch (err) {
      log('yellow', `[警告] 写入变更记录失败: ${err.message}`);
    }
  };

  // 6. 启动服务（使用统一的函数）
  // 前台模式：onReady 在阻塞等待前执行；PM2 模式：startAppServices 返回后显式执行
  await startAppServices(usePm2 ? 'pm2' : 'foreground', doTailVerification);
  if (usePm2) {
    await doTailVerification();

    // 7. 生产环境（PM2 后台运行）默认配置开机自启（系统重启后自动恢复服务）。
    //    不询问用户；前台运行（usePm2=false）不配置。
    //    配置失败完全静默，不报错、不中断部署（由 setupPm2Startup 内部吞掉）。
    await setupPm2Startup();
  }
  return true;
}

// 部署 / 升级全程控制台输出镜像落盘到 data/logs/deploy/（日志中心可打包，
// 部署现场可事后追溯）。包装函数与实现分离，实现保持原样不被重排。
// options（ADR-0071 运维中心非交互调用）：{ mode: 'pm2'|'foreground', rebuild: boolean }，
// 缺省 null 保持原交互行为。返回 true/false 表示部署成败（交互调用方无需关心）。
async function deployMode(skipBuild = false, options = null) {
  return runWithDeployLog('deploy', () => deployModeImpl(skipBuild, options));
}

module.exports = {
  deployMode,
};
