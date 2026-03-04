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
