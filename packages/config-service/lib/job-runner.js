/**
 * @fileoverview 运维长任务 runner（部署/迁移/启停/日志打包共用）
 *
 * 设计（ADR-0071）：运维中心的长任务一律「后台执行 + 落盘 + 页面轮询」，
 * 禁止在 HTTP 请求内同步执行分钟级操作。串行锁保证同一时刻只有一个长任务
 * （部署与迁移并发会互相踩 PM2/PG）。进度 = stdout/stderr 镜像行（内存环形
 * 缓冲 + 落盘 data/ops/current-task.json），页面刷新/重开/服务重启都能恢复
 * 现场（重启后 running 态标记为 interrupted）。
 *
 * stdout 劫持与 runtime/scripts/lib/deploy-log.js 链式兼容：runner 先装
 * patch，deployMode 内部再装自己的 tee（写完整部署日志文件）——链路为
 * console → deploy-tee（落文件）→ runner-tee（捕获进度行）→ 真实 stdout。
 */

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./constants');

const MAX_LINES = 200;
const MAX_LINE_LEN = 500;

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

function stripAnsi(text) {
  return text.replace(ANSI_RE, '');
}

function defaultTaskFile() {
  return path.join(DATA_DIR, 'ops', 'current-task.json');
}

/**
 * @param {{taskFile?: string, maxLines?: number}} [options]
 *   taskFile 注入用于测试；缺省 data/ops/current-task.json
 */
function createJobRunner({ taskFile = defaultTaskFile(), maxLines = MAX_LINES } = {}) {
  let current = null;

  function persist() {
    try {
      fs.mkdirSync(path.dirname(taskFile), { recursive: true });
      fs.writeFileSync(taskFile, JSON.stringify(current, null, 2));
    } catch {
      // 落盘失败不阻塞任务本身
    }
  }

  function publicState() {
    return current ? { ...current, lines: [...current.lines] } : null;
  }

  function addLine(text) {
    if (!current) return;
    const line = stripAnsi(String(text)).slice(0, MAX_LINE_LEN);
    current.lines.push(line);
    if (current.lines.length > maxLines) {
      current.lines.splice(0, current.lines.length - maxLines);
    }
  }

  function finish(status, error, result) {
    if (!current || current.status !== 'running') return;
    current.status = status;
    current.finishedAt = new Date().toISOString();
    if (error) current.error = error;
    if (result !== undefined) current.result = result;
    persist();
  }

  /**
   * 启动一个长任务。返回 {started:true, task} 或 {started:false, reason:'busy', task}。
   * fn(task) 为异步函数：返回 false 或 {ok:false} 视为失败；抛错视为失败；
   * 其余视为成功（result 记入任务）。
   */
  function startJob({ kind, label, fn }) {
    if (current && current.status === 'running') {
      return { started: false, reason: 'busy', task: publicState() };
    }

    current = {
      kind,
      label,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      result: null,
      logFile: null,
      lines: [],
    };
    persist();

    // 链式捕获 stdout/stderr（在 deploy 自身 tee 之前安装，链在其外层）
    const origOut = process.stdout.write.bind(process.stdout);
    const origErr = process.stderr.write.bind(process.stderr);
    let buf = '';
    const onChunk = (text) => {
      buf += text;
      const parts = buf.split('\n');
      buf = parts.pop();
      for (const line of parts) addLine(line);
    };
    process.stdout.write = (chunk, enc, cb) => {
      try {
        onChunk(typeof chunk === 'string' ? chunk : String(chunk));
      } catch {
        // 进度捕获失败不影响任务
      }
      return origOut(chunk, enc, cb);
    };
    process.stderr.write = (chunk, enc, cb) => {
      try {
        onChunk(typeof chunk === 'string' ? chunk : String(chunk));
      } catch {
        // 进度捕获失败不影响任务
      }
      return origErr(chunk, enc, cb);
    };

    (async () => {
      try {
        const result = await fn(current);
        if (buf) addLine(buf);
        const failed = result === false || result?.ok === false;
        finish(failed ? 'failed' : 'success', null, result === undefined ? null : result);
      } catch (err) {
        if (buf) addLine(buf);
        finish('failed', err.message);
      } finally {
        process.stdout.write = origOut;
        process.stderr.write = origErr;
      }
    })();

    return { started: true, task: publicState() };
  }

  /**
   * 进程重启后遗留的 running 态任务标记为 interrupted（服务器中断）。
   * 典型场景：网页点「完全停止」→ config-service 随之退出 → 下次启动后
   * 页面能看到「任务因服务中断而结束」而不是永远转圈。
   */
  function markInterruptedTasksOnBoot() {
    const persisted = readPersistedTask();
    if (persisted && persisted.status === 'running') {
      current = {
        ...persisted,
        status: 'interrupted',
        finishedAt: new Date().toISOString(),
        error: persisted.error || '任务执行期间服务重启（或被完全停止），已中断',
      };
      persist();
    }
  }

  function readPersistedTask() {
    try {
      return JSON.parse(fs.readFileSync(taskFile, 'utf8'));
    } catch {
      return null;
    }
  }

  return {
    startJob,
    getCurrentTask: publicState,
    readPersistedTask,
    markInterruptedTasksOnBoot,
    isBusy: () => !!(current && current.status === 'running'),
  };
}

// 进程级单例（routes/ops.js 使用）；模块加载即标记上次中断的任务
const jobRunner = createJobRunner();
jobRunner.markInterruptedTasksOnBoot();

module.exports = {
  createJobRunner,
  jobRunner,
  stripAnsi,
};
