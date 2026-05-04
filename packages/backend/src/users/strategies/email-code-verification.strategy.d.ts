import { IEmailVerificationService } from '../../common/interfaces/verification.interface';
import { IAccountVerificationStrategy, VerificationParams, UserVerificationData } from '../interfaces/account-verification-strategy.interface';
export declare class EmailCodeVerificationStrategy implements IAccountVerificationStrategy {
    private readonly emailVerificationService;
    readonly type = "emailCode";
    constructor(emailVerificationService: IEmailVerificationService);
    canHandle(params: VerificationParams): boolean;
    validateUser(user: UserVerificationData): boolean;
    verify(user: UserVerificationData, params: VerificationParams): Promise<{
        valid: boolean;
        message?: string;
    }>;
}
//# sourceMappingURL=email-code-verification.strategy.d.ts.map