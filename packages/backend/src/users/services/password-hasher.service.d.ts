import { IPasswordHasher } from '../interfaces/password-hasher.interface';
/**
 * bcrypt 密码哈希实现
 */
export declare class BcryptPasswordHasher implements IPasswordHasher {
    private readonly saltRounds;
    hash(plain: string): Promise<string>;
    compare(plain: string, hash: string): Promise<boolean>;
}
//# sourceMappingURL=password-hasher.service.d.ts.map