/**
 * 短信服务配置
 * 
 * 支持阿里云、腾讯云短信服务商
 * 企业部署时可根据实际需求选择服务商
 * 
 * 注意：短信服务开关（smsEnabled）已迁移到运行时配置系统，
 * 可在管理界面动态开启/关闭，无需重启服务
 */

const smsConfig = {
  // 短信服务商选择
  // 可选值: 'aliyun' | 'tencent' | 'mock'
  // mock 模式仅输出日志，不发送真实短信，用于开发测试
  smsProvider: process.env.SMS_PROVIDER || 'mock',

  // 阿里云短信配置
  // 文档: https://help.aliyun.com/zh/sms/
  aliyun: {
    // 阿里云 AccessKey ID
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
    // 阿里云 AccessKey Secret
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
    // 短信签名名称（需要在阿里云控制台申请）
    signName: process.env.ALIYUN_SMS_SIGN_NAME || '',
    // 验证码短信模板ID
    templateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE || '',
    // 地域ID（可选，默认 cn-hangzhou）
    regionId: process.env.ALIYUN_SMS_REGION_ID || 'cn-hangzhou',
  },

  // 腾讯云短信配置
  // 文档: https://cloud.tencent.com/document/api/382/55981
  tencent: {
    // 腾讯云 SecretId
    secretId: process.env.TENCENT_SECRET_ID || '',
    // 腾讯云 SecretKey
    secretKey: process.env.TENCENT_SECRET_KEY || '',
    // 短信应用ID（SdkAppId）
    appId: process.env.TENCENT_SMS_APP_ID || '',
    // 短信签名名称
    signName: process.env.TENCENT_SMS_SIGN_NAME || '',
    // 验证码短信模板ID
    templateId: process.env.TENCENT_SMS_TEMPLATE_ID || '',
    // 地域（可选，默认 ap-guangzhou）
    region: process.env.TENCENT_SMS_REGION || 'ap-guangzhou',
  },

  // 验证码配置
  verification: {
    // 验证码有效期（秒），默认 5 分钟
    codeTTL: parseInt(process.env.SMS_CODE_TTL || '300', 10),
    // 发送频率限制（秒），默认 60 秒
    rateLimitTTL: parseInt(process.env.SMS_RATE_LIMIT_TTL || '60', 10),
    // 每日发送上限（每个手机号）
    dailyLimit: parseInt(process.env.SMS_DAILY_LIMIT || '10', 10),
  },
};

module.exports = smsConfig;
