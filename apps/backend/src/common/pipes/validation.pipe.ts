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
