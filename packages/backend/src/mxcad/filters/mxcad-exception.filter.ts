import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { MxCadException } from '../exceptions/mxcad.exception';
import { GlobalExceptionFilter } from '../../common/filters/exception.filter';

/**
 * MxCAD 异常过滤器
 *
 * 用于统一处理 MxCAD 相关接口的异常，确保返回格式与 MxCAD-App 兼容
 * 返回格式：{ ret: 'errorcode', message?: string }
 *
 * 仅处理 /mxcad/ 和 /gallery/ 路由的异常，其他路由委托给 GlobalExceptionFilter 处理
 */
@Catch(MxCadException, HttpException)
export class MxCadExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(MxCadExceptionFilter.name);
  private readonly globalFilter = new GlobalExceptionFilter();

  /**
   * 需要使用 MxCAD 格式响应的路由前缀
   */
  private readonly mxCadRoutes = ['/mxcad/', '/gallery/'];

  /**
   * 检查请求路径是否需要 MxCAD 格式响应
   */
  private isMxCadRoute(url: string): boolean {
    return this.mxCadRoutes.some((route) => url.includes(route));
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    // 只处理 MxCAD 相关路由的异常，其他路由委托给 GlobalExceptionFilter 处理
    if (!this.isMxCadRoute(request.url)) {
      this.globalFilter.catch(exception, host);
      return;
    }

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
        const responseMsg = (exceptionResponse as Record<string, unknown>).message;
        if (typeof responseMsg === 'string') {
          message = responseMsg;
        } else if (Array.isArray(responseMsg)) {
          message = responseMsg.join(', ');
        } else {
          message = '参数错误';
        }
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