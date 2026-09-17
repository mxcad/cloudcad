import * as http from 'http';
import * as https from 'https';

/**
 * conversion-service HTTP 客户端（backend 内唯一实现）。
 *
 * 此前「解析 URL → 选 http/https → 拼 headers → 缓冲响应 → 4xx/JSON/timeout」
 * 这套逻辑有三份逐字副本：function-executor/http-conversion.executor.ts、
 * batch-download/conversion-runner.ts、conversion-monitor/conversion-monitor.service.ts。
 * 三份的超时、错误文案、query 处理方式各不相同，改协议要改三处。
 *
 * 路径统一用 url.pathname + url.search：只取 pathname 会把 query string 丢掉，
 * conversion-monitor.listTasks 的 ?status= 过滤此前从未到达 conversion-service。
 */
export interface ConversionServiceClientOptions {
  /** 服务地址（http(s)://host:port） */
  baseUrl: string;
  /** 单请求超时（ms） */
  timeoutMs: number;
  /** 每次请求合并的固定请求头（内部服务密钥、Content-Type 等） */
  headers?: Record<string, string>;
}

export class ConversionServiceClient {
  private readonly baseUrl: string;
  private readonly useHttps: boolean;
  private readonly timeoutMs: number;
  private readonly headers: Record<string, string>;

  constructor(options: ConversionServiceClientOptions) {
    this.baseUrl = options.baseUrl;
    this.useHttps = options.baseUrl.startsWith('https');
    this.timeoutMs = options.timeoutMs;
    this.headers = { ...options.headers };
  }

  /**
   * @param path  相对路径（可含 query，如 `/v1/conversions/tasks?status=pending`）
   * @param body  对象或已序列化字符串；undefined 时不发请求体
   * @param extraHeaders 单次请求的额外头（如按请求串接的 trace 头）
   */
  request<T = unknown>(
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const payload =
      body === undefined
        ? undefined
        : typeof body === 'string'
          ? body
          : JSON.stringify(body);

    return new Promise<T>((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const mod = this.useHttps ? https : http;
      const headers = { ...this.headers, ...extraHeaders };
      if (payload) {
        headers['Content-Length'] = String(Buffer.byteLength(payload));
      }

      const req = mod.request(
        {
          hostname: url.hostname,
          port: url.port || (this.useHttps ? 443 : 80),
          path: url.pathname + url.search,
          method,
          headers,
          timeout: this.timeoutMs,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: string) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              reject(
                new Error(
                  `HTTP ${res.statusCode} for ${method} ${path}: ${data.substring(
                    0,
                    200
                  )}`
                )
              );
              return;
            }
            try {
              resolve(JSON.parse(data) as T);
            } catch {
              reject(new Error(`Invalid JSON response from ${path}`));
            }
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout: ${method} ${path}`));
      });
      if (payload) req.write(payload);
      req.end();
    });
  }
}
