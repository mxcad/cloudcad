import { Injectable, OnModuleInit } from '@nestjs/common';
import client from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly httpRequestsTotal: client.Counter<string>;
  private readonly httpRequestDurationSeconds: client.Histogram<string>;
  readonly excludedPaths = ['/health', '/metrics', '/api/health', '/api/metrics'];

  constructor() {
    this.httpRequestsTotal = new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status'] as const,
    });

    this.httpRequestDurationSeconds = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status'] as const,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });
  }

  onModuleInit() {
    client.collectDefaultMetrics({ register: client.register });
  }

  getContentType(): string {
    return client.register.contentType;
  }

  async getMetrics(): Promise<string> {
    return client.register.metrics();
  }

  private normalizePath(path: string): string {
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:id');
  }

  recordRequest(method: string, path: string, statusCode: number): void {
    const pattern = this.normalizePath(path);
    this.httpRequestsTotal.inc({ method, path: pattern, status: statusCode.toString() });
  }

  startDurationTimer(): (method: string, path: string, statusCode: number) => void {
    const end = this.httpRequestDurationSeconds.startTimer();
    return (method: string, path: string, statusCode: number) => {
      const pattern = this.normalizePath(path);
      end({ method, path: pattern, status: statusCode.toString() });
    };
  }

  isExcluded(path: string): boolean {
    return this.excludedPaths.some((p) => path.startsWith(p) || path === p);
  }
}
