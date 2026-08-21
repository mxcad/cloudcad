const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');
const { log } = require('./utils');
const {
  PROJECT_ROOT,
  PM2_HOME,
  ECOSYSTEM_PATH,
  INFRASTRUCTURE_SERVICES,
  PM2_SERVICES,
} = require('./constants');

function runPm2Command(args, options = {}) {
  try {
    const pm2Cmd =
      process.platform === 'win32'
        ? path.join(PROJECT_ROOT, 'pm2.cmd')
        : path.join(PROJECT_ROOT, 'pm2');

    const result = spawnSync(pm2Cmd, args, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      shell: true,
      timeout: 30000,
      env: {
        ...process.env,
        ...options.env,
        PM2_HOME,
      },
    });

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

function restartService(serviceName) {
  if (serviceName === 'config-service') {
    return { success: false, error: '不能重启配置中心服务' };
  }

  const result = runPm2Command(['restart', serviceName]);
  log('info', `重启服务: ${serviceName}`);
  return result;
}

function stopService(serviceName) {
  if (serviceName === 'config-service') {
    return { success: false, error: '不能停止配置中心服务' };
  }

  const result = runPm2Command(['stop', serviceName]);
  log('info', `停止服务: ${serviceName}`);
  return result;
}

function startService(serviceName) {
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
  runPm2Command,
  getAllServicesStatus,
  restartService,
  stopService,
  startService,
};
