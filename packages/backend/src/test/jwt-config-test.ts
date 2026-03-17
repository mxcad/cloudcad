///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

async function testJwtConfig() {
  // 模拟 ConfigService
  const mockConfigService = {
    get: (key: string) => {
      switch (key) {
        case 'jwt.secret':
          return 'your-super-secret-jwt-key-change-in-production';
        case 'jwt.expiresIn':
          return '1h';
        case 'jwt.refreshExpiresIn':
          return '7d';
        default:
          return undefined;
      }
    },
  } as ConfigService;

  try {
    const jwtService = new JwtService({
      secret: mockConfigService.get('jwt.secret'),
      signOptions: {
        expiresIn: mockConfigService.get('jwt.expiresIn'),
      },
    });

    // 创建测试 token
    const payload = {
      sub: 'test-user-id',
      email: 'test@example.com',
      username: 'testuser',
    };
    const token = jwtService.sign(payload);
    // 验证 token
    const decoded = jwtService.verify(token);
  } catch (error) {}
}

// 如果直接运行此文件
if (require.main === module) {
  testJwtConfig();
}

export { testJwtConfig };
