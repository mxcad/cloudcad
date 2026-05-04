import { IAccountVerificationStrategy, VerificationParams, UserVerificationData } from '../interfaces/account-verification-strategy.interface';
export declare class WechatVerificationStrategy implements IAccountVerificationStrategy {
    readonly type = "wechatConfirm";
    canHandle(params: VerificationParams): boolean;
    validateUser(user: UserVerificationData): boolean;
    verify(_user: UserVerificationData, params: VerificationParams): Promise<{
        valid: boolean;
        message?: string;
    }>;
}
//# sourceMappingURL=wechat-verification.strategy.d.ts.map