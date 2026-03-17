///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';

const logger = new Logger('ValidationPipe');

export class CustomValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (validationErrors: ValidationError[] = []) => {
        logger.error(`验证错误: ${JSON.stringify(validationErrors, null, 2)}`);
        const errors = validationErrors.map((error) => ({
          field: error.property,
          message: Object.values(error.constraints || {}).join(', '),
        }));
        return new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: '请求参数验证失败',
          errors,
        });
      },
    });
  }
}
