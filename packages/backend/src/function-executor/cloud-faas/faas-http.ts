import * as https from 'https';
import type { IncomingMessage } from 'http';
import type { ConversionTask } from '../function-executor.interface';

/**
 * 云厂商 FaaS 的公共 HTTPS JSON 传输：华为 / 阿里云 / AWS 三个 provider 共享
 * 此传输骨架（options 组装后的 https.request + data/error/timeout 三 handler +
 * JSON 解析兜底），收敛此前各 provider 逐字重复的 https.request 样板。
 *
 * 厂商差异由调用方注入：签名头 / 额外头 / 路径是否含 query 都体现在传入的
 * options 里；解析失败兜底形状经 onParseError 注入——缺省用「{code:-1,message}」
 * 兜底（华为/阿里云语义），AWS 传自己的「{statusCode, Payload}」兜底。
 */
export function faasHttpsJsonRequest(
  options: https.RequestOptions,
  body?: string,
  onParseError?: (data: string, res: IncomingMessage) => unknown,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(
            onParseError
              ? onParseError(data, res)
              : { code: -1, message: `Invalid response: ${data.substring(0, 200)}` },
          );
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (body) req.write(body);
    req.end();
  });
}

/**
 * 三个厂商 invoke 的公共请求体（此前逐字重复）：taskId/type/params/priority。
 * 各厂商只在此 body 之上叠加自己的签名头。
 */
export function buildFaasInvokeBody(task: ConversionTask): string {
  return JSON.stringify({
    taskId: task.id,
    type: task.type,
    params: task.params,
    priority: task.priority,
  });
}
