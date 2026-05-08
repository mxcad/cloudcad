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
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

/**
 * Prisma 数据库异常过滤器
 *
 * 捕获 PrismaClientKnownRequestError 并转换为有意义的 HTTP 响应，
 * 替代默认的 500 错误，向客户端提供可操作的错误信息。
 *
 * 覆盖的错误码：
 * - P2002: 唯一约束冲突 → 409 Conflict
 * - P2003: 外键约束失败 → 400 Bad Request
 * - P2004: 数据库约束失败 → 400 Bad Request
 * - P2005/P2006: 字段值无效 → 400 Bad Request
 * - P2011: 空约束冲突 → 400 Bad Request
 * - P2014: 必需关联冲突 → 400 Bad Request
 * - P2016: 查询解析错误 → 400 Bad Request
 * - P2025: 记录不存在 → 404 Not Found
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '数据库操作错误';
    let code = 'DATABASE_ERROR';

    switch (exception.code) {
      case 'P2002': {
        status = HttpStatus.CONFLICT;
        message = '数据已存在，请勿重复提交';
        code = 'UNIQUE_CONSTRAINT';
        const targets = (exception.meta as Record<string, unknown>)?.target;
        if (Array.isArray(targets) && targets.length > 0) {
          message = `字段 ${targets.join(', ')} 已存在`;
        }
        break;
      }
      case 'P2003':
        status = HttpStatus.BAD_REQUEST;
        message = '数据关联错误，请检查关联数据是否存在';
        code = 'FOREIGN_KEY_CONSTRAINT';
        break;
      case 'P2004':
        status = HttpStatus.BAD_REQUEST;
        message = '数据库约束校验失败';
        code = 'CONSTRAINT_FAILED';
        break;
      case 'P2005':
      case 'P2006':
        status = HttpStatus.BAD_REQUEST;
        message = '字段值不符合数据库要求';
        code = 'INVALID_FIELD_VALUE';
        break;
      case 'P2011':
        status = HttpStatus.BAD_REQUEST;
        message = '必填字段不能为空';
        code = 'NULL_CONSTRAINT';
        break;
      case 'P2014':
        status = HttpStatus.BAD_REQUEST;
        message = '数据关联错误：缺少必需的关联数据';
        code = 'REQUIRED_RELATION';
        break;
      case 'P2016':
        status = HttpStatus.BAD_REQUEST;
        message = '查询参数错误';
        code = 'QUERY_ERROR';
        break;
      case 'P2025':
        status = HttpStatus.NOT_FOUND;
        message = '请求的资源不存在';
        code = 'NOT_FOUND';
        break;
      default:
        this.logger.error(
          `Prisma Error [${exception.code}]: ${exception.message}`,
          exception.stack
        );
        message = `数据库错误 (${exception.code})`;
        break;
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${status} - ${message}`,
        exception.stack
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} - ${status} - ${message}`
      );
    }

    response.status(status).json({
      code,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    });
  }
}
