import { SmsProvider, SendResult, SmsProviderConfig } from '../interfaces/sms-provider.interface';
/**
 * 阿里云短信服务商
 *
 * 使用阿里云短信服务发送短信
 * 文档: https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25
 */
export declare class AliyunSmsProvider implements SmsProvider {
    readonly name = "aliyun";
    private readonly logger;
    private client;
    private signName;
    private templateCode;
    constructor(config: SmsProviderConfig['aliyun']);
    /**
     * 格式化手机号（移除国际区号前缀）
     */
    private formatPhone;
    sendVerificationCode(phone: string, code: string): Promise<SendResult>;
    sendTemplate(phone: string, templateId: string, params: Record<string, string>): Promise<SendResult>;
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=aliyun.provider.d.ts.map