import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RuntimeConfigService } from '../../../runtime-config/runtime-config.service';
/**
 * 短信验证服务
 *
 * 提供短信验证码的发送和验证功能
 *
 * 安全限制：
 * - 发送频率限制：同一手机号 60 秒内只能发送 1 次
 * - 每日发送上限：同一手机号每天最多发送 N 次（默认 10 次）
 * - IP 限制：同一 IP 每小时最多发送 N 次（默认 20 次）
 */
export declare class SmsVerificationService {
    private readonly configService;
    private readonly runtimeConfigService;
    private readonly redis;
    private readonly logger;
    private provider;
    private providerInitialized;
    private readonly codeTTL;
    private readonly rateLimitTTL;
    private readonly limits;
    private readonly verifyLimits;
    constructor(configService: ConfigService, runtimeConfigService: RuntimeConfigService, redis: Redis);
    /**
     * 获取或初始化短信服务商
     */
    private getProvider;
    /**
     * 获取验证码存储 Key
     */
    private getCodeKey;
    /**
     * 获取频率限制 Key（60秒内只能发1次）
     */
    private getRateLimitKey;
    /**
     * 获取每日发送次数 Key
     */
    private getDailyCountKey;
    /**
     * 获取 IP 每小时发送次数 Key
     */
    private getIpHourlyCountKey;
    /**
     * 获取验证尝试次数 Key
     */
    private getVerifyAttemptsKey;
    /**
     * 验证手机号格式
     */
    private validatePhone;
    /**
     * 格式化手机号（统一为中国大陆格式）
     */
    private formatPhone;
    /**
     * 发送验证码
     *
     * @param phone 手机号
     * @param clientIp 客户端 IP 地址
     * @returns 发送结果
     */
    sendVerificationCode(phone: string, clientIp?: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * 获取到午夜的秒数
     */
    private getSecondsUntilMidnight;
    /**
     * 验证验证码
     *
     * @param phone 手机号
     * @param code 验证码
     * @returns 验证结果
     */
    verifyCode(phone: string, code: string): Promise<{
        valid: boolean;
        message: string;
        remainingAttempts?: number;
        expiresIn?: number;
    }>;
    /**
     * 发送模板短信
     *
     * @param phone 手机号
     * @param templateId 模板ID
     * @param params 模板参数
     * @returns 发送结果
     */
    sendTemplate(phone: string, templateId: string, params: Record<string, string>): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * 检查短信服务是否启用
     */
    isEnabled(): Promise<boolean>;
    /**
     * 健康检查
     */
    healthCheck(): Promise<{
        healthy: boolean;
        provider: string;
    }>;
}
//# sourceMappingURL=sms-verification.service.d.ts.map