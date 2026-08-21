const { spawn } = require('child_process');
const { SVN_CONFIG } = require('../lib/constants');
const { log } = require('../lib/utils');

/**
 * SVN 操作代理
 * 通过 mx 命令行工具封装 SVN 操作
 *
 * 安全说明：使用 spawn（非 exec）传参数数组，避免 filePath/message
 * 中的特殊字符被 shell 解释（命令注入）。
 */
class SvnAgent {
  _run(args, { encoding = 'utf8', timeout = 30000, maxBuffer } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [SVN_CONFIG.mxToolPath, ...args], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const stdout = [];
      const stderr = [];
      let stdoutBytes = 0;
      let timer;
      const fail = (err) => {
        clearTimeout(timer);
        reject(err);
      };
      child.stdout.on('data', (c) => {
        // spawn 无内置 maxBuffer，手动统计 stdout 字节数并在超限时中止
        // （等价于 exec 的 maxBuffer 语义，cat 传 50MB 即在此生效）
        if (maxBuffer != null && stdoutBytes + c.length > maxBuffer) {
          child.kill('SIGKILL');
          fail(new Error('SVN 命令 stdout 超过 maxBuffer 限制'));
          return;
        }
        stdout.push(c);
        stdoutBytes += c.length;
      });
      child.stderr.on('data', (c) => stderr.push(c));
      timer = setTimeout(() => {
        child.kill('SIGKILL');
        fail(new Error('SVN 命令超时'));
      }, timeout);
      child.on('error', (err) => fail(err));
      child.on('close', (code) => {
        clearTimeout(timer);
        const out = Buffer.concat(stdout);
        const err = Buffer.concat(stderr);
        if (code === 0) return resolve(encoding === 'buffer' ? out : out.toString(encoding));
        const message = err.length
          ? err.toString('utf8').trim()
          : `SVN 命令退出码 ${code}`;
        reject(new Error(message));
      });
    });
  }

  async commit(filePath, message) {
    try {
      const stdout = await this._run(['commit', filePath, message], {
        timeout: 30000,
      });
      log(`[SVN] 提交成功: ${filePath}`);
      return { success: true, output: String(stdout).trim() };
    } catch (err) {
      log(`[SVN] 提交失败: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async history(filePath) {
    try {
      const stdout = await this._run(['history', filePath], {
        timeout: 30000,
      });
      const lines = String(stdout).trim().split('\n').filter(Boolean);
      return lines.map((line) => {
        const parts = line.split('|').map((s) => s.trim());
        return {
          revision: parseInt(parts[0], 10) || 0,
          author: parts[1] || '',
          timestamp: parts[2] || '',
          message: parts.slice(3).join('|') || '',
        };
      });
    } catch (err) {
      log(`[SVN] 获取历史失败: ${err.message}`);
      return [];
    }
  }

  async cat(filePath, revision) {
    try {
      const stdout = await this._run(['cat', filePath, '-r', String(revision)], {
        timeout: 30000,
        encoding: 'buffer',
        maxBuffer: 50 * 1024 * 1024,
      });
      return stdout;
    } catch (err) {
      log(`[SVN] cat 失败: ${err.message}`);
      throw err;
    }
  }
}

module.exports = SvnAgent;
