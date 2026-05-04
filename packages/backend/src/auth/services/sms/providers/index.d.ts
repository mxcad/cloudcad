import { SmsProvider, SmsProviderConfig } from '../interfaces/sms-provider.interface';
import { MockSmsProvider } from './mock.provider';
import { AliyunSmsProvider } from './aliyun.provider';
import { TencentSmsProvider } from './tencent.provider';
/**
 * 短信服务商工厂
 *
 * 根据配置创建对应的短信服务商实例
 */
export declare class SmsProviderFactory {
    private static readonly logger;
    /**
     * 创建短信服务商实例
     * @param config 短信配置
     * @returns 短信服务商实例
     */
    static create(config: SmsProviderConfig): SmsProvider;
}
export { MockSmsProvider, AliyunSmsProvider, TencentSmsProvider };
//# sourceMappingURL=index.d.ts.map