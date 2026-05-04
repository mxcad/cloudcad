/** 短信验证服务接口令牌 */
export declare const SMS_VERIFICATION_SERVICE = "SMS_VERIFICATION_SERVICE";
/** 邮箱验证服务接口令牌 */
export declare const EMAIL_VERIFICATION_SERVICE = "EMAIL_VERIFICATION_SERVICE";
/** 验证结果 */
export interface IVerifyResult {
    valid: boolean;
    message?: string;
}
/** 短信验证服务接口 */
export interface ISmsVerificationService {
    verifyCode(phone: string, code: string): Promise<IVerifyResult>;
}
/** 邮箱验证服务接口 */
export interface IEmailVerificationService {
    verifyEmail(email: string, code: string): Promise<IVerifyResult>;
}
//# sourceMappingURL=verification.interface.d.ts.map