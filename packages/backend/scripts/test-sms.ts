///////////////////////////////////////////////////////////////////////////////
// 短信验证码发送测试脚本
// 使用方式: npx ts-node scripts/test-sms.ts
///////////////////////////////////////////////////////////////////////////////

import { SmsProviderFactory, MockSmsProvider } from '../src/auth/services/sms/providers';
import type { SmsProviderConfig } from '../src/auth/services/sms/interfaces/sms-provider.interface';

async function main() {
  console.log('=== 短信验证码发送测试 ===\n');

  // 从环境变量读取配置
  const config: SmsProviderConfig = {
    provider: (process.env.SMS_PROVIDER as 'aliyun' | 'tencent' | 'mock') || 'mock',
    aliyun: {
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
    signName: process.env.ALIYUN_SMS_SIGN_NAME || '',
    templateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE || '',
    regionId: process.env.ALIYUN_SMS_REGION_ID || 'cn-hangzhou',
  },
    tencent: {
    secretId: process.env.TENCENT_SECRET_ID || '',
    secretKey: process.env.TENCENT_SECRET_KEY || '',
    appId: process.env.TENCENT_SMS_APP_ID || '',
    signName: process.env.TENCENT_SMS_SIGN_NAME || '',
    templateId: process.env.TENCENT_SMS_TEMPLATE_ID || '',
    region: process.env.TENCENT_SMS_REGION || 'ap-guangzhou',
  },
  };

  console.log(`服务商: ${config.provider}`);
  console.log('');

  // 创建 Provider
  const provider = SmsProviderFactory.create(config);
  console.log(`Provider 名称: ${provider.name}\n`);

  // 测试手机号（请替换为真实手机号）
  const testPhone = process.env.TEST_PHONE || '13800138000';
  const testCode = '123456';

  console.log(`测试手机号: ${testPhone}`);
  console.log(`测试验证码: ${testCode}`);
  console.log('');

  // 发送验证码
  console.log('正在发送验证码...');
  const result = await provider.sendVerificationCode(testPhone, testCode);

  console.log('发送结果:');
  console.log(`  成功: ${result.success}`);
  console.log(`  消息ID: ${result.messageId || 'N/A'}`);
  console.log(`  错误码: ${result.code || 'N/A'}`);
  console.log(`  错误信息: ${result.message || 'N/A'}`);
  console.log('');

  // 健康检查
  const healthResult = await provider.healthCheck();
  console.log(`健康检查: ${healthResult ? '正常' : '异常'}`);

  console.log('\n=== 测试完成 ===');
}

main()
  .catch((error) => {
    console.error('测试失败:', error);
    process.exit(1);
  });
