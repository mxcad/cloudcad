/**
 * @fileoverview 基础设施启动命令（PostgreSQL/Redis/Cooperate/配置中心）
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - startInfrastructure：cli.js:527-623
 * - isServiceRunning：cli.js:1901-1909
 *
 * 依赖方向：commands → lib + foreground/registry（PM2 分支独立实现，前台分支保持现状）。
 * 前台分支的 childProcesses 经 lib/state 共享。
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn, spawnSync } = require('child_process');

const {
  IS_WINDOWS,
  IS_LINUX,
  USE_RUNTIME,
  PROJECT_ROOT,
  RUNTIME_DIR,
  PLATFORM_DIR,
  PORTS,
  NODE_EXE,
  PM2_JS,
  PM2_HOME,
  INFRA_SERVICE_APPS,
  INFRA_APP_TO_PORT_KEY,
} = require('../lib/context');
const {
  runCommand,
  runPm2,
  getPm2StatusList,
  getPm2AppStatus,
  getPidByPort,
  isNodePid,
  isOurRuntimeProcess,
  isForeignCloudCadRuntimeProcess,
  getProcessExecutablePath,
  killTree,
} = require('../lib/proc');
const state = require('../lib/state');
// isPortOpen 单一实现位于 lib/health（infra 直接复用，避免重复实现）
const { isPortOpen } = require('../lib/health');
const { log } = require('../lib/logger');
const {
  detectRedisOwnership,
  stopRedisProcess,
} = require('../lib/redis-takeover');

/**
 * 启动基础服务。
 *
 * 托管策略（已理顺，Q0）：基础服务（PG/Redis/协同/配置中心）**统一由 PM2 托管**，
 * 无论应用层是前台 spawn 还是 PM2 后台。这样避免"前台 spawn 的基础服务 + PM2 的基础服务"
 * 双实例冲突，且基础服务不依赖 CLI 父进程存活——前台模式 Ctrl+C 退出时基础服务常驻。
 * - PM2 可用（离线部署包 USE_RUNTIME）：基础服务一律走 PM2，首次 start、已注册 restart（不 delete）
 * - PM2 不可用（纯开发环境）：回退前台 spawn（仅兜底，基础服务随 CLI 退出）
 *
 * @param {boolean} [_usePm2] 已不再决定基础服务托管方式（统一 PM2），仅保留兼容参数。
 *   - 部署机（PM2 可用）：无论传 true/false 都走 PM2（Q0）。
 *   - 纯开发环境（PM2 不可用）：一律前台 spawn 兜底。
 *   true/false 只影响"PM2 不可用时是否允许前台兜底"（false 表示调用方明确要求前台语义，
 *   但若 PM2 可用仍以 PM2 为准，避免双轨漂移）。
 */
async function startInfrastructure(_usePm2 = true) {
  log('blue', '[1/3] 启动基础服务...');

  const pm2Available = !!(PM2_JS && fs.existsSync(PM2_JS) && USE_RUNTIME);

  // 逐服务检测端口 + PM2 托管状态，判定"缺失"与"重复/残留"。
  // 这是 Q1 的核心：端口状态与 PM2 状态必须一致，不一致即视为待清理的重复实例。
  const portOpenMap = {};
  const pm2StatusMap = {};
  for (const appName of INFRA_SERVICE_APPS) {
    const portKey = INFRA_APP_TO_PORT_KEY[appName];
    portOpenMap[appName] = await isPortOpen(PORTS[portKey]);
    pm2StatusMap[appName] = pm2Available ? getPm2AppStatus(appName) : 'unknown';
  }

  const allPortsOpen = INFRA_SERVICE_APPS.every((name) => portOpenMap[name]);
  if (allPortsOpen) {
    // 端口全开，但可能存在"端口被非 PM2 进程占用"或"PM2 服务定义与端口不一致"的残留，
    // 需在部署机场景下校验 PM2 是否真的在托管这些端口。
    if (pm2Available && !areAllInfraOnline(pm2StatusMap)) {
      log(
        'yellow',
        '[警告] 检测到基础服务端口已占用，但本目录 PM2 未在托管（可能是前台残留/另一部署目录的服务/外部进程），尝试理顺 PM2 托管...'
      );
      return reconcileInfrastructureWithPm2(portOpenMap, pm2StatusMap);
    }
    log('green', '[✓] 基础服务已在运行，复用现有实例（不重启）');
    return true;
  }

  if (pm2Available) {
    return reconcileInfrastructureWithPm2(portOpenMap, pm2StatusMap);
  }

  // PM2 不可用：回退前台 spawn（纯开发环境兜底）
  return startInfrastructureForeground({
    pgOpen: portOpenMap['postgresql'],
    redisOpen: portOpenMap['redis'],
    cooperateOpen: portOpenMap['cooperate'],
    configOpen: portOpenMap['config-service'],
  });
}

/**
 * 是否所有基础服务在 PM2 中均处于 online。
 */
function areAllInfraOnline(pm2StatusMap) {
  return INFRA_SERVICE_APPS.every((name) => pm2StatusMap[name] === 'online');
}

/**
 * 端口被**另一部署目录**的 cloudcad 服务占用时的用户询问。
 *
 * 不同部署目录是相互独立的项目（各自 .env 密钥/数据目录），静默接管对方服务
 * 会导致本目录密钥与对方存量数据错位（PII 回填校验拦截部署），故必须询问：
 * 停止对方服务、起本目录自己的，还是中止部署。
 * 非交互环境（非 TTY，如 CI/无人值守）不询问、默认中止——无人值守下
 * 静默停掉另一个项目的服务风险不可接受。
 * @returns {Promise<boolean>} true=用户确认停止对方服务
 */
function askForeignServiceStop(appName, port, pid) {
  if (!process.stdin.isTTY) {
    return Promise.resolve(false);
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(
      `  [?] ${appName} 端口 ${port} 被另一部署目录的服务占用 (PID ${pid})。停止该服务并启动本目录的？[y/N]: `,
      (ans) => {
        rl.close();
        resolve(/^y(es)?$/i.test((ans || '').trim()));
      }
    );
  });
}

/**
 * 停止另一部署目录的基础服务（用户确认后的停止动作）。
 *
 * 直接 killTree 杀进程会被对方 PM2（autorestart: true）立即拉起，端口再次
 * 被占；须通过对方目录的 PM2_HOME 执行 `pm2 stop <app>`（PM2 标记 stopped，
 * 不触发自动重启）。对方根目录从可执行文件路径推导（exe 位于
 * <对方根>/runtime/<platform>/ 下，PM2_HOME = <对方根>/data/pm2，与
 * context.js 的 DATA_DIR/data/pm2 约定一致）。
 * 对方 PM2 daemon 未运行（命令非 0 退出）时回退 killTree——daemon 不在则
 * 无人拉起，直接杀进程树安全。
 * @returns {boolean} 是否成功停止
 */
function stopForeignService(appName, pid) {
  const exe = getProcessExecutablePath(pid);
  const normalized = (exe || '').toLowerCase().replace(/\\/g, '/');
  const runtimeIdx = normalized.indexOf('/runtime/');
  if (exe && runtimeIdx > 0 && PM2_JS && fs.existsSync(PM2_JS)) {
    const foreignRoot = exe.slice(0, runtimeIdx);
    const foreignPm2Home = path.join(foreignRoot, 'data', 'pm2');
    if (fs.existsSync(foreignPm2Home)) {
      const nodeDir = path.dirname(NODE_EXE);
      const existingPath = process.env.PATH || '';
      const res = spawnSync(NODE_EXE, [PM2_JS, 'stop', appName], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30000,
        env: {
          ...process.env,
          PM2_HOME: foreignPm2Home,
          PATH: IS_WINDOWS
            ? `${nodeDir};${existingPath}`
            : `${nodeDir}:${existingPath}`,
        },
      });
      if (res.status === 0) {
        log(
          `  [✓] 已通过对方目录 PM2 停止 ${appName}（PM2_HOME: ${foreignPm2Home}）`
        );
        return true;
      }
      log(
        'yellow',
        `  [警告] 对方目录 PM2 停止失败（退出码 ${res.status}），回退为直接终止进程树...`
      );
    }
  }
  return killTree(pid, { silent: false });
}

/**
 * 用 PM2 理顺基础服务托管（Q1）：
 * 1. 对"端口未开"的服务 → 若 PM2 已注册（stopped/errored/launching）则 restart，否则 start；
 * 2. 对"端口被本目录 PM2 未托管的进程占用"的服务，按占用者归属分类：
 *    - 另一部署目录的 cloudcad 服务（exe 在另一目录 runtime/ 下）：静默接管会导致
 *      本目录 .env 密钥与对方存量数据错位（PII 回填校验拦截部署），须询问用户
 *      "停止对方服务起自己的"（经对方 PM2_HOME 停止，防 autorestart 竞态）或中止部署；
 *    - 本目录残留（本 runtime 进程 / node 进程）：先按 PID 清掉（避免双实例）再交 PM2 启动；
 *    - 外部系统服务（系统自带 PG/Redis）：告警跳过，不误杀。
 */
async function reconcileInfrastructureWithPm2(portOpenMap, pm2StatusMap) {
  const ecosystemPath = path.join(RUNTIME_DIR, 'ecosystem.config.js');
  const onlineApps = new Set(
    getPm2StatusList()
      .filter((a) => a.pm2_env && a.pm2_env.status === 'online')
      .map((a) => a.name)
  );

  const toStart = []; // 未注册 → pm2 start
  const toRestart = []; // 已注册但未运行 → pm2 restart
  const conflicts = []; // 端口被非 node 外部进程占用，跳过

  for (const appName of INFRA_SERVICE_APPS) {
    const portKey = INFRA_APP_TO_PORT_KEY[appName];
    const portOpen = portOpenMap[appName];

    if (portOpen && onlineApps.has(appName)) {
      // 端口开 + PM2 online：健康，复用
      continue;
    }

    if (portOpen && !onlineApps.has(appName)) {
      // 端口开但 PM2 未托管：存在占用者。按归属判定处理方式：
      // - 另一部署目录的 cloudcad 服务（exe 在另一目录 runtime/ 下）：
      //   静默接管会使本目录 .env 密钥与对方存量数据错位（PII 回填校验拦截部署），
      //   须询问用户：停止对方服务起自己的，或中止部署
      // - 本部署包 runtime 进程 / node 进程（本目录）：PM2 崩溃或前台 spawn 残留 → 清理
      // - 外部系统服务（系统自带 PG/Redis）：不误杀，跳过告警
      const pid = getPidByPort(PORTS[portKey]);
      if (pid && isForeignCloudCadRuntimeProcess(pid)) {
        const exe = getProcessExecutablePath(pid) || '未知路径';
        log(
          'yellow',
          `  [冲突] ${appName} 端口 ${PORTS[portKey]} 被另一部署目录的服务占用 (PID ${pid}): ${exe}`
        );
        const stopForeign = await askForeignServiceStop(
          appName,
          PORTS[portKey],
          pid
        );
        if (stopForeign) {
          log(
            'yellow',
            `  [清理] 正在按用户确认停止另一部署目录的 ${appName} 服务 (PID ${pid})...`
          );
          if (!stopForeignService(appName, pid)) {
            log(
              'red',
              `  [错误] 停止另一部署目录的 ${appName} 服务失败，部署中止。请在该目录手动执行 stop 后重跑。`
            );
            return false;
          }
          // 停止后直接交给 PM2 启动（start 幂等，若仍占用会失败）
          toStart.push(appName);
        } else {
          log(
            'red',
            `  [错误] ${appName} 端口 ${PORTS[portKey]} 被另一部署目录的服务占用且未停止——端口冲突，当前项目无法启动，部署中止。`
          );
          log(
            'cyan',
            '  继续方式：停止另一部署目录的服务（在该目录执行 stop），或修改本目录 .env 的端口配置避开冲突后重跑。'
          );
          return false;
        }
        continue;
      }
      if (pid && (isNodePid(pid) || isOurRuntimeProcess(pid))) {
        const kind = isNodePid(pid) ? 'node 进程' : '本部署包残留进程';
        log(
          'yellow',
          `  [清理] 检测到 ${appName} 端口 ${PORTS[portKey]} 被残留${kind}占用 (PID ${pid})，先清理再交 PM2 托管...`
        );
        killTree(pid, { silent: false });
        // 清理后需重查端口，但此处直接交给 PM2 启动（start 幂等，若仍占用会失败）
        toStart.push(appName);
      } else if (appName === 'redis') {
        // 端口被非 PM2 托管进程占用：不误杀。redis 额外做归属确认（升级路径 #419）：
        // 占用实例 cmdline 含本部署 data/redis 目录 → 本部署旧实例（可能无密码/
        // 密码不一致，且不在 PM2 托管内）→ 停掉并交 PM2 重启（redis-manager 按
        // .env REDIS_PASSWORD 以 --requirepass 拉起，密码持久化 + 纳入托管）；
        // 非本部署实例 / 归属未知 → 不触碰，落入下方冲突告警。
        if (detectRedisOwnership(pid) === 'ours') {
          log(
            'yellow',
            `  [清理] redis 端口 ${PORTS.redis} 被本部署旧无托管实例占用 (PID ${pid})，停止并交 PM2 重启（按 .env REDIS_PASSWORD 设密）...`
          );
          if (!stopRedisProcess(pid)) {
            log(
              'red',
              `  [错误] 停止旧 redis 实例 (PID ${pid}) 失败，落入冲突告警`
            );
            conflicts.push(`${appName}(${PORTS[portKey]})`);
          } else {
            // 等端口释放（redis 收到 SIGTERM 优雅退出、落盘 AOF，通常 1 秒内），
            // 避免新 redis-manager 误判旧实例"已在运行"进入 keepAlive
            for (let i = 0; i < 10 && (await isPortOpen(PORTS.redis)); i++) {
              await new Promise((resolve) => setTimeout(resolve, 300));
            }
            toStart.push('redis');
          }
        } else {
          conflicts.push(`${appName}(${PORTS[portKey]})`);
        }
      } else {
        // 外部进程占用（如系统自带 PG）：不误杀，跳过并告警
        conflicts.push(`${appName}(${PORTS[portKey]})`);
      }
      continue;
    }

    // 端口未开：若 PM2 已注册但停止 → restart；否则 start
    if (getPm2AppStatus(appName) === 'unknown') {
      toStart.push(appName);
    } else {
      toRestart.push(appName);
    }
  }

  if (conflicts.length > 0) {
    log(
      'yellow',
      `  [跳过] 以下基础服务端口被外部进程占用，未接管：${conflicts.join(', ')}`
    );
  }

  if (toStart.length > 0) {
    if (!runPm2(['start', ecosystemPath, '--only', toStart.join(',')])) {
      log('red', '[错误] 基础服务启动失败');
      return false;
    }
    log('green', `[✓] 基础服务已启动（PM2）: ${toStart.join(', ')}`);
  }

  if (toRestart.length > 0) {
    if (!runPm2(['restart', ...toRestart])) {
      log('red', '[错误] 基础服务重启失败');
      return false;
    }
    log('green', `[✓] 基础服务已重启（PM2）: ${toRestart.join(', ')}`);
  }

  // 保存 PM2 进程列表（持久化，供 pm2 resurrect / 开机自启恢复）
  runPm2(['save'], { silent: true });

  return true;
}

/**
 * 配置 PM2 开机自启（pm2 save + 平台原生的登录自启）。
 *
 * 平台能力（已核实，PM2 5.4.3）：
 * - Linux：`pm2 startup systemd` 原生支持，直接生成并注册 systemd 服务（需 root / sudo）。
 *   注意必须用内嵌 PM2（node PM2_JS startup ...），不能用系统 PATH 的 `pm2`——
 *   离线部署包的系统 PATH 没有 pm2，用 execSync('pm2') 必然失败导致误报"需安装"。
 * - Windows：PM2 原生 `pm2 startup` **不支持**（detectInitSystem 只识别 Unix 的
 *   systemctl/launchctl 等，Windows 上直接抛 "Init system not found"）。
 *   但 Windows 自启本质是"登录时执行 pm2 resurrect"。用 Windows **自带的任务计划程序
 *   （schtasks）**即可实现，**无需任何第三方包**（pm2-windows-startup 底层就是封装计划任务）。
 *
 * 静默语义：开机自启是**尽力而为**的附加能力，即使未配置成功也不影响部署本身，
 * 因此本函数全程不输出任何提示（成功/失败均静默），失败时静默返回 false，不抛错。
 *
 * @returns {Promise<boolean>} 是否已配置（结果仅供调用方内部参考，不面向用户展示）
 */
async function setupPm2Startup() {
  const { IS_WINDOWS: isWin } = require('../lib/context');

  // 先保存当前进程列表（pm2 resurrect 恢复的基础）
  runPm2(['save'], { silent: true });

  if (!isWin) {
    // 用内嵌 PM2 而非系统 PATH 的 pm2：离线部署机 PATH 无 pm2，execSync('pm2') 会 ENOENT。
    const user = process.env.USER || process.env.LOGNAME || 'root';
    const home = process.env.HOME || `/home/${user}`;
    return runPm2(['startup', 'systemd', '-u', user, '--hp', home]);
  }

  // Windows：用注册表 HKCU Run 键实现"登录时 pm2 resurrect"（Windows 原生，无需第三方包）。
  // 注册表 Run 键由 Windows 登录后自动执行，无需管理员权限，适合 PM2 这种用户级服务。
  try {
    // 1) 生成登录自启脚本：设置 PM2_HOME 后执行 pm2 resurrect（恢复所有已 save 的进程）
    const dataDir = path.join(PROJECT_ROOT, 'data');
    const batPath = path.join(dataDir, 'pm2-startup.bat');
    const batContent = [
      '@echo off',
      `set PM2_HOME=${PM2_HOME}`,
      `start "" /min "${NODE_EXE}" "${PM2_JS}" resurrect`,
      'exit',
    ].join('\r\n');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(batPath, batContent, { encoding: 'utf8' });

    // 2) 注册 HKCU Run 键，值指向该 bat（路径含空格用 \" 转义，REG_SZ 原样存储）
    const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    const escapedBat = batPath.replace(/\\/g, '\\\\');
    const runValue = `cmd /c "${escapedBat}"`;
    return runCommand(
      'reg',
      [
        'add',
        runKey,
        '/v',
        'CloudCAD-PM2',
        '/t',
        'REG_SZ',
        '/d',
        runValue,
        '/f',
      ],
      { silent: true }
    );
  } catch {
    return false;
  }
}

/**
 * 前台 spawn 启动基础服务（仅 PM2 不可用时的兜底）。
 * 前台模式依赖 CLI 父进程存活，通常不应作为正式部署方式。
 */
async function startInfrastructureForeground({
  pgOpen,
  redisOpen,
  cooperateOpen,
  configOpen,
}) {
  const pgManagerScript = path.join(RUNTIME_DIR, 'scripts', 'pg-manager.js');
  const redisManagerScript = path.join(
    RUNTIME_DIR,
    'scripts',
    'redis-manager.js'
  );
  const cooperateScript = path.join(
    RUNTIME_DIR,
    'scripts',
    'cooperate-manager.js'
  );
  const configServiceScript = path.join(
    PROJECT_ROOT,
    'packages',
    'config-service',
    'server.js'
  );

  if (!pgOpen) {
    const pgProcess = spawn(NODE_EXE, [pgManagerScript, 'daemon'], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: false,
      windowsHide: true,
      detached: IS_LINUX,
    });
    state.childProcesses.add(pgProcess);
    log('cyan', '  PostgreSQL 已启动（前台兜底）');
  }

  if (!redisOpen) {
    const redisProcess = spawn(NODE_EXE, [redisManagerScript, 'daemon'], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: false,
      windowsHide: true,
      detached: IS_LINUX,
    });
    state.childProcesses.add(redisProcess);
    log('cyan', '  Redis 已启动（前台兜底）');
  }

  if (!cooperateOpen && fs.existsSync(cooperateScript)) {
    const cooperateProcess = spawn(NODE_EXE, [cooperateScript], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: false,
      windowsHide: true,
      detached: IS_LINUX,
    });
    state.childProcesses.add(cooperateProcess);
    log('cyan', '  协同服务已启动（前台兜底）');
  }

  if (!configOpen && fs.existsSync(configServiceScript)) {
    const configProcess = spawn(NODE_EXE, [configServiceScript], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: false,
      windowsHide: true,
      detached: IS_LINUX,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        CONFIG_SERVICE_PORT: String(PORTS.configService),
      },
    });
    state.childProcesses.add(configProcess);
    log('cyan', '  配置中心已启动（前台兜底）');
  }

  log('green', '[✓] 基础服务已启动（前台兜底模式）');
  return true;
}

// 检查服务是否运行
function isServiceRunning(serviceName) {
  const result = spawnSync(NODE_EXE, [PM2_JS, 'show', serviceName], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...process.env, PM2_HOME },
    shell: IS_WINDOWS,
  });
  return result.status === 0 && !result.stdout.includes('not found');
}

module.exports = {
  startInfrastructure,
  isServiceRunning,
  setupPm2Startup,
  areAllInfraOnline,
  reconcileInfrastructureWithPm2,
};
