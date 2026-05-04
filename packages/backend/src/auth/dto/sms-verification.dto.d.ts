/**
 * 发送短信验证码 DTO
 */
export declare class SendSmsCodeDto {
    phone: string;
}
/**
 * 验证短信验证码 DTO
 */
export declare class VerifySmsCodeDto {
    phone: string;
    code: string;
}
/**
 * 手机号注册 DTO
 */
export declare class RegisterByPhoneDto {
    phone: string;
    code: string;
    username: string;
    password: string;
    nickname?: string;
}
/**
 * 手机号登录 DTO
 */
export declare class LoginByPhoneDto {
    phone: string;
    code: string;
}
/**
 * 绑定手机号 DTO
 */
export declare class BindPhoneDto {
    phone: string;
    code: string;
}
//# sourceMappingURL=sms-verification.dto.d.ts.map