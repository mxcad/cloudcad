const { log, parseBody, sendJson } = require('../lib/utils');
const { authMiddleware } = require('../lib/session');
const { parseEnvFile, extractDbNameFromUrl, updateEnvFile } = require('../lib/env');
const { ENV_PATH, CONFIG_GROUPS } = require('../lib/constants');
const { getPsqlPath, getRedisCliPath } = require('../lib/db-backup');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { runPm2Command } = require('../lib/pm2');

async function handle(req, res, pathname, method) {
  if (pathname === '/api/config/schema' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;
    sendJson(res, 200, { groups: CONFIG_GROUPS });
    return true;
  }

  if (pathname === '/api/config' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const env = parseEnvFile(ENV_PATH);
    const config = {};

    CONFIG_GROUPS.forEach((group) => {
      group.items.forEach((item) => {
        const value = env[item.key] || '';
        if (item.sensitive) {
          config[item.key] = value ? '(已设置)' : '(未设置)';
        } else {
          config[item.key] = value;
        }
      });
    });

    sendJson(res, 200, { config, env });
    return true;
  }

  if (pathname === '/api/config' && method === 'PUT') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const updates = body.updates || {};

    Object.keys(updates).forEach((key) => {
      if (updates[key] === '(已设置)' || updates[key] === '(未设置)') {
        delete updates[key];
      }
    });

    if (Object.keys(updates).length === 0) {
      sendJson(res, 400, { error: '没有有效的更新内容' });
      return true;
    }

    const dbConfigKeys = [
      'DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE',
    ];
    const hasDbConfigChange = dbConfigKeys.some((key) => updates[key]);

    if (hasDbConfigChange) {
      const env = parseEnvFile(ENV_PATH);
      const dbHost = updates.DB_HOST || env.DB_HOST || 'localhost';
      const dbPort = updates.DB_PORT || env.DB_PORT || '5432';
      const dbName = updates.DB_DATABASE || env.DB_DATABASE || extractDbNameFromUrl(env.DATABASE_URL) || 'cloudcad';
      const dbUser = updates.DB_USERNAME || env.DB_USERNAME || 'postgres';
      const dbPassword = updates.DB_PASSWORD || env.DB_PASSWORD || 'password';
      const encodedPassword = encodeURIComponent(dbPassword);
      updates.DATABASE_URL = `postgresql://${dbUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbName}`;
    }

    updateEnvFile(ENV_PATH, updates);
    log('info', `配置已更新: ${Object.keys(updates).join(', ')}`);

    sendJson(res, 200, {
      success: true,
      message: '配置已保存，需要重启服务才能生效',
    });
    return true;
  }

  if (pathname === '/api/config/regenerate-jwt' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const newSecret = crypto.randomBytes(64).toString('hex');
    updateEnvFile(ENV_PATH, { JWT_SECRET: newSecret });
    log('info', 'JWT 密钥已重新生成');

    sendJson(res, 200, {
      success: true,
      message: 'JWT 密钥已重新生成，需要重启服务才能生效',
    });
    return true;
  }

  if (pathname === '/api/password/database' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const { oldPassword, newPassword } = body;

    if (!oldPassword || !newPassword) {
      sendJson(res, 400, { error: '请输入旧密码和新密码' });
      return true;
    }

    if (newPassword.length < 8) {
      sendJson(res, 400, { error: '新密码长度至少 8 位' });
      return true;
    }

    const env = parseEnvFile(ENV_PATH);
    const currentDbPassword = env.DB_PASSWORD || '';

    if (oldPassword !== currentDbPassword) {
      sendJson(res, 400, { error: '旧密码错误' });
      return true;
    }

    try {
      const dbHost = env.DB_HOST || 'localhost';
      const dbPort = env.DB_PORT || '5432';
      const dbName = env.DB_DATABASE || extractDbNameFromUrl(env.DATABASE_URL) || 'cloudcad';
      const dbUser = env.DB_USERNAME || 'postgres';
      const escapedUser = dbUser.replace(/"/g, '""');
      const escapedPassword = newPassword.replace(/'/g, "''");

      const psqlPath = getPsqlPath();
      if (fs.existsSync(psqlPath)) {
        const alterResult = spawnSync(
          psqlPath,
          [
            '-h', dbHost,
            '-p', dbPort,
            '-U', dbUser,
            '-d', 'postgres',
            '-c', `ALTER USER "${escapedUser}" PASSWORD '${escapedPassword}'`,
          ],
          {
            env: { ...process.env, PGPASSWORD: currentDbPassword },
            shell: false,
            stdio: 'pipe',
            timeout: 15000,
          }
        );
        if (alterResult.status !== 0) {
          const errMsg = alterResult.stderr ? alterResult.stderr.toString() : '';
          log('error', `ALTER USER 失败: ${errMsg}`);
          sendJson(res, 500, { error: `ALTER USER 执行失败: ${errMsg}` });
          return true;
        }
        log('info', 'PostgreSQL 用户密码已通过 ALTER USER 更新');
      } else {
        log('warn', `psql 不存在: ${psqlPath}，只更新 .env 配置`);
      }

      const encodedPassword = encodeURIComponent(newPassword);
      const newDatabaseUrl = `postgresql://${dbUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbName}`;
      updateEnvFile(ENV_PATH, {
        DB_PASSWORD: newPassword,
        DATABASE_URL: newDatabaseUrl,
      });
      log('info', '数据库密码已更新到 .env');

      const restartResult = runPm2Command(['restart', 'backend']);
      if (restartResult.success) {
        log('info', 'backend 服务已重启');
      } else {
        log('warn', 'backend 服务重启失败，请手动重启');
      }

      sendJson(res, 200, {
        success: true,
        message: '数据库密码已修改，后端服务正在重启',
      });
    } catch (err) {
      log('error', `修改数据库密码失败: ${err.message}`);
      sendJson(res, 500, { error: `修改失败: ${err.message}` });
    }
    return true;
  }

  if (pathname === '/api/password/redis' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const { oldPassword, newPassword } = body;

    if (!oldPassword || !newPassword) {
      sendJson(res, 400, { error: '请输入旧密码和新密码' });
      return true;
    }

    if (newPassword.length < 8) {
      sendJson(res, 400, { error: '新密码长度至少 8 位' });
      return true;
    }

    const env = parseEnvFile(ENV_PATH);
    const currentRedisPassword = env.REDIS_PASSWORD || '';

    if (oldPassword !== currentRedisPassword) {
      sendJson(res, 400, { error: '旧密码错误' });
      return true;
    }

    try {
      const redisCliPath = getRedisCliPath();
      if (fs.existsSync(redisCliPath)) {
        const configArgs = ['-p', env.REDIS_PORT || '6379'];
        if (currentRedisPassword) {
          configArgs.push('-a', currentRedisPassword);
        }
        configArgs.push('CONFIG', 'SET', 'requirepass', newPassword);

        const configResult = spawnSync(redisCliPath, configArgs, {
          shell: false,
          stdio: 'pipe',
          timeout: 15000,
        });

        if (configResult.status === 0) {
          log('info', 'Redis requirepass 已通过 CONFIG SET 更新');
          spawnSync(redisCliPath, [...configArgs.slice(0, -4), 'CONFIG', 'REWRITE'], {
            shell: false,
            stdio: 'pipe',
            timeout: 5000,
          });
        } else {
          const errMsg = configResult.stderr ? configResult.stderr.toString() : '';
          log('error', `Redis CONFIG SET 失败: ${errMsg}`);
          sendJson(res, 500, { error: `Redis CONFIG SET 失败: ${errMsg}` });
          return true;
        }
      } else {
        log('warn', `redis-cli 不存在: ${redisCliPath}，只更新 .env 配置`);
      }

      updateEnvFile(ENV_PATH, { REDIS_PASSWORD: newPassword });
      log('info', 'Redis 密码已更新到 .env');

      for (const svc of ['redis', 'backend']) {
        const r = runPm2Command(['restart', svc]);
        if (r.success) {
          log('info', `${svc} 服务已重启`);
        } else {
          log('warn', `${svc} 服务重启失败，请手动重启`);
        }
      }

      sendJson(res, 200, {
        success: true,
        message: 'Redis 密码已修改，Redis 和后端服务正在重启',
      });
    } catch (err) {
      log('error', `修改 Redis 密码失败: ${err.message}`);
      sendJson(res, 500, { error: `修改失败: ${err.message}` });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
