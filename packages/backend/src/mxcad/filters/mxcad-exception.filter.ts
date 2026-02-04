import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { MxCadException } from '../exceptions/mxcad.exception';

/**
 * MxCAD 异常过滤器
 *
 * 用于统一处理 MxCAD 相关接口的异常，确保返回格式与 MxCAD-App 兼容
 * 返回格式：{ ret: 'errorcode', message?: string }
 */
@Catch(MxCadException, HttpException)
export class MxCadExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(MxCadExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let ret = 'errorparam';
    let message: string | undefined;

    // 处理 MxCAD 专用异常
    if (exception instanceof MxCadException) {
      ret = exception.ret;
      message = exception.message;
      this.logger.warn(
        `[MxCadException] ${request.method} ${request.url} - ${ret}: ${message}`
      );
    }
    // 处理通用 HTTP 异常
    else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (status === HttpStatus.UNAUTHORIZED) {
        ret = 'errorparam';
        message = '用户未认证';
      } else if (status === HttpStatus.FORBIDDEN) {
        ret = 'errorparam';
        message = '权限不足';
      } else if (status === HttpStatus.BAD_REQUEST) {
        ret = 'errorparam';
        message =
          typeof exceptionResponse === 'string'
            ? exceptionResponse
            : (exceptionResponse as any).message || '参数错误';
      } else {
        ret = 'convertFileError';
        message = '服务器内部错误';
      }

      this.logger.error(
        `[HttpException] ${request.method} ${request.url} - ${status}: ${message}`,
        exception instanceof Error ? exception.stack : exception
      );
    }
    // 处理未知异常
    else {
      ret = 'convertFileError';
      message = '服务器内部错误';
      this.logger.error(
        `[UnknownException] ${request.method} ${request.url}: ${message}`,
        exception instanceof Error ? exception.stack : exception
      );
    }

    // 返回 MxCAD 兼容格式
    const errorResponse: { ret: string; message?: string } = { ret };

    if (message) {
      errorResponse.message = message;
    }

    response.status(HttpStatus.OK).json(errorResponse);
  }
}