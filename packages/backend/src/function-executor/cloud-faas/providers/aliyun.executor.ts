import { ConfigService } from '@nestjs/config';
import type { RequestOptions } from 'https';
import * as crypto from 'crypto';
import type { ConversionTask } from '../../function-executor.interface';
import { buildFaasInvokeBody, faasHttpsJsonRequest } from '../faas-http';

export class AliyunExecutor {
  private readonly endpoint: string;
  private readonly ak: string;
  private readonly sk: string;

  constructor(configService: ConfigService) {
    this.endpoint = configService.get<string>('ALIYUN_FC_ENDPOINT') || '';
    this.ak = configService.get<string>('ALIYUN_AK') || '';
    this.sk = configService.get<string>('ALIYUN_SK') || '';
  }

  async invoke(task: ConversionTask): Promise<{ status: string; outputPath?: string; error?: string; metadata?: Record<string, unknown> }> {
    const response = await this.request('/2016-08-15/services/cloudcad/functions/convert/invocations', 'POST', buildFaasInvokeBody(task));
    if (response.code === 0) {
      return { status: 'COMPLETED', outputPath: response.newpath, metadata: response };
    }
    return { status: 'FAILED', error: response.message || 'Unknown error' };
  }

  async getTaskStatus(taskId: string): Promise<{ status: string; createdAt: string; updatedAt: string }> {
    const response = await this.request(`/2016-08-15/services/cloudcad/functions/status/invocations?taskId=${taskId}`, 'GET');
    return {
      status: response.status || 'UNKNOWN',
      createdAt: response.createdAt || new Date().toISOString(),
      updatedAt: response.updatedAt || new Date().toISOString(),
    };
  }

  private request(path: string, method: string, body?: string): Promise<any> {
    const url = new URL(path, this.endpoint);
    const date = new Date().toUTCString();
    const contentMD5 = body ? crypto.createHash('md5').update(body).digest('base64') : '';
    const contentType = 'application/json';

    const signString = `${method}\n${contentMD5}\n${contentType}\n${date}\n${path}`;
    const signature = crypto.createHmac('sha1', this.sk).update(signString).digest('base64');

    const options: RequestOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + (url.search || ''),
      method,
      headers: {
        'Content-Type': contentType,
        'Date': date,
        'Authorization': `FC ${this.ak}:${signature}`,
      },
      timeout: 300000,
      rejectUnauthorized: false,
    };
    if (body) {
      options.headers!['Content-MD5'] = contentMD5;
      options.headers!['Content-Length'] = Buffer.byteLength(body);
    }

    return faasHttpsJsonRequest(options, body);
  }
}
