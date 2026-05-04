import { IPasswordHasher } from '../interfaces/password-hasher.interface';
import { IAccountVerificationStrategy, VerificationParams, UserVerificationData } from '../interfaces/account-verification-strategy.interface';
export declare class PasswordVerificationStrategy implements IAccountVerificationStrategy {
    private readonly passwordHasher;
    readonly type = "password";
    constructor(passwordHasher: IPasswordHasher);
    canHandle(params: VerificationParams): boolean;
    validateUser(user: UserVerificationData): boolean;
    verify(user: UserVerificationData, params: VerificationParams): Promise<{
        valid: boolean;
        message?: string;
    }>;
}
//# sourceMappingURL=password-verification.strategy.d.ts.map