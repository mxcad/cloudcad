/**
 * @fileoverview 版本控制 CLI 探测：失败定性 + 系统回退配对（纯函数，无 IO）
 *
 * 背景：drawing-version-helper 的「版本控制 CLI 可用性」检查原先把 spawnSync 的 error 与
 * stderr 全部丢弃——无论文件不存在、无执行位还是依赖库缺失，统一输出写死的「未找到 svn/mx.exe」
 * （Linux 上点名一个 Windows 可执行文件，真实探测路径只落在结构化 detail 里、从未打印）。
 * 此处只做定性，不做任何 spawn。
 *
 * 依赖方向：lib 只依赖 node 内置。
 */

// runtime 内嵌二进制名与系统 PATH 上的可执行名
const CLI_NAMES = {
  win32: { systemSvn: 'svn.exe', systemSvnadmin: 'svnadmin.exe' },
  linux: { systemSvn: 'svn', systemSvnadmin: 'svnadmin' },
};

/**
 * 系统 PATH 上的 svn / svnadmin 配对名。
 *
 * svn 与 svnadmin 必须**成对**回退：只回退 svn 会让仓库校验（svnadmin info）继续调
 * runtime 下那个恰恰不可用的二进制，产出与主检查自相矛盾的结论。
 *
 * @param {boolean} isWindows 目标平台
 * @returns {{svn: string, svnadmin: string}}
 */
function systemSvnPair(isWindows) {
  const names = isWindows ? CLI_NAMES.win32 : CLI_NAMES.linux;
  return { svn: names.systemSvn, svnadmin: names.systemSvnadmin };
}

/**
 * 定性一次失败的 CLI 探测（`run()` 已判定为不成功）。
 *
 * @param {Object} result run() 的返回（`success/status/stdout/stderr/error`）
 * @param {string} exePath 被探测的路径，用于生成可操作的诊断
 * @returns {{kind: string, detail: string}}
 *   kind ∈ 'missing'（ENOENT）| 'not-executable'（EACCES）| 'run-failed'（进程起来了但失败）
 */
function classifySpawnError(result, exePath) {
  const code = result && result.error ? result.error.code : null;
  if (code === 'ENOENT')
    return { kind: 'missing', detail: `文件不存在: ${exePath}` };
  if (code === 'EACCES') {
    return {
      kind: 'not-executable',
      detail: `无执行权限: ${exePath}（chmod +x）`,
    };
  }
  // 文件存在且可执行，但进程跑不起来：共享库缺失、glibc 太旧、架构不符等。
  // stderr 里就是根因（如 error while loading shared libraries: libaprutil-1.so.0）
  const msg = (result && result.stderr ? result.stderr : '').trim();
  if (msg) {
    return {
      kind: 'run-failed',
      detail: `${exePath} 执行失败: ${msg.slice(0, 120)}`,
    };
  }
  return {
    kind: 'run-failed',
    detail: `${exePath} 执行失败（退出码 ${result ? result.status : 'null'}，无输出）`,
  };
}

module.exports = { systemSvnPair, classifySpawnError };
