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
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { I18nContext } from 'nestjs-i18n';

export interface Response<T> {
  code: string;
  message: string;
  data: T;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, Response<T> | StreamableFile> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T> | StreamableFile> {
    return next.handle().pipe(
      map((data) => {
        // 流式/文件响应不包装：下载端点返回 StreamableFile，若包成
        // {code,message,data} JSON 信封，浏览器拿到的是 JSON 而非文件字节，
        // <img> 内联渲染 / <a download> 下载全坏（实例：反馈附件下载
        // /api/v1/feedback/attachments/:id/download）。
        if (data instanceof StreamableFile) {
          return data;
        }
        const i18nCtx = I18nContext.current(context);
        const message = i18nCtx?.t('success.operation') ?? '操作成功';
        return {
          code: 'SUCCESS',
          message,
          data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
