/**
 * @fileoverview 启动服务命令（start / startAppServices / 前台模式）
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - waitForServicesForeground / startAppServices / startOnly
 *   testConnection / startMode / startAppServicesWithInfra
 *
 * 依赖方向：commands → lib + 其他 commands。前台分支 childProcesses 经 lib/state 共享。
 * 命令间 require（A-1 机械拆分临时耦合，A-2 收口）。
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const {
  IS_LINUX,
  USE_RUNTIME,
  PROJECT_ROOT,
  RUNTIME_DIR,
  DATA_DIR,
  PORTS,
  NODE_EXE,
  PM2_JS,
  getMobileAccessPath,
} = require('../lib/context');
const { colors, log, clearScreen, printHeader } = require('../lib/logger');
const {
  runPm2,
  getPm2AppStatus,
  getPidByPort,
  isNodePid,
  isOurRuntimeProcess,
  killTree,
} = require('../lib/proc');
const {
  waitForPort,
  waitAndOpenBrowsers,
  openBrowser,
  isPortOpen,
  waitPortReleased,
} = require('../lib/health');
const { parseEnvFile } = require('../lib/env');
const { promptConfirm } = require('../lib/prompt');
const state = require('../lib/state');
const { startInfrastructure } = require('./infra');
const { stopAppServices } = require('./stop');
const { runSetupWizard, showCurrentPasswords } = require('./setup-wizard');
const { setupSignalHandlers } = require('../foreground/registry');

/**
 * 前台模式：等待服务就绪，后端进程退出时即时显示错误
 *
 * P2.7 修复：同时捕获后端 stdout + stderr，启动失败时显示两者尾部（stdout 不再丢失）。
 */
async function waitForServicesForeground(backendProcess, backendOutput) {
  log('cyan', '等待所有服务就绪...');

  // 同时检查后端 health 和进程状态
  const http = require('http');

  // 前端服务只检测端口
  const checkServices = async () => {
    const backendReady = await new Promise((resolve) => {
      // 指数退避：避免后端未就绪时高频探测（每次 /api/health/live 都会触发数据库健康检查）
      let attempt = 0;
      const backoffDelay = () => Math.min(1000 * 2 ** attempt++, 10000);
      // 总超时上限：防止后端进程存活但 health 一直 error/timeout 时无限循环重试
      // （每次重试都会触发一次数据库健康检查，无限循环会持续压垮 DB，导致 PG 反复重启）
      const BACKEND_WAIT_TIMEOUT_MS = 180000; // 3 分钟
      const startTime = Date.now();

      const tryCheck = () => {
        // 进程已退出 → 不用再等了
        if (backendProcess.exitCode !== null || backendProcess.killed) {
          resolve(false);
          return;
        }
        // 超过总等待上限 → 停止循环，避免无限重试
        if (Date.now() - startTime >= BACKEND_WAIT_TIMEOUT_MS) {
          resolve(false);
          return;
        }

        const req = http.request(
          { hostname: 'localhost', port: PORTS.backend, path: '/api/health/live', method: 'GET', timeout: 3000 },
          (res) => resolve(res.statusCode === 200)
        );
        req.on('error', () => setTimeout(tryCheck, backoffDelay()));
        req.on('timeout', () => { req.destroy(); setTimeout(tryCheck, backoffDelay()); });
        req.end();
      };
      tryCheck();
    });

    if (!backendReady) {
      // 区分"进程已退出"与"健康检查未通过但进程仍存活"两种场景（诊断更准确）
      const exited = backendProcess.exitCode !== null || backendProcess.killed;
      const outputText = backendOutput.join('').trim();
      if (exited) {
        log('red', `\n[错误] 后端服务进程已退出（退出码: ${backendProcess.exitCode}）`);
        if (outputText) {
          const lastLines = outputText.split('\n').slice(-30).join('\n');
          log('red', `最后 ${30} 行日志:\n${lastLines}`);
        }
      } else {
        log('red', '\n[错误] 后端服务健康检查未通过（进程仍在运行）');
        if (outputText) {
          const lastLines = outputText.split('\n').slice(-30).join('\n');
          log('red', `最后 ${30} 行日志:\n${lastLines}`);
        }
      }
      return false;
    }

    log('green', `  ✓ 后端服务已就绪 (端口 ${PORTS.backend})`);

    // 等待配置中心和前端端口（较短超时）
    try {
      await waitForPort(PORTS.configService, '配置中心', 15000);
    } catch {
      log('yellow', '  ⚠ 配置中心未就绪');
    }
    try {
      await waitForPort(PORTS.frontend, '前端页面', 15000);
    } catch {
      log('yellow', '  ⚠ 前端页面未就绪');
    }
    return true;
  };

  const ok = await checkServices();
  if (!ok) {
    log('red', '后端服务启动失败，请检查上方日志');
    return false;
  }

  console.log('');
  log('green', '╔══════════════════════════════════════════════════════════╗');
  log('green', `║        所有服务已就绪                                     ║`);
  log('green', '╠══════════════════════════════════════════════════════════╣');
  log('green', '║  后端:  http://localhost:' + PORTS.backend + '           ║');
  log('green', '║  前端:  http://localhost:' + PORTS.frontend + '           ║');
  const map = getMobileAccessPath();
  log('green', '║  移动端: http://localhost:' + PORTS.frontend + '/' + map + '/  ║');
  log('green', '║  API:   http://localhost:' + PORTS.backend + '/api       ║');
  log('green', '║  API文档: http://localhost:' + PORTS.backend + '/api/docs ║');
  log('green', '╠══════════════════════════════════════════════════════════╣');
  log('green', '║  停止:  Ctrl+C                                          ║');
  log('green', '╚══════════════════════════════════════════════════════════╝');

  // 打开浏览器
  openBrowser(`http://localhost:${PORTS.frontend}`);
  return true;
}

/**
 * 判断 PM2 应用服务是否应走 restart（而非 start）。
 * 多次 start 后台模式的修复：只要 backend/frontend 任一已注册（非 unknown，含 stopped/errored），
 * 就 restart 而非 start，避免 `pm2 start` 对已注册 app 报 already launched / 启动重复实例。
 * @param {string} backendStatus getPm2AppStatus('backend') 返回值
 * @param {string} frontendStatus getPm2AppStatus('frontend') 返回值
 * @returns {boolean} true=应 restart；false=未注册需 start
 */
function shouldRestartAppServices(backendStatus, frontendStatus) {
  return backendStatus !== 'unknown' || frontendStatus !== 'unknown';
}

/**
 * 后端构建产物入口（单一事实源）。
 * 已验证 nest build（outDir=dist，rootDir=null）实际输出为 packages/backend/dist/main.js
 * （main.ts 在 src/ 下，编译到 dist 根），而非 dist/src/main.js。
 */
function getBackendDist() {
  return path.join(PROJECT_ROOT, 'packages', 'backend', 'dist', 'main.js');
}

/**
 * 统一的应用服务启动函数
 * @param {'pm2' | 'foreground'} mode - 启动模式
 * @param {Function} [onReady] - 服务就绪后、阻塞等待前回调（P2.4 部署收尾时序修正）
 */
async function startAppServices(mode, onReady) {
  const backendDist = getBackendDist();
  const frontendScript = path.join(RUNTIME_DIR, 'scripts', 'serve-static.js');

  if (!fs.existsSync(backendDist)) {
    log('red', '[错误] 后端 dist 不存在');
    return;
  }
  if (!fs.existsSync(frontendScript)) {
    log('red', '[错误] 前端服务脚本不存在');
    return;
  }

  const modeLabel = mode === 'pm2' ? 'PM2 后台模式' : '前台模式';
  log('blue', `[5/5] 启动生产服务 (${modeLabel})...`);

  if (mode === 'pm2') {
    // PM2 后台模式
    // 用"是否已注册"（unknown = 未注册）而非"是否 online"判断 start/restart：
    // - 已注册（online/stopped/errored/launching）→ restart（pm2 start 已注册 app 会报 already launched）
    // - 都未注册（unknown）→ start
    // 这修复"多次 start 后台模式"时，stop 过的 backend/frontend 被重复 start 的问题。
    const backendStatus = getPm2AppStatus('backend');
    const frontendStatus = getPm2AppStatus('frontend');
    const anyRegistered = shouldRestartAppServices(backendStatus, frontendStatus);

    // 后端服务环境变量
    const backendEnv = {
      NODE_ENV: 'production',
      PORT: String(PORTS.backend),
      FRONTEND_URL: `http://localhost:${PORTS.frontend}`,
    };
    


    const backendConfig = {
      name: 'backend',
      script: backendDist,
      cwd: path.join(PROJECT_ROOT, 'packages', 'backend'),
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: backendEnv,
    };

    const frontendConfig = {
      name: 'frontend',
      script: frontendScript,
      cwd: PROJECT_ROOT,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        FRONTEND_PORT: String(PORTS.frontend),
        BACKEND_URL: `http://localhost:${PORTS.backend}`,
      },
    };

    const tempConfigPath = path.join(DATA_DIR, 'pm2-deploy.config.js');
    fs.writeFileSync(
      tempConfigPath,
      `module.exports = { apps: [${JSON.stringify(backendConfig)}, ${JSON.stringify(frontendConfig)}] };`
    );

    if (anyRegistered) {
      log('yellow', '检测到服务已注册（PM2），正在重启更新...');
      runPm2(['restart', tempConfigPath]);
    } else {
      runPm2(['start', tempConfigPath]);
    }
  } else {
    // 前台模式

    // Q2 应用层端口冲突处理：若 backend/frontend 端口已被占用（如另一前台实例/PM2 旧实例/外部进程），
    // 先判定占用者并提示，避免 EADDRINUSE 静默失败或重复 spawn 双实例。
    const backendPortTaken = await isPortOpen(PORTS.backend);
    const frontendPortTaken = await isPortOpen(PORTS.frontend);
    if (backendPortTaken || frontendPortTaken) {
      const takenDesc = [];
      if (backendPortTaken) takenDesc.push(`后端 ${PORTS.backend}`);
      if (frontendPortTaken) takenDesc.push(`前端 ${PORTS.frontend}`);

      log(
        'yellow',
        `[检测] 以下端口已被占用：${takenDesc.join('、')}`
      );

      // 收集每个被占端口的占用者 PID（可能不同进程分别占 backend/frontend）
      const takenPids = new Set();
      for (const port of [
        backendPortTaken ? PORTS.backend : null,
        frontendPortTaken ? PORTS.frontend : null,
      ]) {
        if (port) {
          const pid = getPidByPort(port);
          if (pid) takenPids.add(pid);
        }
      }

      // 判定占用者类型：全为 node/本部署包进程 → 可安全清理；含外部进程 → 不自动处理
      const cleanable = [...takenPids].filter(
        (pid) => isNodePid(pid) || isOurRuntimeProcess(pid)
      );
      const external = [...takenPids].filter(
        (pid) => !isNodePid(pid) && !isOurRuntimeProcess(pid)
      );

      if (external.length > 0) {
        log(
          'yellow',
          '  [提示] 部分端口被外部进程占用，CLI 不自动处理；若启动失败请检查端口占用。'
        );
      }

      if (cleanable.length > 0) {
        log(
          'yellow',
          `  （占用者 PID ${cleanable.join(', ')}，疑似残留的应用实例）`
        );
        const killOld = await promptConfirm(
          `是否停止占用这些端口的残留实例后重新启动？(y/N)`
        );
        if (killOld) {
          for (const pid of cleanable) {
            killTree(pid, { silent: false });
          }
          // 等端口释放
          for (const port of [
            backendPortTaken ? PORTS.backend : null,
            frontendPortTaken ? PORTS.frontend : null,
          ]) {
            if (port) await waitPortReleased(port, 15000);
          }
          log('green', '[✓] 已清理残留实例，端口已释放');
        } else {
          log('yellow', '[提示] 保留现有实例，跳过前台启动（避免双实例端口冲突）');
          return;
        }
      }
    }

    log('cyan', '启动后端服务...');

    // 构建后端环境变量
    const backendEnv = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORTS.backend),
      FRONTEND_URL: `http://localhost:${PORTS.frontend}`,
    };

    // 前台模式捕获后端 stdout+stderr（P2.7），健康检查失败时显示尾部
    const backendOutput = [];
    const backendProcess = spawn(NODE_EXE, [backendDist], {
      cwd: path.join(PROJECT_ROOT, 'packages', 'backend'),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
      detached: IS_LINUX,
      env: backendEnv,
    });
    backendProcess.stdout.on('data', (chunk) => {
      backendOutput.push(chunk.toString());
      process.stdout.write(chunk);
    });
    backendProcess.stderr.on('data', (chunk) => {
      backendOutput.push(chunk.toString());
      process.stderr.write(chunk);
    });
    state.childProcesses.add(backendProcess);
    state.appProcesses.add(backendProcess);

    log('cyan', '启动前端服务...');
    const frontendProcess = spawn(NODE_EXE, [frontendScript], {
      cwd: PROJECT_ROOT,
      // stdin 必须 ignore：常驻服务进程不读取输入，避免占用父进程 stdin
      // 导致命令行"卡住，需点回车才继续"（Windows 控制台 stdin 共享问题）
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: false,
      windowsHide: true,
      detached: IS_LINUX,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        FRONTEND_PORT: String(PORTS.frontend),
        BACKEND_URL: `http://localhost:${PORTS.backend}`,
      },
    });
    state.childProcesses.add(frontendProcess);
    state.appProcesses.add(frontendProcess);

    setupSignalHandlers();

    // 等待所有服务就绪（前台模式）
    const backendOk = await waitForServicesForeground(backendProcess, backendOutput);
    if (!backendOk) return; // 后端启动失败，不继续
  }

  // PM2 模式：等待服务就绪并打开浏览器
  //（前台模式已经在 waitForServicesForeground 中处理了）
  if (mode === 'pm2') {
    console.log('');
    log('green', '╔══════════════════════════════════════════════════════════╗');
    log(
      'green',
      `║        服务已启动 (${modeLabel})${' '.repeat(Math.max(0, 30 - modeLabel.length))}║`
    );
    log('green', '╠══════════════════════════════════════════════════════════╣');
    log('green', '║  后端:  http://localhost:' + PORTS.backend + '           ║');
    log('green', '║  前端:  http://localhost:' + PORTS.frontend + '           ║');
    const map = getMobileAccessPath();
    log('green', '║  移动端: http://localhost:' + PORTS.frontend + '/' + map + '/  ║');
    log('green', '║  API:   http://localhost:' + PORTS.backend + '/api       ║');
    log('green', '║  API文档: http://localhost:' + PORTS.backend + '/api/docs ║');
    log(
      'green',
      '║  配置:  http://localhost:' + PORTS.configService + '           ║'
    );
    log('green', '╠══════════════════════════════════════════════════════════╣');
    log('green', '║  停止:  选择菜单 [停止服务]                               ║');
    log('green', '╚══════════════════════════════════════════════════════════╝');

    showCurrentPasswords();

    await waitAndOpenBrowsers();
  }

  if (mode === 'foreground') {
    // 部署收尾时序修正（P2.4）：在"阻塞等待进程退出"之前执行 onReady 回调
    //（图纸版本验证 / changelog 等必须在服务仍运行时完成）
    if (typeof onReady === 'function') {
      try {
        await onReady();
      } catch (err) {
        log('yellow', `[警告] onReady 回调执行失败: ${err.message}`);
      }
    }

    // 前台模式：等待所有进程退出
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        let allExited = true;
        for (const proc of state.childProcesses) {
          if (!proc.killed && !proc.exitCode) {
            allExited = false;
            break;
          }
        }
        if (allExited) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }
}

async function startOnly() {
  clearScreen();
  printHeader();
  log('bright', '>>> 启动基础服务');
  console.log('');

  if (!(await startInfrastructure())) {
    return;
  }

  console.log('');
  log('green', '[✓] 基础服务已启动');
  log('cyan', '  PostgreSQL: localhost:' + PORTS.postgresql);
  log('cyan', '  Redis:      localhost:' + PORTS.redis);
  log('cyan', '  协同服务:   localhost:' + PORTS.cooperate);
  log('cyan', '  配置中心:   localhost:' + PORTS.configService);
}

async function testConnection() {
  const envPath = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');
  if (!fs.existsSync(envPath)) {
    return false;
  }

  const envConfig = parseEnvFile(envPath);
  const dbHost = envConfig.DB_HOST || 'localhost';
  const dbPort = parseInt(envConfig.DB_PORT || '5432');
  const redisHost = envConfig.REDIS_HOST || 'localhost';
  const redisPort = parseInt(envConfig.REDIS_PORT || '6379');

  let dbOk = false;
  let redisOk = false;

  // 测试数据库
  try {
    await waitForPort(dbPort, 'PostgreSQL', 5000);
    dbOk = true;
  } catch (e) {
    log('yellow', `[警告] 数据库连接失败: ${e.message}`);
  }

  // 测试 Redis
  try {
    await waitForPort(redisPort, 'Redis', 5000);
    redisOk = true;
  } catch (e) {
    log('yellow', `[警告] Redis 连接失败: ${e.message}`);
  }

  return dbOk && redisOk;
}

async function startMode() {
  // 检查构建产物是否存在（后端入口统一走 getBackendDist，见 startAppServices）
  const backendDist = getBackendDist();
  const frontendDist = path.join(PROJECT_ROOT, 'packages', 'frontend', 'dist');

  if (!fs.existsSync(backendDist)) {
    clearScreen();
    printHeader();
    log('red', '>>> 错误：后端构建产物不存在');
    console.log('');
    log('yellow', '请先构建项目：');
    console.log(`  ${colors.cyan}pnpm build${colors.reset}`);
    console.log('');
    log('cyan', '或使用部署模式（包含构建）：');
    console.log(`  ${colors.cyan}./cloudcad.sh deploy${colors.reset}`);
    console.log('');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    await new Promise((resolve) => {
      rl.question(`${colors.bright}按回车键退出...${colors.reset}`, () => {
        rl.close();
        resolve();
      });
    });
    process.exit(1);
  }

  if (!fs.existsSync(frontendDist)) {
    log('yellow', '[警告] 前端构建产物不存在，前端服务将不可用');
  }

  // 询问启动模式
  console.log('');
  console.log(`${colors.cyan}请选择启动模式：${colors.reset}`);
  console.log('');
  console.log(`  ${colors.cyan}[1]${colors.reset} PM2 后台运行（生产模式）`);
  console.log(
    `  ${colors.cyan}[2]${colors.reset} 前台运行（终端关闭则服务退出）`
  );
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const choice = await new Promise((resolve) => {
    rl.question(`${colors.bright}请输入选项 [1]: ${colors.reset}`, (ans) => {
      rl.close();
      resolve(ans.trim() || '1');
    });
  });

  console.log('');

  const usePm2 = choice !== '2';

  // 只停止应用层（后端/前端），保留基础服务：避免切换模式时旧后端占用 3001 端口
  // 导致新实例 EADDRINUSE；基础服务由 startInfrastructure 幂等复用，不重启。
  await stopAppServices();

  // 启动基础服务（幂等：已在运行则复用，不重启；由 startAppServicesWithInfra → startInfrastructure 处理）
  if (usePm2) {
    // PM2 模式
    if (!PM2_JS || !fs.existsSync(PM2_JS) || !USE_RUNTIME) {
      log('yellow', '[提示] PM2 不可用，将使用前台模式启动');
      await startAppServicesWithInfra('foreground');
    } else {
      await startAppServicesWithInfra('pm2');
    }
  } else {
    // 前台模式
    await startAppServicesWithInfra('foreground');
  }
}

/**
 * 启动基础服务 + 应用服务（用于 startMode）
 */
async function startAppServicesWithInfra(mode) {
  log('blue', '[1/2] 启动基础服务...');

  // 统一走 startInfrastructure（P2.5 双实现合一 + Q0 统一 PM2 托管）：
  // - 部署机（PM2 可用）：基础服务一律 PM2 托管（无论应用层前台/后台）
  // - 纯开发环境（PM2 不可用）：前台 spawn 兜底
  // mode 参数仍传递给应用层（startAppServices），基础服务不再按 mode 分叉。
  if (!(await startInfrastructure(mode === 'pm2'))) {
    return;
  }

  // 等待基础服务就绪
  log('cyan', '等待服务就绪...');
  let connected = false;

  while (!connected) {
    try {
      await waitForPort(PORTS.postgresql, 'PostgreSQL', 30000);
      await waitForPort(PORTS.redis, 'Redis', 30000);
      connected = true;
    } catch (err) {
      log('red', `[错误] ${err.message}`);
      console.log('');

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise((resolve) => {
        rl.question(
          `${colors.yellow}是否重新配置？(Y/n): ${colors.reset}`,
          (ans) => {
            rl.close();
            resolve(ans.trim().toLowerCase());
          }
        );
      });

      if (answer !== 'n' && answer !== 'no') {
        await runSetupWizard();
        connected = true;
      } else {
        log('yellow', '跳过配置，启动可能失败');
        connected = true;
      }
    }
  }

  log('green', '[✓] 基础服务已启动');

  // 启动应用服务
  log('blue', '[2/2] 启动应用服务...');
  await startAppServices(mode);
}

module.exports = {
  waitForServicesForeground,
  startAppServices,
  shouldRestartAppServices,
  startOnly,
  testConnection,
  startMode,
  startAppServicesWithInfra,
};
