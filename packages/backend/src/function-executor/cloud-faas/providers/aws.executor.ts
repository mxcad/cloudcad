import { ConfigService } from '@nestjs/config';
import type { RequestOptions } from 'https';
import * as crypto from 'crypto';
import type { ConversionTask } from '../../function-executor.interface';
import { buildFaasInvokeBody, faasHttpsJsonRequest } from '../faas-http';

export class LambdaExecutor {
  private readonly endpoint: string;
  private readonly ak: string;
  private readonly sk: string;
  private readonly region: string;

  constructor(configService: ConfigService) {
    this.endpoint = configService.get<string>('AWS_LAMBDA_ENDPOINT') || '';
    this.ak = configService.get<string>('AWS_AK') || '';
    this.sk = configService.get<string>('AWS_SK') || '';
    this.region = configService.get<string>('AWS_REGION') || 'us-east-1';
  }

  async invoke(task: ConversionTask): Promise<{ status: string; outputPath?: string; error?: string; metadata?: Record<string, unknown> }> {
    const response = await this.request('/2015-03-31/functions/cloudcad-convert/invocations', 'POST', buildFaasInvokeBody(task));
    if (response.statusCode === 200) {
      const payload = typeof response.Payload === 'string' ? JSON.parse(response.Payload) : response.Payload;
      if (payload.code === 0) {
        return { status: 'COMPLETED', outputPath: payload.newpath, metadata: payload };
      }
      return { status: 'FAILED', error: payload.message || 'Lambda execution failed' };
    }
    return { status: 'FAILED', error: `Lambda returned ${response.statusCode}: ${response.FunctionError || ''}` };
  }

  async getTaskStatus(taskId: string): Promise<{ status: string; createdAt: string; updatedAt: string }> {
    const response = await this.request(`/2015-03-31/functions/cloudcad-status/invocations?taskId=${taskId}`, 'GET');
    return {
      status: response.status || 'UNKNOWN',
      createdAt: response.createdAt || new Date().toISOString(),
      updatedAt: response.updatedAt || new Date().toISOString(),
    };
  }

  private request(path: string, method: string, body?: string): Promise<any> {
    const url = new URL(path, this.endpoint);
    // toISOString() 已含结尾 Z，替换掉 : - .sss 后即 SigV4 要求的 YYYYMMDD'T'HHMMSS'Z'
    // 单 Z 形态；切勿再 + 'Z'（会成双 Z，真实 AWS 拒绝签名）
    const amzDate = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const datestamp = amzDate.substring(0, 8);

    const canonicalHeaders = `host:${url.hostname}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-date';
    const payloadHash = crypto.createHash('sha256').update(body || '').digest('hex');

    const canonicalRequest = `${method}\n${url.pathname}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credentialScope = `${datestamp}/${this.region}/lambda/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

    const signature = this.sign(stringToSign, datestamp);
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const options: RequestOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Amz-Date': amzDate,
        'Authorization': authorization,
        'X-Amz-Invocation-Type': 'RequestResponse',
      },
      timeout: 300000,
      rejectUnauthorized: false,
    };
    if (body) options.headers!['Content-Length'] = Buffer.byteLength(body);

    // AWS 解析失败兜底与华为/阿里云不同：保留 {statusCode, Payload} 供 invoke 判 statusCode
    return faasHttpsJsonRequest(options, body, (data, res) => ({
      statusCode: res.statusCode,
      Payload: data,
    }));
  }

  private sign(stringToSign: string, datestamp: string): string {
    const dateKey = crypto.createHmac('sha256', `AWS4${this.sk}`).update(datestamp).digest();
    const regionKey = crypto.createHmac('sha256', dateKey).update(this.region).digest();
    const serviceKey = crypto.createHmac('sha256', regionKey).update('lambda').digest();
    const signingKey = crypto.createHmac('sha256', serviceKey).update('aws4_request').digest();
    return crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  }
}
