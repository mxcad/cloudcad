import { SmsProvider, SendResult } from '../interfaces/sms-provider.interface';
/**
 * Mock 短信服务商
 *
 * 用于开发和测试环境，不发送真实短信，仅在日志中输出
 */
export declare class MockSmsProvider implements SmsProvider {
    readonly name = "mock";
    private readonly logger;
    sendVerificationCode(phone: string, code: string): Promise<SendResult>;
    sendTemplate(phone: string, templateId: string, params: Record<string, string>): Promise<SendResult>;
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=mock.provider.d.ts.map