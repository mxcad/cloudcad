import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  // 敏感信息正则表达式
  private readonly sensitivePatterns = [
    // Windows 路径
    /[A-Za-z]:\\[^\\]+\\[^\\]+/g,
    // Unix/Linux 路径
    /(home|var|tmp|usr|opt|etc)\/[^/]+/g,
    // 磁盘路径
    /[A-Za-z]:\/[^/]+/g,
    // 数据库连接字符串
    /(mongodb|postgresql|mysql):\/\/[^@]+@[^/]+/g,
    // 环境变量
    /\$\{[^}]+\}/g,
    // 绝对路径（通用）
    /[A-Z]:\/[^\/]+/gi,
    // 项目路径
    /packages\/(backend|frontend|[^/]+)\//g,
    // Node modules 路径
    /node_modules\/[^/]+/g,
  ];

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';
    let code = 'INTERNAL_SERVER_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || exception.message;
        code = (exceptionResponse as any).code || this.getErrorCode(status);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`未处理的异常: ${exception.message}`, exception.stack);
    }

    // 过滤敏感信息
    const sanitizedMessage = this.sanitizeMessage(message);

    const errorResponse = {
      code,
      message: sanitizedMessage,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };

    // 记录错误日志（包含完整错误信息）
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${status} - ${message}`,
        exception instanceof Error ? exception.stack : exception
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} - ${status} - ${message}`
      );
    }

    response.status(status).send(errorResponse);
  }

  /**
   * 过滤敏感信息
   * @param message 原始消息
   * @returns 过滤后的消息
   */
  private sanitizeMessage(message: string): string {
    let sanitized = message;

    // 应用所有敏感信息过滤规则
    for (const pattern of this.sensitivePatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    // 限制消息长度，防止过长的错误信息
    if (sanitized.length > 500) {
      sanitized = sanitized.substring(0, 500) + '...';
    }

    return sanitized;
  }

  private getErrorCode(status: number): string {
    const statusMap: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      500: 'INTERNAL_SERVER_ERROR',
      503: 'SERVICE_UNAVAILABLE',
    };
    return statusMap[status] || 'UNKNOWN_ERROR';
  }
}
