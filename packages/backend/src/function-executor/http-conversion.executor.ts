import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import * as http from 'http';
import * as https from 'https';
import { buildOutboundTraceHeaders } from '../common/utils/outbound-trace';
import { internalServiceSecretHeader } from '../common/utils/internal-service-auth';
import type {
  IFunctionExecutor,
  ConversionTask,
  ConversionResult,
  TaskStatus,
} from './function-executor.interface';

@Injectable()
export class HttpConversionExecutor implements IFunctionExecutor {
  private readonly logger = new Logger(HttpConversionExecutor.name);
  private readonly baseUrl: string;
  private readonly useHttps: boolean;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  /** #419：内部服务共享密钥（空则不带头，向后兼容本地开发） */
  private readonly secretHeaders: Record<string, string>;

  constructor(
    private readonly configService: ConfigService,
    private readonly cls: ClsService,
  ) {
    this.baseUrl = this.configService.get<string>('CONVERSION_SERVICE_URL')
      || 'http://localhost:3100';
    this.useHttps = this.baseUrl.startsWith('https');
    this.pollIntervalMs = Number(
      this.configService.get<string>('CONVERSION_SERVICE_POLL_INTERVAL') || 1000,
    );
    this.pollTimeoutMs = Number(
      this.configService.get<string>('CONVERSION_SERVICE_POLL_TIMEOUT') || 300000,
    );
    this.secretHeaders = internalServiceSecretHeader(
      this.configService.get<string>('INTERNAL_SERVICE_SECRET'),
    );
  }

  async invoke(task: ConversionTask): Promise<ConversionResult> {
    const body = JSON.stringify({
      priority: task.priority,
      callbackUrl: null,
      params: {
        type: task.type,
        ...task.params,
      },
    });

    let submitted: any;
    try {
      // 异步提交：返回 taskId 后由轮询等待终态，避免在 conversion-service 服务侧长期占用连接
      submitted = await this.request('/v1/conversions/async/convertFile', 'POST', body);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return {
        taskId: task.id,
        status: 'FAILED',
        error: `Failed to submit task: ${errMsg}`,
      };
    }

    const taskId: string | undefined = submitted.taskId;
    if (!taskId) {
      return {
        taskId: task.id,
        status: 'FAILED',
        error: 'Conversion service did not return a taskId',
      };
    }

    return this.waitForTerminal(taskId);
  }

  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const response = await this.request(`/v1/conversions/tasks/${taskId}`, 'GET');
    const raw = response.result as Record<string, unknown> | undefined;
    return {
      taskId: response.taskId,
      status: response.status,
      progress: response.progress,
      result: raw
        ? {
            taskId: response.taskId,
            status: response.status,
            outputPath: (raw.newpath ?? raw.outputPath) as string | undefined,
            metadata: raw,
          }
        : undefined,
      error: response.error,
      // 永久失败标记（S6-7）：conversion-service GET /tasks/:taskId 透传（仅 conversion-service 模式有）
      permanent: response.permanent === true,
      // 排队位置（S6-5）：conversion-service GET /tasks/:taskId 透传（仅排队中任务有意义，否则 null）
      queuePosition:
        typeof response.queuePosition === 'number'
          ? response.queuePosition
          : undefined,
      createdAt: new Date(response.createdAt),
      updatedAt: new Date(response.updatedAt),
    };
  }

  /**
   * 取消任务（#463）：转发到 conversion-service 的取消路由
   * （排队中出队 / 运行中杀 mxcadassembly 进程组）。
   */
  async cancelTask(taskId: string): Promise<{
    ok: boolean;
    status?: string;
    reason?: string;
  }> {
    try {
      const response = await this.request(
        `/v1/conversions/tasks/${encodeURIComponent(taskId)}/cancel`,
        'POST'
      );
      return { ok: true, status: response.status };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      // 409（终态不可取消）/ 404（任务不存在）等：透传为 ok=false + reason
      return { ok: false, reason: errMsg };
    }
  }

  private async waitForTerminal(taskId: string): Promise<ConversionResult> {
    const deadline = Date.now() + this.pollTimeoutMs;
    while (Date.now() < deadline) {
      try {
        const status = await this.getTaskStatus(taskId);
        if (status.status === 'COMPLETED') {
          return {
            taskId,
            status: 'COMPLETED',
            outputPath: status.result?.outputPath,
            metadata: status.result?.metadata,
          };
        }
        if (status.status === 'FAILED') {
          return { taskId, status: 'FAILED', error: status.error };
        }
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Task status poll failed for ${taskId}: ${errMsg}`);
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
    return {
      taskId,
      status: 'FAILED',
      error: `Conversion task timed out after ${this.pollTimeoutMs}ms`,
    };
  }

  private request(path: string, method: string, body?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const mod = this.useHttps ? https : http;
      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (this.useHttps ? 443 : 80),
        path: url.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          // X-Request-Id/X-Trace-Id 透传（#309）：conversion-service 侧日志据此串联
          ...buildOutboundTraceHeaders(
            {
              requestId: this.cls?.get<string>('requestId'),
              traceId: this.cls?.get<string>('traceId'),
            },
            'http-conversion',
          ),
          // #419：内部服务共享密钥
          ...this.secretHeaders,
        },
        timeout: 300000,
      };
      if (body) {
        options.headers!['Content-Length'] = Buffer.byteLength(body);
      }
      const req = mod.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: string) => data += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(
              new Error(`HTTP ${res.statusCode} for ${method} ${path}: ${data.substring(0, 200)}`),
            );
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout: ${method} ${path}`));
      });
      if (body) req.write(body);
      req.end();
    });
  }
}
