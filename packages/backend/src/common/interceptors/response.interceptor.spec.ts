///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<any>;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;

  beforeEach(() => {
    interceptor = new ResponseInterceptor();

    mockExecutionContext = {} as ExecutionContext;

    mockCallHandler = {
      handle: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('intercept', () => {
    it('should wrap response data with standard format', (done) => {
      const testData = { id: '1', name: 'Test' };
      mockCallHandler.handle = jest.fn().mockReturnValue(of(testData));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: (response) => {
          expect(response).toEqual({
            code: 'SUCCESS',
            message: '操作成功',
            data: testData,
            timestamp: expect.any(String),
          });
          done();
        },
      });
    });

    it('should handle null data', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of(null));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: (response) => {
          expect(response).toEqual({
            code: 'SUCCESS',
            message: '操作成功',
            data: null,
            timestamp: expect.any(String),
          });
          done();
        },
      });
    });

    it('should handle undefined data', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of(undefined));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: (response) => {
          expect(response).toEqual({
            code: 'SUCCESS',
            message: '操作成功',
            data: undefined,
            timestamp: expect.any(String),
          });
          done();
        },
      });
    });

    it('should handle array data', (done) => {
      const testData = [
        { id: '1', name: 'Test1' },
        { id: '2', name: 'Test2' },
      ];
      mockCallHandler.handle = jest.fn().mockReturnValue(of(testData));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: (response) => {
          expect(response).toEqual({
            code: 'SUCCESS',
            message: '操作成功',
            data: testData,
            timestamp: expect.any(String),
          });
          done();
        },
      });
    });

    it('should handle string data', (done) => {
      const testData = 'Success message';
      mockCallHandler.handle = jest.fn().mockReturnValue(of(testData));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: (response) => {
          expect(response).toEqual({
            code: 'SUCCESS',
            message: '操作成功',
            data: testData,
            timestamp: expect.any(String),
          });
          done();
        },
      });
    });

    it('should handle number data', (done) => {
      const testData = 42;
      mockCallHandler.handle = jest.fn().mockReturnValue(of(testData));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: (response) => {
          expect(response).toEqual({
            code: 'SUCCESS',
            message: '操作成功',
            data: testData,
            timestamp: expect.any(String),
          });
          done();
        },
      });
    });

    it('should handle boolean data', (done) => {
      const testData = true;
      mockCallHandler.handle = jest.fn().mockReturnValue(of(testData));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: (response) => {
          expect(response).toEqual({
            code: 'SUCCESS',
            message: '操作成功',
            data: testData,
            timestamp: expect.any(String),
          });
          done();
        },
      });
    });

    it('should include valid ISO timestamp', (done) => {
      const testData = { test: 'data' };
      mockCallHandler.handle = jest.fn().mockReturnValue(of(testData));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: (response) => {
          expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
          const timestamp = new Date(response.timestamp);
          expect(timestamp.getTime()).not.toBeNaN();
          done();
        },
      });
    });

    it('should preserve nested object structure', (done) => {
      const testData = {
        user: {
          id: '1',
          profile: {
            name: 'Test',
            settings: {
              theme: 'dark',
            },
          },
        },
      };
      mockCallHandler.handle = jest.fn().mockReturnValue(of(testData));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: (response) => {
          expect(response.data).toEqual(testData);
          expect(response.data.user.profile.settings.theme).toBe('dark');
          done();
        },
      });
    });
  });
});
