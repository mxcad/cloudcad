import { ConfigService } from '@nestjs/config';
import type { RequestOptions } from 'https';
import * as crypto from 'crypto';
import type { ConversionTask } from '../../function-executor.interface';
import { buildFaasInvokeBody, faasHttpsJsonRequest } from '../faas-http';

export class HuaweiExecutor {
  private readonly endpoint: string;
  private readonly ak: string;
  private readonly sk: string;

  constructor(configService: ConfigService) {
    this.endpoint = configService.get<string>('HUAWEI_FUNCTIONGRAPH_ENDPOINT') || '';
    this.ak = configService.get<string>('HUAWEI_AK') || '';
    this.sk = configService.get<string>('HUAWEI_SK') || '';
  }

  async invoke(task: ConversionTask): Promise<{ status: string; outputPath?: string; error?: string; metadata?: Record<string, unknown> }> {
    const response = await this.request('/v2/convert', 'POST', buildFaasInvokeBody(task));
    if (response.code === 0) {
      return { status: 'COMPLETED', outputPath: response.newpath, metadata: response };
    }
    return { status: 'FAILED', error: response.message || 'Unknown error' };
  }

  async getTaskStatus(taskId: string): Promise<{ status: string; createdAt: string; updatedAt: string }> {
    const response = await this.request(`/v2/tasks/${taskId}`, 'GET');
    return {
      status: response.status || 'UNKNOWN',
      createdAt: response.createdAt || new Date().toISOString(),
      updatedAt: response.updatedAt || new Date().toISOString(),
    };
  }

  private request(path: string, method: string, body?: string): Promise<any> {
    const url = new URL(path, this.endpoint);
    const timestamp = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const signature = crypto.createHmac('sha256', this.sk).update(timestamp).digest('hex');

    const options: RequestOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-CFF-Request-Id': `req_${Date.now()}`,
        'X-Sdk-Date': timestamp,
        'Authorization': `HMAC-SHA256 Access=${this.ak}, SignedHeaders=host;x-sdk-date, Signature=${signature}`,
      },
      timeout: 300000,
      rejectUnauthorized: false,
    };
    if (body) options.headers!['Content-Length'] = Buffer.byteLength(body);

    return faasHttpsJsonRequest(options, body);
  }
}
