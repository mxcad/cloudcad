import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

async function testJwtConfig() {
  console.log('=== JWT 配置测试 ===');
  
  // 模拟 ConfigService
  const mockConfigService = {
    get: (key: string) => {
      console.log(`读取配置: ${key}`);
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
    const payload = { sub: 'test-user-id', email: 'test@example.com', username: 'testuser' };
    const token = jwtService.sign(payload);
    console.log('生成的 JWT token:', token);

    // 验证 token
    const decoded = jwtService.verify(token);
    console.log('验证结果:', decoded);

    console.log('✅ JWT 配置正常');
  } catch (error) {
    console.error('❌ JWT 配置错误:', error.message);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  testJwtConfig();
}

export { testJwtConfig };