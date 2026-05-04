import { SmsProvider, SendResult, SmsProviderConfig } from '../interfaces/sms-provider.interface';
/**
 * 腾讯云短信服务商
 *
 * 使用腾讯云短信服务发送短信
 * 文档: https://cloud.tencent.com/document/api/382/55981
 */
export declare class TencentSmsProvider implements SmsProvider {
    readonly name = "tencent";
    private readonly logger;
    private client;
    private appId;
    private signName;
    private templateId;
    constructor(config: SmsProviderConfig['tencent']);
    /**
     * 格式化手机号（确保带国际区号）
     */
    private formatPhone;
    sendVerificationCode(phone: string, code: string): Promise<SendResult>;
    sendTemplate(phone: string, templateId: string, params: Record<string, string>): Promise<SendResult>;
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=tencent.provider.d.ts.map