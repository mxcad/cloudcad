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

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

async function testJwtConfig() {
  const logger = new Logger('JwtConfigTest');

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
  } catch (error) {
    logger.warn(`JWT 验证失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  testJwtConfig();
}

export { testJwtConfig };
