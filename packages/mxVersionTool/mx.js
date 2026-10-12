const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const mxPathModule = require('./mxpath');

/**
 * 把多行文本写到临时文件（commit/import/propset 的 `-F <file>` 通道），返回路径。
 * 用后由调用方经 `mx(..., { cleanup: [path] })` 清理。
 *
 * @param {string} command 子命令名（仅用于临时文件命名）
 * @param {string} text 要写入的文本
 * @param {object} [deps] { tmpdir }（测试注入）
 * @returns {string} 临时文件路径
 */
function writeTempText(command, text, deps = {}) {
  const tmpdir = deps.tmpdir || os.tmpdir();
  const tempFile = path.join(
    tmpdir,
    `mx-${command}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}.txt`
  );
  fs.writeFileSync(tempFile, text, 'utf8');
  return tempFile;
}

/**
 * 单一 mx 二进制调用出口（唯一事实源）。
 *
 * 收敛此前散落在 21 个 wrapper 里、每份各抄一遍的共同协议：
 *   - 二进制解析（mxpath；mxadmin 经 opts.binary 覆盖）
 *   - 无 shell 的 argv 数组 spawn（特殊字符不被 shell 解释）+ getSpawnOptions
 *     （Linux 内嵌 runtime 的 LD_LIBRARY_PATH）
 *   - 凭据通道：密码只走 env.SVN_PASSWORD（配 argv 的 --password-from-env），
 *     **绝不**把密码拼进 argv——历史缺陷：mxCat 曾用 `--password <pw>` 上 argv，
 *     进程列表可见，与 ADR-0073 对 redis-cli 的同一顾虑冲突
 *   - stdout 收集（utf8 字符串 / Buffer + maxBuffer 超限 SIGKILL）
 *   - 退出码 → 结构化错误（message = stderr+stdout，附 .code/.stderr/.stdout）
 *   - 临时文件清理（opts.cleanup）
 *
 * argv 由调用方按各子命令的**精确顺序**拼好（含 --username / --password-from-env
 * 的位置——各命令的全局选项与命令选项顺序不同，统一挪位会改变真实 SVN 客户端的
 * 解析行为）。命令特定的领域规则（如 mxLog 把 E160013 当成功）留在各 wrapper。
 *
 * @param {string} command 子命令（add/commit/cat/…；--version 亦可）
 * @param {string[]} args 已拼好的参数（不含子命令）
 * @param {object} [opts]
 * @param {string} [opts.binary]  可执行文件（默认 mxpath；mxadmin 用 mxadminPath）
 * @param {string} [opts.password]  走 env.SVN_PASSWORD，绝不上 argv（wrapper 已在 args 里加 --password-from-env）
 * @param {boolean} [opts.buffer]    以 Buffer 收集 stdout（默认 utf8 字符串）
 * @param {number} [opts.maxBuffer]  stdout 字节上限，超限 SIGKILL 并 reject
 * @param {string[]} [opts.cleanup]  结束后删除的临时文件
 * @param {object} [deps]  可注入（测试）：{ spawn, tmpdir }
 * @returns {Promise<string|Buffer>}
 */
function mx(command, args, opts = {}, deps = {}) {
  const spawnFn = deps.spawn || spawn;
  const binary = opts.binary || mxPathModule.default;
  const argv = [command, ...args];

  return new Promise((resolve, reject) => {
    const spawnOptions = mxPathModule.getSpawnOptions();
    const env = { ...(spawnOptions.env || process.env) };
    if (opts.password) env.SVN_PASSWORD = opts.password;
    spawnOptions.env = env;
    if (opts.maxBuffer != null) spawnOptions.maxBuffer = opts.maxBuffer;

    const child = spawnFn(binary, argv, spawnOptions);
    const chunks = [];
    let stderr = '';
    let bytes = 0;
    let settled = false;

    const cleanup = () => {
      for (const file of opts.cleanup || []) {
        try {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        } catch (e) {
          /* ignore */
        }
      }
    };

    child.stdout.on('data', (c) => {
      if (opts.maxBuffer != null) {
        bytes += c.length;
        if (bytes > opts.maxBuffer) {
          if (settled) return;
          settled = true;
          try {
            child.kill('SIGKILL');
          } catch (e) {
            /* ignore */
          }
          cleanup();
          const error = new Error(`mx ${command} stdout 超过 maxBuffer 限制`);
          error.code = 'MAX_BUFFER';
          reject(error);
          return;
        }
      }
      chunks.push(c);
    });
    child.stderr.on('data', (c) => {
      stderr += c.toString('utf8');
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (code === 0) {
        const out = Buffer.concat(chunks);
        resolve(opts.buffer ? out : out.toString('utf8'));
        return;
      }
      const out = Buffer.concat(chunks).toString('utf8');
      const error = new Error(
        [stderr, out].filter(Boolean).join('\n').trim() ||
          `mx ${command} 退出码 ${code}`
      );
      error.code = code;
      error.stderr = stderr;
      error.stdout = out;
      reject(error);
    });
  });
}

module.exports = { mx, writeTempText };
