/**
 * @fileoverview 部署验证硬门禁（ADR-0074 D8）
 *
 * start.sh 末尾必跑；任一项失败 → 非 0 退出 + 逐项定位指引，绝不静默。
 * 检查项与「查什么 / 看哪个日志」一一对应，输出给完全不懂 Docker 的用户看。
 *
 * 仅依赖 node 内置 + 同目录 lib。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { portOpen } = require('./host-process');

/**
 * @param {Object} ctx
 * @param {string} ctx.deployDir
 * @param {string} ctx.env 解析后的 .env 键值对
 * @param {string} ctx.sudo
 * @param {boolean} ctx.dockerInstalledByUs
 * @param {string[]} ctx.imageTags
 * @param {string} ctx.version
 * @param {string} [ctx.dockerCli] docker CLI（rootless 时指向包内静态二进制，默认 'docker'）
 * @param {string} [ctx.dockerHost] DOCKER_HOST（rootless 时指向影子 socket，默认 ''）
 * @param {Function} [ctx.log]
 * @returns {Promise<{ ok: boolean, items: { name: string, ok: boolean, hint?: string }[] }>}
 */
async function verifyDeployment(ctx) {
  const { deployDir, env, sudo, dockerInstalledByUs, imageTags, version, dockerCli = 'docker', dockerHost = '', log = () => {} } = ctx;
  const items = [];
  const dataDir = path.join(deployDir, 'data');

  const docker = (args, timeoutMs = 20000) => {
    try {
      const dEnv = { ...process.env };
      if (dockerHost) dEnv.DOCKER_HOST = dockerHost;
      const cli = sudo ? 'sudo' : dockerCli;
      const cliArgs = sudo ? [dockerCli, ...args] : args;
      return execFileSync(cli, cliArgs, {
        encoding: 'utf8',
        timeout: timeoutMs,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: dEnv,
      }).trim();
    } catch (err) {
      return `__ERR__ ${err.message.split('\n')[0]}`;
    }
  };

  const httpGet = (url, timeoutMs = 5000) =>
    new Promise((resolve) => {
      const req = require('http').get(url, { timeout: timeoutMs }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });

  // 1. dockerd 可达
  {
    const out = docker(['version', '--format', '{{.Server.Version}}']);
    const ok = !out.startsWith('__ERR__');
    items.push({
      name: `Docker 引擎可达${dockerInstalledByUs ? '（本包自装）' : '（系统已有）'}`,
      ok,
      hint: ok ? undefined : `检查 ${path.join(dataDir, 'logs', 'dockerd.log')} 尾部`,
    });
    if (!ok) {
      return { ok: false, items }; // 后续项全部无意义，提前返回
    }
  }

  // 2. 镜像在位
  {
    const missing = [];
    for (const tag of imageTags) {
      const out = docker(['image', 'inspect', tag]);
      if (out.startsWith('__ERR__')) missing.push(tag);
    }
    items.push({
      name: `离线镜像在位（${imageTags.length} 个）`,
      ok: missing.length === 0,
      hint: missing.length ? `缺失：${missing.join(', ')}（重新执行 start.sh 的镜像加载步骤）` : undefined,
    });
  }

  // 3. 三容器 healthy
  {
    const bad = [];
    for (const name of ['cloudcad-pg', 'cloudcad-redis', 'cloudcad-app']) {
      const out = docker(['inspect', '-f', '{{.State.Health.Status}}', name]);
      if (out.startsWith('__ERR__') || out !== 'healthy') bad.push(`${name}=${out.replace('__ERR__ ', '')}`);
    }
    items.push({
      name: '三容器（pg/redis/app）healthy',
      ok: bad.length === 0,
      hint: bad.length ? `异常：${bad.join(', ')}（docker logs <容器名> --tail 40）` : undefined,
    });
  }

  // 4. PG 真实可用（探宿主端口，不是硬编码 5432）
  {
    const dbPort = env.DB_PORT || '5432';
    const out = docker(['exec', 'cloudcad-pg', 'pg_isready', '-h', '127.0.0.1', '-p', dbPort, '-U', env.DB_USERNAME || 'postgres']);
    const ok = !out.startsWith('__ERR__') && /accepting connections/.test(out);
    items.push({
      name: `PostgreSQL 可连接（127.0.0.1:${dbPort}）`,
      ok,
      hint: ok ? undefined : `docker logs cloudcad-pg --tail 40；核对 .env 的 DB_PASSWORD/DB_USERNAME`,
    });
  }

  // 5. Redis 认证路径（必须带 -a，验证的是认证不只是端口）
  {
    const redisPort = env.REDIS_PORT || '6379';
    const args = ['exec', 'cloudcad-redis', 'redis-cli', '-p', redisPort];
    if (env.REDIS_PASSWORD) args.push('-a', env.REDIS_PASSWORD);
    args.push('ping');
    const out = docker(args);
    const ok = out === 'PONG';
    items.push({
      name: `Redis 认证可用（127.0.0.1:${redisPort}${env.REDIS_PASSWORD ? '，含密码认证' : ''}）`,
      ok,
      hint: ok ? undefined : 'docker logs cloudcad-redis --tail 40；核对 .env 的 REDIS_PASSWORD',
    });
  }

  // 6. 后端 liveness
  {
    const port = env.PORT || '3001';
    const code = await httpGet(`http://127.0.0.1:${port}/api/health/live`);
    items.push({
      name: `后端存活（http://127.0.0.1:${port}/api/health/live）`,
      ok: code === 200,
      hint: code === 200 ? undefined : `docker logs cloudcad-app --tail 40`,
    });
  }

  // 7. 后端 ready（含 DB up）——用 /api/health/public（db+storage 均健康→200，任一不可用→503）。
  //    后端无 /api/health/ready 端点（health.controller 只有 live/public/full/db/storage），
  //    与外层 verify-linux-docker-deploy.js 的「后端 ready」探针同口径（曾误用 /ready 恒 404 判失败）。
  {
    const port = env.PORT || '3001';
    const code = await httpGet(`http://127.0.0.1:${port}/api/health/public`);
    items.push({
      name: `后端就绪（/api/health/public，含数据库连通）`,
      ok: code === 200,
      hint: code === 200 ? undefined : '数据库连通或迁移未完成：docker logs cloudcad-app --tail 40',
    });
  }

  // 8. 迁移版本与镜像版本一致
  {
    const marker = path.join(dataDir, '.migrated-version');
    const migrated = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : '';
    items.push({
      name: `数据库迁移已应用至当前版本（${version}）`,
      ok: migrated === version,
      hint:
        migrated === version
          ? undefined
          : `标记=${migrated || '（无）'} ≠ 镜像版本 ${version}：迁移未完成，backend 不应在运行。docker logs cloudcad-app --tail 40`,
    });
  }

  // 9. 前端
  {
    const port = env.FRONTEND_PORT || '8000';
    const code = await httpGet(`http://127.0.0.1:${port}/`);
    items.push({
      name: `前端页面（http://127.0.0.1:${port}/）`,
      ok: code !== null && code < 500,
      hint: code !== null && code < 500 ? undefined : 'docker logs cloudcad-app --tail 40（serve-static 段）',
    });
  }

  // 10. config-service（宿主进程）
  {
    const port = env.CONFIG_SERVICE_PORT || '3002';
    const open = await portOpen(parseInt(port, 10));
    items.push({
      name: `运维中心 config-service（127.0.0.1:${port}）`,
      ok: open,
      hint: open ? undefined : `看 ${path.join(dataDir, 'logs', 'config-service.log')}`,
    });
  }

  // 11. 转换服务（宿主进程，health 免密钥）
  {
    const port = env.CONVERSION_SERVICE_PORT || '3100';
    const code = await httpGet(`http://127.0.0.1:${port}/health`);
    items.push({
      name: `转换服务 conversion-service（127.0.0.1:${port}/health）`,
      ok: code === 200,
      hint: code === 200 ? undefined : `看 ${path.join(dataDir, 'logs', 'conversion.log')}`,
    });
  }

  // 12. 协同服务（宿主进程，TCP 探测）
  {
    const port = env.COOPERATE_PORT || '3091';
    const open = await portOpen(parseInt(port, 10));
    items.push({
      name: `协同服务（127.0.0.1:${port}）`,
      ok: open,
      hint: open ? undefined : `看 ${path.join(dataDir, 'logs', 'cooperate.log')}`,
    });
  }

  // 13. mxcad 探针结论（转换不可用不判失败，只如实报告）
  {
    const unavailableFile = path.join(dataDir, '.mxcad-unavailable');
    const applied = path.join(dataDir, '.systemlib-applied');
    let detail;
    if (fs.existsSync(unavailableFile)) {
      detail = fs.readFileSync(unavailableFile, 'utf8').trim();
    } else if (fs.existsSync(applied)) {
      detail = fs.readFileSync(applied, 'utf8').trim();
    } else {
      detail = '（探针未执行）';
    }
    const unavailable = fs.existsSync(unavailableFile);
    items.push({
      name: `mxcad 转换探针结论${unavailable ? '（⚠ 转换不可用，登录/协同不受影响）' : ''}`,
      ok: true, // 探针结论是信息项，不门禁
      hint: detail,
    });
    log(`[verify] mxcad 探针：${detail}`);
  }

  const ok = items.every((i) => i.ok);
  return { ok, items };
}

module.exports = { verifyDeployment };
