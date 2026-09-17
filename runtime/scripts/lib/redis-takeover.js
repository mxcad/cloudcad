/**
 * @fileoverview Redis 旧实例自动发现与接管（升级路径：老无托管实例 → PM2 托管 #419）
 *
 * 背景：fillEmptySecrets 只把 REDIS_PASSWORD 写进 .env，从不触碰已运行的实例。
 * 老的无密码（或密码不一致）redis 实例若不在当前 PM2 daemon 名下，后端 AUTH
 * 恒失败（"ERR AUTH <password> called without any password configured"），
 * 且该实例不在 pm2 save/resurrect 恢复范围内。
 *
 * 归属判据：本部署的 redis 恒由 redis-manager 以 `--dir <PROJECT_ROOT>/data/redis`
 * 拉起，故占用进程 cmdline 含该绝对路径即确认为本部署旧实例（exe 路径可能因
 * 升级/替换而无法解析，故用 cmdline 而非 exe 判定）。确认后：
 * - 停掉旧实例（SIGTERM，redis 优雅退出前落盘 AOF；Windows taskkill /T）；
 * - 交 PM2 重启（redis-manager 按 .env REDIS_PASSWORD 以 --requirepass 拉起，
 *   密码持久化 + 纳入 PM2 托管）。
 * 非本部署实例（系统自带 redis / 其他部署目录）/ 归属未知 → 绝不触碰。
 *
 * 纯函数层（isOurRedisInstance / detectRedisOwnership）可注入 getCmdline 做
 * 0 依赖 node:test（见 redis-takeover.test.js）。
 *
 * 运行期密码能力（#419 全自动升级）：
 * - loadRedisPassword / loadRedisHost：.env 单一事实源（redis-manager 也从此取，
 *   探测与实际生效的密码不能漂移）；
 * - probeRedisAuth：原生 RESP over TCP 探测（AUTH + PING），不依赖 redis-cli
 *   （源部署可能没装），密码含空格/特殊字符也不踩 shell 引号；
 * - setRedisPasswordAtRuntime：无密码实例 `CONFIG SET requirepass` 运行中改密
 *   （不需要先 AUTH，故不依赖进程归属、不杀进程、不动数据、无停机）；
 * - persistRedisConfig：`CONFIG REWRITE` 写回实例自己的配置文件（须先 AUTH——
 *   CONFIG SET 会让发起客户端立刻失认证，跨请求发 REWRITE 恒 NOAUTH）。
 */

const fs = require('fs');
const net = require('net');
const { spawnSync } = require('child_process');
const path = require('path');

const {
  IS_WINDOWS,
  DATA_DIR,
  PROJECT_ROOT,
  USE_RUNTIME,
  PLATFORM_DIR,
} = require('./context');

const BACKEND_ENV_PATH = path.join(
  PROJECT_ROOT,
  'packages',
  'backend',
  '.env'
);

/**
 * 判定占用进程是否本部署的 redis 旧实例：
 * 本部署的 redis 恒由 redis-manager 以 `--dir <PROJECT_ROOT>/data/redis` 拉起，
 * 故 cmdline 含该绝对路径即视为本部署旧实例。
 * 归一化：Windows 反斜杠转正斜杠 + 全小写（路径大小写不敏感）。
 * @param {string} cmdline
 * @param {string} dataDir
 * @returns {boolean}
 */
function isOurRedisInstance(cmdline, dataDir) {
  const norm = (s) => (s || '').toLowerCase().replace(/\\/g, '/');
  const target = norm(dataDir);
  if (!target) return false;
  return norm(cmdline).includes(target);
}

/**
 * 读取进程命令行（Linux 走 /proc/<pid>/cmdline，Windows 走 wmic）。
 * 读取失败返回空串（调用方按"归属未知"处理，不触碰实例）。
 * @param {number|null} pid
 * @returns {string}
 */
function getProcessCmdline(pid) {
  if (!pid) return '';
  try {
    if (IS_WINDOWS) {
      const res = spawnSync(
        'wmic',
        ['process', 'where', `ProcessId=${pid}`, 'get', 'CommandLine'],
        { encoding: 'utf8', shell: true, timeout: 5000, windowsHide: true }
      );
      return res.stdout || '';
    }
    const raw = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    return raw.split('\0').filter(Boolean).join(' ');
  } catch {
    return '';
  }
}

/**
 * 归属检测：
 * - pid 为空或 cmdline 不可读 → 'unknown'（归属未知，不触碰）
 * - cmdline 含本部署 data/redis 目录 → 'ours'（本部署旧实例，可接管）
 * - 其余 → 'foreign'（系统自带 / 其他部署目录，不触碰）
 * @param {number|null} [pid]
 * @param {string} [dataDir] 本部署 redis 数据目录（默认 data/redis）
 * @param {(pid: number) => string} [getCmdline] 注入用（测试）
 * @returns {'ours'|'foreign'|'unknown'}
 */
function detectRedisOwnership(
  pid,
  dataDir = path.join(DATA_DIR, 'redis'),
  getCmdline = getProcessCmdline
) {
  if (!pid) return 'unknown';
  const cmdline = getCmdline(pid);
  if (!cmdline) return 'unknown';
  return isOurRedisInstance(cmdline, dataDir) ? 'ours' : 'foreign';
}

/**
 * 停止单个 redis 进程（**按 PID 精确停止，不发进程组信号**）。
 *
 * 不能复用 lib/proc 的 killTree：killTree 向进程组发信号（-pid），而旧实例
 * 的 pgid 属于其启动方（可能是已退出的旧 PM2 daemon）——`process.kill(-pid)`
 * 会 ESRCH 被误判"成功"但实际未杀掉，端口仍被占，PM2 重启后新 redis-manager
 * 误判"已在运行"进入 keepAlive，旧实例继续无密码运行。
 * - Linux：SIGTERM 发给 pid 本身（redis 优雅退出，落盘 AOF 后再退出）；
 * - Windows：taskkill /PID /T /F（redis 无子进程，/T 等价单进程）。
 * @param {number|null} pid
 * @returns {boolean} 是否已停止（进程已不存在视为已停止）
 */
function stopRedisProcess(pid) {
  if (!pid) return false;
  try {
    if (IS_WINDOWS) {
      const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'pipe',
        windowsHide: true,
      });
      // 退出码：0=成功终止；128=目标不存在（已退出，视为已停止）
      return result.status === 0 || result.status === 128;
    }
    process.kill(pid, 'SIGTERM');
    return true;
  } catch (err) {
    // ESRCH = 进程已不存在，视为已停止；其余（EPERM 等）为真实失败
    return err.code === 'ESRCH';
  }
}

/**
 * 加载 REDIS_PASSWORD（环境变量优先，其次 .env 文件，去引号）。
 * 单一事实源：redis-manager 的实际生效密码与门禁探测必须同源，否则漂移。
 * @param {string} [envPath] .env 路径（测试注入）
 * @returns {string|null}
 */
function loadRedisPassword(envPath = BACKEND_ENV_PATH) {
  if (process.env.REDIS_PASSWORD && process.env.REDIS_PASSWORD.trim()) {
    return process.env.REDIS_PASSWORD.trim();
  }
  if (fs.existsSync(envPath)) {
    try {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('REDIS_PASSWORD=')) {
          let value = trimmed.slice('REDIS_PASSWORD='.length).trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          return value || null;
        }
      }
    } catch {
      // 读取失败按无密码处理
    }
  }
  return null;
}

/**
 * 加载 REDIS_HOST（环境变量优先，其次 .env 文件，默认 127.0.0.1）。
 * @param {string} [envPath] .env 路径（测试注入）
 * @returns {string}
 */
function loadRedisHost(envPath = BACKEND_ENV_PATH) {
  if (process.env.REDIS_HOST && process.env.REDIS_HOST.trim()) {
    return process.env.REDIS_HOST.trim();
  }
  if (fs.existsSync(envPath)) {
    try {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('REDIS_HOST=')) {
          let value = trimmed.slice('REDIS_HOST='.length).trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          if (value) return value;
        }
      }
    } catch {
      // 读取失败用默认值
    }
  }
  return '127.0.0.1';
}

/**
 * redis-cli 可执行文件路径（离线包用捆绑副本，开发环境用 PATH 上的）。
 * 仅 redis-manager 的 stopRedis（shutdown nosave）使用；探测/设密不依赖它。
 * @returns {string}
 */
function getRedisCliPath() {
  return USE_RUNTIME
    ? IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'redis', 'redis-cli.exe')
      : path.join(PLATFORM_DIR, 'redis', 'redis-cli')
    : 'redis-cli';
}

/**
 * RESP 数组命令编码（零依赖，不走 redis-cli / shell，密码含特殊字符也安全）。
 * @param {string[]} args
 * @returns {Buffer}
 */
function respCommand(args) {
  const parts = [Buffer.from(`*${args.length}\r\n`, 'utf8')];
  for (const arg of args) {
    const s = String(arg);
    parts.push(
      Buffer.from(`$${Buffer.byteLength(s, 'utf8')}\r\n${s}\r\n`, 'utf8')
    );
  }
  return Buffer.concat(parts);
}

/**
 * 去掉 RESP 回复行的 + / - 前缀（`ERR ` 等正文保留，分类正则勿锚定行首）。
 * @param {string} line
 * @returns {string}
 */
function respReply(line) {
  if (!line) return '';
  return line[0] === '+' || line[0] === '-' ? line.slice(1) : line;
}

/**
 * 把 AUTH + PING 的回复分类成四态。
 *
 * @param {string[]|null} lines 已收到的回复行（可能不足两条）
 * @returns {{state: 'ok'|'noauth'|'wrongpass'|'unknown', reason: string}|null}
 *   null 表示数据不足（仅收到 0/1 行），调用方继续等待。
 */
function classifyAuthReplies(lines) {
  if (!lines || lines.length === 0) return null;
  const auth = respReply(lines[0]);
  // 向无密码实例发 AUTH 的回复同样随版本而变：
  // 5.0/6.0 → `ERR Client sent AUTH, but no password is set`（实测 5.0.14.1）；
  // 7.0+ → `ERR AUTH <password> called without any password configured. Does redis require auth?`
  if (/without any password/i.test(auth) || /no password is set/i.test(auth)) {
    return { state: 'noauth', reason: '' };
  }
  // "密码错误"的回复随版本/配置而变，三种都得认：
  // 6.0 → `ERR invalid password`；7.x（未开 ACL）→ `ERR Authentication error`；
  // 6.2+/7.x（开 ACL）→ `WRONGPASS invalid username-password pair ...`
  // 漏一种会误判成 unknown → 跳过接管，老无密码实例永远升不上去（部署机即 6.0.16）。
  if (
    /invalid password/i.test(auth) ||
    /Authentication error/i.test(auth) ||
    /^WRONGPASS/i.test(auth)
  ) {
    return { state: 'wrongpass', reason: '' };
  }
  if (lines.length < 2) return null;
  const ping = respReply(lines[1]);
  if (auth === 'OK' && ping === 'PONG') return { state: 'ok', reason: '' };
  return {
    state: 'unknown',
    reason: `探测输出无法识别: ${lines.slice(0, 2).join(' | ')}`.slice(0, 200),
  };
}

/**
 * 向 redis 发送一组命令并收齐回复（原生 TCP，零依赖）。
 * @param {string} host
 * @param {string|number} port
 * @param {string[][]} commands
 * @param {number} [timeoutMs]
 * @returns {Promise<{ok: boolean, lines: string[], reason: string}>}
 */
function respRequest(host, port, commands, timeoutMs = 3000) {
  const target = String(host || '127.0.0.1');
  return new Promise((resolve) => {
    let settled = false;
    let buffer = Buffer.alloc(0);
    const socket = net.connect(Number(port), target);
    const finish = (ok, lines, reason) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, lines, reason });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.write(Buffer.concat(commands.map((args) => respCommand(args))));
    });
    const collect = () =>
      buffer
        .toString('utf8')
        .split('\r\n')
        .filter((l) => l.length > 0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const lines = collect();
      if (lines.length >= commands.length) finish(true, lines, '');
    });
    // 实例可能在收齐回复前就断开（如 AUTH 报错后直接关连接）：以已收到的
    // 回复收尾，否则只能等超时 → 误判 unknown → 跳过设密，老实例升不上去。
    socket.on('end', () => finish(true, collect(), ''));
    socket.on('timeout', () =>
      finish(false, [], `连接超时（${timeoutMs}ms）: ${target}:${port}`)
    );
    socket.on('error', (err) =>
      finish(false, [], `${err.code || '连接失败'}: ${target}:${port}`)
    );
  });
}

/**
 * 探测实例认证状态（AUTH + PING）。
 * @param {string} host
 * @param {string|number} port
 * @param {string} password 期望的密码（.env 的 REDIS_PASSWORD）
 * @param {number} [timeoutMs]
 * @returns {Promise<{state: 'ok'|'noauth'|'wrongpass'|'unknown', reason: string}>}
 */
function probeRedisAuth(host, port, password, timeoutMs = 3000) {
  return respRequest(
    host,
    port,
    [
      ['AUTH', password],
      ['PING'],
    ],
    timeoutMs
  ).then(({ ok, lines, reason }) => {
    if (!ok) return { state: 'unknown', reason };
    const classified = classifyAuthReplies(lines);
    if (classified) return classified;
    return {
      state: 'unknown',
      reason: `数据不足: ${lines.join(' | ')}`.slice(0, 200),
    };
  });
}

/**
 * 运行中给无密码实例设密码（`CONFIG SET requirepass`）。
 * 无密码实例不需要先 AUTH，故不依赖进程归属、不杀进程、不动数据、无停机——
 * 系统装的 redis（apt/systemd）也能安全修复。
 * @param {string} host
 * @param {string|number} port
 * @param {string} password
 * @param {number} [timeoutMs]
 * @returns {Promise<{ok: boolean, reason: string}>}
 */
function setRedisPasswordAtRuntime(host, port, password, timeoutMs = 3000) {
  return respRequest(
    host,
    port,
    [['CONFIG', 'SET', 'requirepass', password]],
    timeoutMs
  ).then(({ ok, lines, reason }) => {
    if (!ok) return { ok: false, reason };
    const reply = respReply(lines[0] || '');
    if (reply === 'OK') return { ok: true, reason: '' };
    return {
      ok: false,
      reason: `设置失败: ${(lines[0] || '无回复').slice(0, 200)}`,
    };
  });
}

/**
 * 把运行期改动写回实例自己的配置文件（`CONFIG REWRITE`）。
 *
 * `CONFIG SET` 只对当前进程生效。系统安装的 redis（apt/systemd，
 * /etc/redis/redis.conf）不持久化的话，systemd 重启后会回到无密码，后端 AUTH
 * 立刻 NOAUTH。REWRITE 让实例把自己当前配置（含刚设的 requirepass）写回 config
 * 文件，重启后仍生效——这是"运行中改密"能做到全自动的关键一步。
 *
 * 关键细节：`CONFIG SET requirepass` 会让**发起该命令的客户端立刻失去认证**，
 * 所以 REWRITE 必须在同一请求里先 AUTH 再发（实测：跨请求发恒回
 * `-NOAUTH Authentication required.`，配置文件里根本不落 requirepass）。
 *
 * 失败不算错：实例由命令行参数启动（我们自己的 redis-manager 走 --requirepass
 * 每次拉起即注入）时没有配置文件，REWRITE 返回 `ERR The server is running
 * without a config file`，调用方只提示不中止。
 *
 * @param {string} host
 * @param {string|number} port
 * @param {string} password 当前生效密码（刚 CONFIG SET 进去的那个，调用方保证非空）
 * @param {number} [timeoutMs]
 * @returns {Promise<{ok: boolean, reason: string}>}
 */
function persistRedisConfig(host, port, password, timeoutMs = 3000) {
  return respRequest(
    host,
    port,
    [
      ['AUTH', password],
      ['CONFIG', 'REWRITE'],
    ],
    timeoutMs
  ).then(({ ok, lines, reason }) => {
    if (!ok) return { ok: false, reason };
    if (respReply(lines[0] || '') !== 'OK') {
      return {
        ok: false,
        reason: `AUTH 失败: ${lines[0] || '无回复'}`.slice(0, 200),
      };
    }
    const reply = respReply(lines[1] || '');
    if (reply === 'OK') return { ok: true, reason: '' };
    return { ok: false, reason: (lines[1] || '无回复').slice(0, 200) };
  });
}

module.exports = {
  isOurRedisInstance,
  getProcessCmdline,
  detectRedisOwnership,
  stopRedisProcess,
  loadRedisPassword,
  loadRedisHost,
  getRedisCliPath,
  respCommand,
  respReply,
  respRequest,
  classifyAuthReplies,
  probeRedisAuth,
  setRedisPasswordAtRuntime,
  persistRedisConfig,
};
