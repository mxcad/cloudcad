///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { Request, Response } from 'express';
import { I18nContext } from 'nestjs-i18n';

@Catch()
@Injectable()
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
    /[A-Z]:\/[^/]+/gi,
    // 项目路径
    /packages\/(backend|frontend|[^/]+)\//g,
    // Node modules 路径
    /node_modules\/[^/]+/g,
  ];

  catch(exception: unknown, host: ArgumentsHost) {
    // 添加日志以确认过滤器是否被调用
    this.logger.debug('[GlobalExceptionFilter] 异常过滤器被调用', {
      exception,
      exceptionType: typeof exception,
      exceptionName: exception instanceof Error ? exception.name : 'unknown',
    });

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = (I18nContext.current(host)?.t('error.general.internal_server_error') ?? '服务器内部错误');
    let code = 'INTERNAL_SERVER_ERROR';
    const extraFields: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // 调试日志
      this.logger.debug(
        `HttpException response: ${JSON.stringify(exceptionResponse)}, type: ${typeof exceptionResponse}`
      );

      if (typeof exceptionResponse === 'string') {
        // NestJS 传入字符串时，getResponse() 返回该字符串
        message = exceptionResponse;
        code = this.getErrorCode(status);
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        // NestJS 标准错误对象格式: { statusCode, message, error }
        const responseObj = exceptionResponse as Record<string, unknown>;
        // message 可能是字符串或字符串数组
        const responseMessage = responseObj.message;
        if (Array.isArray(responseMessage)) {
          message = responseMessage.join(', ');
        } else if (typeof responseMessage === 'string') {
          message = responseMessage;
        } else if (typeof responseObj.error === 'string') {
          // 无 message 字段时用 error 字段兜底
          // （如设备授权轮询的 { error: 'authorization_pending' }，
          //   避免回退成无意义的 'Http Exception'）
          message = responseObj.error;
        } else {
          message = exception.message;
        }
        code =
          (typeof responseObj.code === 'string' ? responseObj.code : null) ||
          this.getErrorCode(status);

        // 传递额外字段（如 email、phone、error 等业务数据）。
        // 注意：error 字段必须透传 —— 设备授权轮询依赖 body.error
        // 识别 authorization_pending / expired_token / access_denied
        for (const key of Object.keys(responseObj)) {
          if (!['statusCode', 'message', 'code'].includes(key)) {
            extraFields[key] = responseObj[key];
          }
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`未处理的异常: ${exception.message}`, exception.stack);
    }

    // 过滤敏感信息
    const sanitizedMessage = this.sanitizeMessage(message);

    // 尝试国际化翻译（翻译 key 或中文消息，找不到则原文返回）
    const i18nCtx = I18nContext.current(host);
    const translatedMessage = i18nCtx?.t(sanitizedMessage);

    const errorResponse = {
      code,
      message: translatedMessage || sanitizedMessage,
      ...extraFields,
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
      if (exception instanceof Error) {
        Sentry.captureException(exception);
      }
    } else {
      this.logger.warn(
        `${request.method} ${request.url} - ${status} - ${message}`
      );
    }

    // 确保响应头为 JSON 格式
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.status(status).json(errorResponse);
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
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      503: 'SERVICE_UNAVAILABLE',
    };
    return statusMap[status] || 'UNKNOWN_ERROR';
  }
}
