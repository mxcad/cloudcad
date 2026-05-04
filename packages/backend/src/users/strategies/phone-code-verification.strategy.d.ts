import { ISmsVerificationService } from '../../common/interfaces/verification.interface';
import { IAccountVerificationStrategy, VerificationParams, UserVerificationData } from '../interfaces/account-verification-strategy.interface';
export declare class PhoneCodeVerificationStrategy implements IAccountVerificationStrategy {
    private readonly smsVerificationService;
    readonly type = "phoneCode";
    constructor(smsVerificationService: ISmsVerificationService);
    canHandle(params: VerificationParams): boolean;
    validateUser(user: UserVerificationData): boolean;
    verify(user: UserVerificationData, params: VerificationParams): Promise<{
        valid: boolean;
        message?: string;
    }>;
}
//# sourceMappingURL=phone-code-verification.strategy.d.ts.map