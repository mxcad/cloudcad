import http from 'http';
import https from 'https';
import { CALLBACK_TIMEOUT } from '../lib/constants';
import { log } from '../lib/utils';
import type TaskStore from './task-store';

interface CallbackResult {
  status: string;
  result: unknown;
  error?: unknown;
}

/**
 * 最佳努力 HTTP 回调引擎
 */
class CallbackEngine {
  taskStore: TaskStore;

  constructor(taskStore: TaskStore) {
    this.taskStore = taskStore;
  }

  async notify(taskId: string, result: CallbackResult): Promise<void> {
    const task = this.taskStore.get(taskId);
    if (!task || !task.callbackUrl) return;

    const payload = JSON.stringify({
      taskId,
      status: result.status,
      result: result.result || null,
      error: result.error || null,
      timestamp: new Date().toISOString(),
    });

    this._post(task.callbackUrl, payload).catch((err) => {
      log(`[Callback] 回调失败: ${task.callbackUrl} - ${(err as Error).message}`);
    });
  }

  _post(url: string, payload: string): Promise<{ statusCode: number | undefined; body: string }> {
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
        let body = '';
        res.on('data', (chunk: string) => body += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Callback timeout')); });
      req.write(payload);
      req.end();
    });
  }
}

export default CallbackEngine;
