///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { CustomValidationPipe } from './validation.pipe';

describe('CustomValidationPipe', () => {
  let pipe: CustomValidationPipe;

  beforeEach(() => {
    pipe = new CustomValidationPipe();
  });

  describe('constructor', () => {
    it('should create a validation pipe with default options', () => {
      expect(pipe).toBeInstanceOf(CustomValidationPipe);
    });
  });

  describe('exceptionFactory', () => {
    it('should create BadRequestException with validation errors', async () => {
      // Create a test class to validate
      class TestDto {
        email!: string;
        password!: string;
      }

      // Use the pipe to transform and catch the exception
      try {
        await pipe.transform(
          { email: 'invalid', password: '123' },
          { type: 'body', metatype: TestDto }
        );
      } catch (exception: unknown) {
        expect(exception).toBeInstanceOf(BadRequestException);
        const response = (exception as BadRequestException).getResponse() as {
          code: string;
          message: string;
          errors: unknown;
        };
        expect(response.code).toBe('VALIDATION_ERROR');
        expect(response.message).toBe('请求参数验证失败');
        expect(response.errors).toBeDefined();
      }
    });

    it('should handle validation error without constraints', async () => {
      class TestDto {
        field!: string;
      }

      try {
        await pipe.transform(
          { field: null },
          { type: 'body', metatype: TestDto }
        );
      } catch (exception: unknown) {
        expect(exception).toBeInstanceOf(BadRequestException);
        const response = (exception as BadRequestException).getResponse() as {
          code: string;
        };
        expect(response.code).toBe('VALIDATION_ERROR');
      }
    });
  });
});
