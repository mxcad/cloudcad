const http = require('http');
const https = require('https');
const { CALLBACK_TIMEOUT } = require('../lib/constants');
const { log } = require('../lib/utils');

/**
 * 最佳努力 HTTP 回调引擎
 */
class CallbackEngine {
  constructor(taskStore) {
    this.taskStore = taskStore;
  }

  async notify(taskId, result) {
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
      log(`[Callback] 回调失败: ${task.callbackUrl} - ${err.message}`);
    });
  }

  _post(url, payload) {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https');
      const mod = isHttps ? https : http;
      const parsed = new URL(url);
      const options = {
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
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Callback timeout')); });
      req.write(payload);
      req.end();
    });
  }
}

module.exports = CallbackEngine;
