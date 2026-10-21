/**
 * @fileoverview 命令执行封装（纯能力层）
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - runCommand：cli.js:377-388
 * - runCommandWithProgress：cli.js:393-435
 * - runPnpm：cli.js:437-463
 * - runPm2：cli.js:465-500
 * - runInNewWindow：cli.js:502-523
 *
 * 依赖方向铁律：lib 只允许 require 其他 lib 或独立模块，禁止 require commands。
 */

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const {
  IS_WINDOWS,
  IS_LINUX,
  USE_RUNTIME,
  PROJECT_ROOT,
  PLATFORM_DIR,
  NODE_EXE,
  PM2_JS,
  PNPM_JS,
  PM2_HOME,
} = require('./context');

const { log } = require('./logger');

/**
 * 终止一个进程及其整棵子进程树。
 *
 * Step A-2（前台真修复）核心原语：解决 Windows 双层进程孤儿（P2.2）与 Linux 孤儿进程。
 * - Windows：进程以 `shell:false` 直 spawn（无 cmd.exe 包装层），此处用
 *   `taskkill /PID <pid> /T /F` 兜底整树强杀。
 * - Linux：进程以 `detached:true` 建独立进程组，此处向 `-pgid` 发 SIGTERM 整组回收；
 *   SIGTERM 无法收尾时由调用方在超时后再次调用（可带 force=true 走 SIGKILL）。
 *
 * @param {number|string} pid 根进程 PID
 * @param {Object} [options]
 * @param {boolean} [options.force] 强制 SIGKILL（Linux 有效；Windows taskkill /F 恒强制）
 * @param {boolean} [options.silent] 抑制失败告警
 * @returns {boolean} 是否已向目标进程发出终止信号
 */
function killTree(pid, options = {}) {
  if (!pid) return false;
  const { force = false, silent = false } = options;

  try {
    if (IS_WINDOWS) {
      const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'pipe',
        windowsHide: true,
      });
      // taskkill 退出码：0=成功终止；128=找不到目标进程（已不存在，视为已清理）；
      // 其余非 0（如 5=拒绝访问/权限不足）= 真实失败，须返回 false，避免掩盖。
      if (result.status === 0 || result.status === 128) {
        return true;
      }
      if (!silent) {
        log(
          'yellow',
          `[警告] taskkill 终止进程树失败 (PID ${pid})，退出码 ${result.status}: ${(result.stderr || result.stdout || '').toString().trim()}`
        );
      }
      return false;
    }

    // Linux / 其他 POSIX：向进程组发信号（detached:true spawn 后 pid === pgid）
    const pgid = typeof pid === 'number' ? -pid : -parseInt(pid, 10);
    try {
      process.kill(pgid, force ? 'SIGKILL' : 'SIGTERM');
    } catch (err) {
      // ESRCH = 进程组已不存在（已退出），视为成功
      if (err.code !== 'ESRCH') {
        throw err;
      }
    }
    return true;
  } catch (err) {
    if (!silent) {
      log('yellow', `[警告] 终止进程树失败 (PID ${pid}): ${err.message}`);
    }
    return false;
  }
}

/**
 * 注入离线 node 目录到 PATH。
 *
 * 离线部署包（USE_RUNTIME）中 node 未安装到系统 PATH，只存在于
 * runtime/<platform>/node/node.exe。pnpm exec 内部会通过 cmd 调用
 * node_modules/.bin/*.cmd（如 prisma.cmd），其内容依赖 PATH 中的 `node`，
 * 若不注入则报 "'node' 不是内部或外部命令"（实例：migrate deploy）。
 * runPnpm/runPm2 已注入，此处为 runCommand/runCommandWithProgress 统一兜底。
 */
function withNodePath(env) {
  if (!USE_RUNTIME) return env;
  const nodeDir = path.dirname(NODE_EXE);
  const existingPath = env.PATH || '';
  const parts = existingPath.split(path.delimiter).filter(Boolean);
  if (!parts.some((p) => p.toLowerCase() === nodeDir.toLowerCase())) {
    parts.unshift(nodeDir);
  }
  return { ...env, PATH: parts.join(path.delimiter) };
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || PROJECT_ROOT,
    stdio: options.silent ? 'pipe' : 'inherit',
    shell: IS_WINDOWS,
    env: withNodePath({
      ...process.env,
      ...options.env,
    }),
    // 透传调用方超时（spawnSync 语义：超时杀子进程、status 为 null → 返回 false）；
    // 不传保持原「无超时」行为
    timeout: options.timeout,
  });
  return result.status === 0;
}

/**
 * 运行命令并捕获输出，实时显示进度
 */
function runCommandWithProgress(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: IS_WINDOWS,
      env: withNodePath({
        ...process.env,
        ...options.env,
      }),
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      // 实时输出
      if (!options.silent) {
        process.stdout.write(output);
      }
    });

    child.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      // 实时输出
      if (!options.silent) {
        process.stderr.write(output);
      }
    });

    child.on('close', (code) => {
      resolve({
        success: code === 0,
        exitCode: code,
        stdout,
        stderr,
      });
    });
  });
}

/**
 * pnpm 直调 prisma 判定（纯函数，可单测）。
 *
 * backend 包没有名为 `prisma` 的 script（全仓无任何一个包有），
 * `pnpm --filter backend prisma …` 会被 pnpm 静默丢弃且 **exit 0**——
 * 调用方拿到的 success 是「什么都没跑」。正确写法是 `pnpm --filter backend exec prisma …`。
 * 实例：hasPendingMigrations 曾因此恒判「无待应用迁移」而跳过迁移前备份（eb6b08c）。
 *
 * 判据：`prisma` 出现时紧邻前一 token 必须是 `exec` 或 `run`。
 * 放行 `run` 是因为 `pnpm -F x run <script>` 缺 script 时会正常报错，
 * 不属「静默成功」这类；裸跟在后面的 `prisma` 才是。
 * args 元素本身也可能是整条 shell 命令串（模板串），故先按空白/逗号分词。
 * @param {string[]} args pnpm 参数数组
 * @returns {boolean} true = 裸直调（恒必失败）
 */
function isDirectPrismaCall(args) {
  const VALID_PRECEDERS = new Set(['exec', 'run']);
  // 必须先跨参数摊平再找前驱：`['exec', 'prisma']` 里 exec 与 prisma 是相邻的
  // 两个数组元素，按元素逐个分词会取不到前驱而误判。
  const tokens = (Array.isArray(args) ? args : [args])
    .map((a) => String(a).split(/[\s,]+/))
    .flat()
    .filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'prisma' && !VALID_PRECEDERS.has(tokens[i - 1])) {
      return true;
    }
  }
  return false;
}

function runPnpm(args, options = {}) {
  if (isDirectPrismaCall(args)) {
    // throw 而非 return false：这种调用永远不会成功，返回 false 只会让调用方打出
    // 自己的泛化「命令失败」再走失败路径——而 pnpm 的 exit 0 早已把「失败」伪装成
    // 「成功」，泛化文案会让排查者继续在错误方向上找。
    throw new Error(
      '[runPnpm] pnpm 直调 prisma 恒为静默 no-op：backend 包没有名为 prisma 的 script，' +
        'pnpm 会丢弃该子命令且 exit 0。\n' +
        `  实际调用: pnpm ${args.join(' ')}\n` +
        '  正确写法: pnpm --filter <包> exec prisma …\n' +
        '  （见 migrate.js hasPendingMigrations 内的同型注释）'
    );
  }

  // 设置 PATH：包含 node bin 目录和 node_modules/.bin
  const nodeBinDir = IS_LINUX
    ? path.join(PLATFORM_DIR, 'node', 'bin')
    : path.join(PLATFORM_DIR, 'node');

  const nodeModulesBinDirs = [
    path.join(PROJECT_ROOT, 'node_modules', '.bin'),
    path.join(PROJECT_ROOT, 'packages', 'backend', 'node_modules', '.bin'),
  ];

  const existingPath = process.env.PATH || '';
  const pathParts = [nodeBinDir, ...nodeModulesBinDirs, existingPath];
  const newPath = pathParts.join(path.delimiter);

  // 创建独立的环境变量对象，不影响 process.env
  const env = Object.assign({}, process.env, options.env, {
    PATH: newPath,
    COREPACK_ENABLE: '0',
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
  });

  if (PNPM_JS && fs.existsSync(PNPM_JS)) {
    return runCommand(NODE_EXE, [PNPM_JS, ...args], { ...options, env });
  }
  return runCommand('pnpm', args, { ...options, env });
}

function runPm2(args, options = {}) {
  if (!PM2_JS || !fs.existsSync(PM2_JS)) {
    log('red', '[错误] PM2 不可用');
    return false;
  }

  // 用「内嵌 node + pm2 脚本」的绝对路径调用（部署包根目录不再有 pm2 包装脚本）；
  // node 目录前置到 PATH 由 runCommand 的 withNodePath 统一处理——PM2 daemon
  // 靠 PATH 解析 node 来 spawn 子进程。
  return runCommand(NODE_EXE, [PM2_JS, ...args], {
    ...options,
    env: {
      ...options.env,
      PM2_HOME,
    },
  });
}

/**
 * 解析 pm2 jlist 的 stdout 为进程数组（纯函数，可单测）。
 *
 * 算法与 packages/config-service/lib/pm2.js 的 parsePm2JlistOutput 保持一致：
 * pm2 冷启动（守护进程被杀后首次调用）时 jlist 退出码为 0、stderr 为空，但 stdout
 * 会混入横幅后才是 JSON 数组——两种实测形态：① ASCII 横幅（不含 '['）+ JSON；
 * ② "[PM2] Spawning PM2 daemon ..."/"[PM2] PM2 Successfully daemonized" 行（以 '['
 * 开头）+ JSON。整段 JSON.parse 与「首个 '[' 起截取」都会被形态 ② 打炸，故从最后一个
 * ']' 往前逐个 '[' 回溯，取第一个能完整解析的数组段。
 *
 * 与 config-service 侧的唯一差异在失败语义：本处解析失败/空输出返回 []（「无 PM2 /
 * 查询失败」的安全语义——stop 据此不得升级为 stop all，见 stop.test.js 的守恒断言）；
 * config-service 侧解析失败抛错、由调用方转 success:false。改任一侧的回溯算法须同步另一侧。
 * @param {string} stdout pm2 jlist 的原始 stdout
 * @returns {Array} 进程数组；无 PM2 / 空输出 / 解析失败一律 []
 */
function parsePm2JlistOutput(stdout) {
  const text = (stdout || '').trim();
  if (!text) return [];
  const end = text.lastIndexOf(']');
  if (end < 0) return [];
  let start = text.lastIndexOf('[', end - 1);
  while (start >= 0) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      start = text.lastIndexOf('[', start - 1);
    }
  }
  return [];
}

/**
 * 查询 PM2 当前托管的所有 app 状态（jlist JSON）。
 * @returns {Array<{name:string, pm2_env:{status:string}, pid:number}>} 空数组表示无 PM2 或查询失败
 */
function getPm2StatusList() {
  if (!PM2_JS || !fs.existsSync(PM2_JS)) return [];
  const result = spawnSync(NODE_EXE, [PM2_JS, 'jlist'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...process.env, PM2_HOME },
    shell: IS_WINDOWS,
    windowsHide: true,
    timeout: 10000,
  });
  if (result.status !== 0) return [];
  return parsePm2JlistOutput(result.stdout);
}

/**
 * 查询某个 PM2 app 的运行状态。
 * @param {string} name app 名
 * @returns {'online'|'stopped'|'errored'|'launching'|'unknown'}
 */
function getPm2AppStatus(name) {
  const list = getPm2StatusList();
  const app = list.find((a) => a.name === name);
  if (!app) return 'unknown'; // 未注册
  const status = app.pm2_env && app.pm2_env.status;
  return ['online', 'stopped', 'errored', 'launching'].includes(status)
    ? status
    : 'unknown';
}

/**
 * 获取当前 PM2 中处于 online（正在运行）的 app 名集合。
 * @returns {Set<string>}
 */
function getPm2OnlineApps() {
  const list = getPm2StatusList();
  const online = new Set();
  for (const app of list) {
    const status = app.pm2_env && app.pm2_env.status;
    if (status === 'online') online.add(app.name);
  }
  return online;
}

/**
 * 解析 /proc/net/tcp{,6} 文本，取 LISTEN 状态且本地端口匹配的 socket inode 集合。
 *
 * 行格式（首行为表头，跳过）：
 *   sl local_address rem_address st tx:rx tr:when retrnsmt uid timeout inode
 * local_address 为十六进制 `IP:PORT`（tcp6 的 IP 段为 32 位），st=0A 即 LISTEN，
 * inode 为第 10 列。纯函数，便于用真实格式 fixture 跨平台单测。
 * @param {string|null} [tcpContent] /proc/net/tcp 内容
 * @param {string|null} [tcp6Content] /proc/net/tcp6 内容（部分内核无此文件）
 * @param {number} port 目标端口（十进制）
 * @returns {Set<string>} 匹配的 socket inode 集合（无匹配为空集）
 */
function parseListenInodes(tcpContent, tcp6Content, port) {
  const inodes = new Set();
  for (const content of [tcpContent, tcp6Content]) {
    if (!content) continue;
    const lines = content.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].trim().split(/\s+/);
      if (cols.length < 10) continue;
      if (cols[3] !== '0A') continue; // 0A = LISTEN
      const local = cols[1];
      const idx = local.lastIndexOf(':');
      if (idx < 0) continue;
      const localPort = parseInt(local.slice(idx + 1), 16);
      if (localPort !== port) continue;
      inodes.add(cols[9]);
    }
  }
  return inodes;
}

/**
 * 在 /proc/<pid>/fd 中查找持有指定 socket inode 的进程（注入式，可 0 依赖单测）。
 * 其他用户进程的 fd 目录不可读（EACCES）→ 跳过：本原语只能定位**当前用户
 * （或 root 下全量）**的进程，跨用户进程定位不到——调用方据此判定"占用者
 * 属于其他用户"。
 * @param {Set<string>} inodes 目标 socket inode 集合
 * @param {{listPids: () => string[], listFds: (pid: string) => string[], readFdLink: (pid: string, fd: string) => string}} io
 * @returns {number|null} 首个持有目标 socket 的 PID；无匹配返回 null
 */
function findPidByInodes(inodes, { listPids, listFds, readFdLink }) {
  if (!inodes || inodes.size === 0) return null;
  let pids;
  try {
    pids = listPids();
  } catch {
    return null;
  }
  for (const pid of pids) {
    let fds;
    try {
      fds = listFds(pid);
    } catch {
      continue; // 其他用户进程 fd 目录不可读 → 跳过
    }
    for (const fd of fds) {
      let link;
      try {
        link = readFdLink(pid, fd);
      } catch {
        continue;
      }
      const m = /^socket:\[(\d+)\]$/.exec(link);
      if (m && inodes.has(m[1])) return Number(pid);
    }
  }
  return null;
}

/**
 * /proc 兜底探测：零外部依赖（ss/lsof/netstat 全缺的精简镜像也能用）。
 * 先读 /proc/net/tcp{,6} 拿目标端口的 LISTEN socket inode，再扫 /proc/<pid>/fd
 * 的 `socket:[inode]` 链接定位进程。只能看到当前用户（root 下全量）的进程。
 * @param {number} port
 * @returns {{pid: number|null, scanned: boolean}}
 *   pid     定位到的 PID；无匹配/不可用返回 null
 *   scanned /proc 扫描是否实际执行过（/proc/net/tcp 可读且 /proc 目录可枚举）——
 *           调用方据此区分"确认跨用户"（scanned=true 且无 PID）与"手段不足"
 */
function getPidByPortViaProc(port) {
  let tcpContent = null;
  let tcp6Content = null;
  try {
    tcpContent = fs.readFileSync('/proc/net/tcp', 'utf8');
  } catch {
    /* /proc 不可用 */
  }
  try {
    tcp6Content = fs.readFileSync('/proc/net/tcp6', 'utf8');
  } catch {
    /* 部分内核无 tcp6 */
  }
  if (tcpContent == null && tcp6Content == null) {
    return { pid: null, scanned: false };
  }
  const inodes = parseListenInodes(tcpContent, tcp6Content, port);
  if (inodes.size === 0) return { pid: null, scanned: true };
  let pids;
  try {
    pids = fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n));
  } catch {
    return { pid: null, scanned: false };
  }
  const pid = findPidByInodes(inodes, {
    listPids: () => pids,
    listFds: (p) => fs.readdirSync(`/proc/${p}/fd`),
    readFdLink: (p, fd) => fs.readlinkSync(`/proc/${p}/fd/${fd}`),
  });
  return { pid, scanned: true };
}

/**
 * 检测指定端口的占用者（PID + 探测置信度）。
 *
 * 探测顺序：Windows 走 netstat -ano（全量可见，无用户边界）；Linux 依次
 * ss → lsof → netstat → /proc 兜底（零外部依赖）。
 *
 * @param {number} port
 * @returns {{pid: number|null, fullScanDone: boolean}}
 *   pid          占用进程 PID；端口空闲/无法定位返回 null
 *   fullScanDone 全量可见性扫描是否执行过（Linux=/proc 扫描实际执行，
 *                Windows=netstat 成功且看到了该端口的 socket）。
 *                true 且 pid 为 null ⇒ 占用者必然不是当前用户（root 下：不是
 *                任何本机进程）的进程——调用方可安全按"外部实例"处置；
 *                false ⇒ 手段不足，无法排除是本部署自己的实例，调用方必须
 *                中止而非猜测。
 */
function detectPortOwner(port) {
  if (IS_WINDOWS) {
    let res;
    try {
      res = spawnSync('netstat', ['-ano', '-p', 'TCP'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 8000,
      });
    } catch {
      return { pid: null, fullScanDone: false };
    }
    if (res.error) return { pid: null, fullScanDone: false };
    const line = (res.stdout || '')
      .split('\n')
      .find((l) => l.includes(`:${port}`) && l.includes('LISTENING'));
    if (!line) return { pid: null, fullScanDone: false };
    const parts = line.trim().split(/\s+/);
    const pid = parseInt(parts[parts.length - 1], 10);
    if (Number.isFinite(pid) && pid > 0) return { pid, fullScanDone: true };
    // socket 可见但 PID 列解析不出：扫描本身是全量的，按已穷尽处理
    return { pid: null, fullScanDone: true };
  }
  // Linux：ss 优先（iproute2，最小化发行版默认带，无 lsof 也能探测），
  // lsof / netstat 兜底；统一 timeout 防探测命令挂起
  let pid = null;
  try {
    const ss = spawnSync('ss', ['-tlnp'], { encoding: 'utf8', timeout: 8000 });
    const ssLine = (ss.stdout || '')
      .split('\n')
      .find((l) => l.includes(`:${port}`) && l.includes('LISTEN'));
    if (ssLine) {
      const m = /pid=(\d+)/.exec(ssLine);
      if (m) pid = parseInt(m[1], 10);
    }
    if (pid == null) {
      const lsof = spawnSync('lsof', ['-t', '-i', `:${port}`, '-sTCP:LISTEN'], {
        encoding: 'utf8',
        timeout: 8000,
      });
      const lsofPid = parseInt((lsof.stdout || '').trim(), 10);
      if (Number.isFinite(lsofPid) && lsofPid > 0) pid = lsofPid;
    }
    if (pid == null) {
      const netstat = spawnSync('netstat', ['-tlnp'], {
        encoding: 'utf8',
        timeout: 8000,
      });
      const line = (netstat.stdout || '')
        .split('\n')
        .find((l) => l.includes(`:${port}`) && l.includes('LISTEN'));
      if (line) {
        const match = line.match(/\s(\d+)\/([^\s]+)\s*$/);
        if (match) {
          const n = parseInt(match[1], 10);
          if (Number.isFinite(n) && n > 0) pid = n;
        }
      }
    }
  } catch {
    /* 探测命令异常 → 落到 /proc 兜底 */
  }
  if (pid != null) return { pid, fullScanDone: true };
  // /proc 兜底：覆盖三工具全缺的精简镜像；非 root 下只能看到当前用户的进程，
  // 故"扫描执行过但无 PID"可确证占用者属于其他用户（如系统装的 redis）。
  const viaProc = getPidByPortViaProc(port);
  if (viaProc.pid != null) return { pid: viaProc.pid, fullScanDone: true };
  return { pid: null, fullScanDone: viaProc.scanned };
}

/**
 * 检测指定端口当前被哪个 PID 占用。
 * @param {number} port
 * @returns {number|null} 占用进程的 PID；端口空闲返回 null；检测失败返回 null
 */
function getPidByPort(port) {
  return detectPortOwner(port).pid;
}

/**
 * 判断某 PID 是否为当前 node 进程树的一部分（用于端口冲突时判断占用者是否本 CLI 相关）。
 * @param {number} pid
 * @returns {boolean}
 */
function isNodePid(pid) {
  if (!pid) return false;
  try {
    if (IS_WINDOWS) {
      const res = spawnSync(
        'tasklist',
        ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
        {
          encoding: 'utf8',
          windowsHide: true,
        }
      );
      return /node\.exe/i.test(res.stdout || '');
    }
    const res = spawnSync('ps', ['-o', 'comm=', '-p', String(pid)], {
      encoding: 'utf8',
    });
    return /node/i.test((res.stdout || '').trim());
  } catch {
    return false;
  }
}

/**
 * 获取某进程的可执行文件绝对路径。
 * 用于区分"本部署包残留的基础服务进程"（runtime/<platform>/ 下）与"外部系统服务"，
 * 避免端口冲突时误杀外部 PG/Redis。
 * @param {number} pid
 * @returns {string|null}
 */
function getProcessExecutablePath(pid) {
  if (!pid) return null;
  try {
    if (IS_WINDOWS) {
      // WMIC 在部分系统已弃用，PowerShell Get-CimInstance 更可靠；两者都试
      const psRes = spawnSync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ExecutablePath`,
        ],
        { encoding: 'utf8', windowsHide: true, timeout: 8000 }
      );
      const psPath = (psRes.stdout || '').trim();
      if (psPath) return psPath;
      const wmicRes = spawnSync(
        'wmic',
        [
          'process',
          'where',
          `ProcessId=${pid}`,
          'get',
          'ExecutablePath',
          '/value',
        ],
        { encoding: 'utf8', windowsHide: true, timeout: 8000 }
      );
      const m = /ExecutablePath=([^\r\n]+)/.exec(wmicRes.stdout || '');
      return m ? m[1].trim() : null;
    }
    // Linux：/proc/<pid>/exe 符号链接
    return fs.existsSync(`/proc/${pid}/exe`)
      ? fs.realpathSync(`/proc/${pid}/exe`)
      : null;
  } catch {
    return null;
  }
}

/**
 * 判断某进程是否属于本 CloudCAD 部署包 runtime（可执行文件路径在 PROJECT_ROOT/runtime/ 下）。
 * 部署包自带的 PG/Redis/cooperate 二进制均位于 runtime/<platform>/ 下；纯开发环境（无 runtime）
 * 的进程来自系统 PATH，不在此目录，故不会被误判。
 * @param {number} pid
 * @returns {boolean}
 */
function isOurRuntimeProcess(pid) {
  const exe = getProcessExecutablePath(pid);
  if (!exe) return false;
  // 统一分隔符（\ 与 / 混用时也能正确匹配），再比较前缀
  const normalize = (p) =>
    p.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
  const runtimeDirNorm = normalize(path.join(PROJECT_ROOT, 'runtime'));
  const exeNorm = normalize(exe);
  return exeNorm.startsWith(runtimeDirNorm + '/') || exeNorm === runtimeDirNorm;
}

/**
 * 判断某进程是否属于**另一个** CloudCAD 部署目录的基础服务。
 *
 * 部署包的服务二进制（postgres.exe / redis-server.exe / node.exe 等）均位于
 * <部署目录>/runtime/<platform>/ 下。可执行文件路径含 /runtime/<platform>/ 段
 * 但不在本目录 runtime/ 下 → 属于同机另一个部署目录的服务（实例：目录 A 的
 * PG 运行中，目录 B 部署时 5432 被 A 的 postgres 占用）。系统自带的 PG/Redis
 *（Program Files / /usr 等）不含该段，不会被误判。
 *
 * 静默复用另一目录的服务会导致本目录 .env 密钥（PII/JWT 等）与对方存量数据
 * 错位（PII 回填校验拦截部署），故调用方须询问用户"停止对方服务起自己的"或
 * 中止部署，而非静默接管。
 * @param {number} pid
 * @returns {boolean}
 */
function isForeignCloudCadRuntimeProcess(pid) {
  const exe = getProcessExecutablePath(pid);
  if (!exe) return false;
  const normalize = (p) =>
    p.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
  const exeNorm = normalize(exe);
  const ourRuntimeNorm = normalize(path.join(PROJECT_ROOT, 'runtime'));
  // 本目录 runtime 下的进程归 isOurRuntimeProcess 处理（残留清理）
  if (exeNorm.startsWith(ourRuntimeNorm + '/')) return false;
  return /\/runtime\/(windows|linux|macos)\//.test(exeNorm);
}

/**
 * 一次性读取全机进程的 pid / 名称 / 命令行 / 可执行文件路径。
 *
 * 判断"停止后是否还有进程占用本部署目录"必须扫进程表：Windows 上 PM2 用
 * SIGINT/SIGTERM 终止 node 包装进程时不会执行其信号处理器，pg-manager 里
 * `process.on('SIGINT')` 中的 pg_ctl stop 因此永不执行，而 postgres 由
 * pg_ctl 直接 spawn（不是包装进程的子进程），于是 postgres.exe 残留并锁定
 * 数据目录。已有 getProcessExecutablePath 是逐 pid 起一个 powershell 进程，
 * 此处一次取全。
 * 查询失败**抛错**，不返回空表：空表在 stop 语境里语义是"没有残留进程 =
 * 可以删包"，而查询失败语义是"不知道有没有残留"。两者共用 [] 会让 stop 在
 * 探测失效时谎报成功，卸载脚本接着删一个仍被占用的目录——正是本原语要防的
 * 失败模式（调用方 commands/stop.js 捕获后按"未停干净"处理，fail-closed）。
 * @returns {Array<{pid:number,name:string,cmdline:string,exe:string}>}
 * @throws {Error} 进程表查询失败（powershell 非零退出/超时、JSON 解析失败、/proc 不可读）
 */
function getProcessCmdlines() {
  if (IS_WINDOWS) {
    // shell 必须为 false：脚本含 | 与括号，交给 cmd.exe 解析会被拆成碎片命令
    // （'Select-Object' 不是内部或外部命令，退出码 255、stdout 空）。
    const res = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine,ExecutablePath | ConvertTo-Json -Compress -Depth 1',
      ],
      {
        encoding: 'utf8',
        // 进程多时 JSON 会超 spawnSync 默认 1MB maxBuffer，截断后 JSON.parse
        // 失败。这里显式放大——截断会让 stop 因解析失败误判"未停干净"。
        maxBuffer: 16 * 1024 * 1024,
        shell: false,
        timeout: 20000,
        windowsHide: true,
      }
    );
    if (res.error) throw res.error;
    if (res.status !== 0) {
      throw new Error(
        `进程表查询失败（powershell 退出码 ${res.status}）: ` +
          String(res.stderr || '').trim().slice(0, 200)
      );
    }
    let rows;
    try {
      rows = JSON.parse((res.stdout || '').trim() || '[]');
    } catch (err) {
      throw new Error(`进程表 JSON 解析失败: ${err.message}`);
    }
    return (Array.isArray(rows) ? rows : [rows])
      .filter((r) => r && Number.isFinite(Number(r.ProcessId)))
      .map((r) => ({
        pid: Number(r.ProcessId),
        name: String(r.Name || ''),
        cmdline: String(r.CommandLine || ''),
        exe: String(r.ExecutablePath || ''),
      }));
  }

  const out = [];
  for (const dir of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(dir)) continue;
    let raw;
    try {
      raw = fs.readFileSync(`/proc/${dir}/cmdline`, 'utf8');
    } catch {
      // 进程在读 cmdline 的瞬间退出是正常现象，跳过而不是让整次查询失败
      continue;
    }
    const args = raw.split('\0').filter(Boolean);
    if (args.length === 0) continue;
    let exe = '';
    try {
      exe = fs.readlinkSync(`/proc/${dir}/exe`);
    } catch {
      /* exe 不可读时留空 */
    }
    out.push({
      pid: Number(dir),
      name: path.basename(args[0]),
      cmdline: args.join(' '),
      exe,
    });
  }
  return out;
}

function runInNewWindow(title, command, args) {
  if (IS_WINDOWS) {
    const cmd =
      args.length > 0
        ? `start "${title}" cmd /k "${command} ${args.join(' ')}"`
        : `start "${title}" cmd /k "${command}"`;
    spawn('cmd', ['/c', cmd], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
      shell: true,
    }).unref();
  } else {
    // Linux: 使用 gnome-terminal 或 xterm
    const terminal = process.env.TERM_PROGRAM || 'xterm';
    spawn(terminal, ['-e', `${command} ${args.join(' ')}`], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
    }).unref();
  }
}

module.exports = {
  runCommand,
  runCommandWithProgress,
  isDirectPrismaCall,
  runPnpm,
  runPm2,
  runInNewWindow,
  killTree,
  getPm2StatusList,
  parsePm2JlistOutput,
  getPm2AppStatus,
  getPm2OnlineApps,
  getPidByPort,
  detectPortOwner,
  parseListenInodes,
  findPidByInodes,
  isNodePid,
  getProcessExecutablePath,
  isOurRuntimeProcess,
  isForeignCloudCadRuntimeProcess,
  getProcessCmdlines,
};
