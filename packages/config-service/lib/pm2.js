const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');
const { log } = require('./utils');
const {
  PROJECT_ROOT,
  RUNTIME_DIR,
  PM2_HOME,
  ECOSYSTEM_PATH,
  INFRASTRUCTURE_SERVICES,
  PM2_SERVICES,
} = require('./constants');

/**
 * 解析 PM2 的调用方式（内嵌 runtime 优先，系统 PATH 回退）。
 *
 * 部署包布局：runtime/<platform>/node{ /bin/node | node.exe }
 *          +  runtime/<platform>/node/node_modules/pm2/bin/pm2
 * 用「node + pm2 脚本」的绝对路径调用，避免依赖 PATH 或项目根目录的 pm2 包装脚本
 * （根目录 pm2 / pm2.cmd 包装脚本已在 setup-offline.js 中移除，部署包里不存在）。
 *
 * @param {string} [runtimeDir] 运行时目录，测试注入用
 * @param {string} [platform] 平台名，测试注入用
 * @returns {{command:string, argsPrefix:string[], extraPath:string|null, shell:boolean}}
 */
function resolvePm2Invocation(
  runtimeDir = RUNTIME_DIR,
  platform = process.platform
) {
  const isWindows = platform === 'win32';
  const nodeDir = path.join(
    runtimeDir,
    isWindows ? 'windows' : 'linux',
    'node'
  );
  const nodeExe = isWindows
    ? path.join(nodeDir, 'node.exe')
    : path.join(nodeDir, 'bin', 'node');
  const pm2Script = path.join(nodeDir, 'node_modules', 'pm2', 'bin', 'pm2');

  if (fs.existsSync(nodeExe) && fs.existsSync(pm2Script)) {
    return {
      command: nodeExe,
      argsPrefix: [pm2Script],
      // PM2 daemon 按 PATH 解析 node 来 spawn 子进程，须把 node 目录前置
      extraPath: path.dirname(nodeExe),
      shell: false,
    };
  }

  // 回退：系统 PATH 中的 pm2（本地开发或无内嵌 runtime 的环境）
  // Windows 下 pm2 是 .cmd 脚本，需要 shell 才能按 PATHEXT 解析
  return { command: 'pm2', argsPrefix: [], extraPath: null, shell: isWindows };
}

function runPm2Command(args, options = {}) {
  try {
    const { command, argsPrefix, extraPath, shell } = resolvePm2Invocation();
    const env = {
      ...process.env,
      ...options.env,
      PM2_HOME,
    };
    if (extraPath) {
      env.PATH = extraPath + path.delimiter + (env.PATH || '');
    }

    const result = spawnSync(command, [...argsPrefix, ...args], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 30000,
      env,
      shell,
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return {
      success: result.status === 0,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getAllServicesStatus() {
  const result = runPm2Command(['jlist']);

  if (!result.success) {
    return { success: false, error: result.stderr || result.error };
  }

  try {
    const processes = JSON.parse(result.stdout || '[]');
    const statusMap = {};

    processes.forEach((proc) => {
      statusMap[proc.name] = {
        status: proc.pm2_env?.status || 'unknown',
        uptime: proc.pm2_env?.pm_uptime || 0,
        memory: proc.monit?.memory || 0,
        cpu: proc.monit?.cpu || 0,
        restarts: proc.pm2_env?.restart_time || 0,
      };
    });

    PM2_SERVICES.forEach((name) => {
      if (!statusMap[name]) {
        statusMap[name] = {
          status: 'stopped',
          uptime: 0,
          memory: 0,
          cpu: 0,
          restarts: 0,
        };
      }
    });

    return { success: true, services: statusMap };
  } catch (err) {
    return { success: false, error: '解析 PM2 状态失败' };
  }
}

/**
 * 服务名白名单校验：serviceName 来自 URL 路径段，系统 PM2 回退路径走 `shell:true`
 * （Windows），未校验的 `&`/`;` 等元字符会致命令注入。只允许 PM2_SERVICES 内的精确
 * 名称（无元字符），从源头杜绝注入。
 */
function assertKnownService(serviceName) {
  if (typeof serviceName !== 'string' || !PM2_SERVICES.includes(serviceName)) {
    return { success: false, error: '非法的服务名' };
  }
  return null;
}

function restartService(serviceName) {
  const invalid = assertKnownService(serviceName);
  if (invalid) return invalid;

  if (serviceName === 'config-service') {
    return { success: false, error: '不能重启配置中心服务' };
  }

  const result = runPm2Command(['restart', serviceName]);
  log('info', `重启服务: ${serviceName}`);
  return result;
}

function stopService(serviceName) {
  const invalid = assertKnownService(serviceName);
  if (invalid) return invalid;

  if (serviceName === 'config-service') {
    return { success: false, error: '不能停止配置中心服务' };
  }

  const result = runPm2Command(['stop', serviceName]);
  log('info', `停止服务: ${serviceName}`);
  return result;
}

function startService(serviceName) {
  const invalid = assertKnownService(serviceName);
  if (invalid) return invalid;

  if (serviceName === 'config-service') {
    return { success: false, error: '配置中心服务已在运行' };
  }

  if (INFRASTRUCTURE_SERVICES.includes(serviceName)) {
    if (!fs.existsSync(ECOSYSTEM_PATH)) {
      return { success: false, error: 'PM2 配置文件不存在' };
    }
    const result = runPm2Command([
      'start',
      ECOSYSTEM_PATH,
      '--only',
      serviceName,
    ]);
    log('info', `启动服务: ${serviceName}`);
    return result;
  }

  if (serviceName === 'backend' || serviceName === 'frontend') {
    const tempConfigPath = path.join(
      PROJECT_ROOT,
      'data',
      'pm2-deploy.config.js'
    );
    if (fs.existsSync(tempConfigPath)) {
      const result = runPm2Command([
        'start',
        tempConfigPath,
        '--only',
        serviceName,
      ]);
      log('info', `启动服务: ${serviceName}`);
      return result;
    } else {
      return { success: false, error: '部署配置不存在，请先部署' };
    }
  }

  const result = runPm2Command(['start', serviceName]);
  log('info', `启动服务: ${serviceName}`);
  return result;
}

module.exports = {
  resolvePm2Invocation,
  runPm2Command,
  getAllServicesStatus,
  restartService,
  stopService,
  startService,
};
