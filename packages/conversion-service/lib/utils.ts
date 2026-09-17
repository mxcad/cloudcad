// 统一 JSON 日志（零依赖），实现见 ./logger
import { log, resolveRequestId, runWithRequest } from './logger';
import { createHash } from 'crypto';

// 最小请求结构（IncomingMessage 与测试用 Readable 假对象均满足）
export interface RequestLike {
  on(event: string, listener: (...args: any[]) => void): unknown;
}

// 最小响应结构（ServerResponse 与测试用假对象均满足）
export interface ResponseLike {
  writeHead(statusCode: number, headers?: Record<string, string>): void;
  end(body?: string): void;
}

function sendJson(res: ResponseLike, statusCode: number, data: unknown): boolean {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
  return true;
}

function parseBody(req: RequestLike): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function generateId(): string {
  return `fw_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 8)}`;
}

// 影响转换产物的参数字段（内容身份派生用）。与 runner.execute 透传给 mxcadassembly 的
// 参数一致：源文件 + 内容哈希 + 转换命令 + 输出 + 尺寸/颜色/版本/布局/压缩等。
const CONTENT_KEY_FIELDS = [
  'srcPath',
  'fileHash',
  'cmd',
  'outname',
  'width',
  'height',
  'colorPolicy',
  'outjpg',
  'roate_angle',
  'view_angle',
  'dwgVersion',
  'layout_name',
  'compression',
  'createPreloadingData',
];

/**
 * 从转换参数派生稳定内容身份（#431 门禁3）。
 *
 * 同一 content_hash + 源文件 + 目标格式（及影响产物的参数）→ 同一 key。
 * 用于「同 key 在途任务合并去重」：两个并发提交同一图纸+同一转换时，第二个提交者
 * 挂到第一个的在途任务上，不重复起 mxcadassembly（8-28 事故同图纸转 21 次的根因）。
 *
 * @returns 稳定 key（`ck_<sha256 前 20 位>`）；若 params 无识别字段（非文件转换）返回 null（不去重）
 */
function deriveContentKey(params: Record<string, unknown>): string | null {
  if (params.srcPath === undefined && params.fileHash === undefined) return null;
  const subset: Record<string, unknown> = {};
  for (const f of CONTENT_KEY_FIELDS) {
    if (params[f] !== undefined) subset[f] = params[f];
  }
  const canonical = JSON.stringify(subset, Object.keys(subset).sort());
  return `ck_${createHash('sha256').update(canonical).digest('hex').slice(0, 20)}`;
}

export { log, resolveRequestId, runWithRequest, sendJson, parseBody, generateId, deriveContentKey };
