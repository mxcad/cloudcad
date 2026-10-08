import http from 'http';
import https from 'https';
import { CALLBACK_TIMEOUT } from '../lib/constants';

interface CallbackResult {
  status: string;
  result: unknown;
  error?: unknown;
}

/**
 * 最佳努力 HTTP 回调引擎。
 *
 * 接缝刻意收紧为「发送一次回调」：入参是 endpoint 与调用方已判定的终态，
 * 输出是成败（HTTP >= 400 / 网络错误 / 超时 → reject）。
 * 「该不该回调」（callbackUrl 是否存在）由调用方一处判定，本模块不再回查
 * TaskStore —— 此前 notify 拿 taskId 再 get 一次，与 worker-pool._notify 的守卫
 * 重复，还因此背上一个对 TaskStore 的硬依赖。
 */
class CallbackEngine {
  async notify(taskId: string, callbackUrl: string, result: CallbackResult): Promise<void> {
    const payload = JSON.stringify({
      taskId,
      status: result.status,
      result: result.result || null,
      error: result.error || null,
      timestamp: new Date().toISOString(),
    });

    await this._post(callbackUrl, payload);
  }

  _post(url: string, payload: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https');
      const mod = isHttps ? https : http;
      const parsed = new URL(url);
      const options: http.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: CALLBACK_TIMEOUT,
      };
      const req = mod.request(options, (res) => {
        // 排空响应体（不保留：调用方不消费 body，此前逐块拼接是死接口面）
        res.resume();
        const code = res.statusCode;
        if (code && code >= 400) {
          // 与 backend postCallback 同口径：>= 400 视为回调失败，上抛给调用方记录
          reject(new Error(`Callback HTTP ${code}`));
        } else {
          resolve();
        }
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Callback timeout')); });
      req.write(payload);
      req.end();
    });
  }
}

export default CallbackEngine;
