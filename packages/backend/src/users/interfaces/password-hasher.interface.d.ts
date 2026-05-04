/**
 * 密码哈希器接口
 *
 * 抽象密码哈希/验证逻辑，便于替换算法或测试 mocking。
 */
export declare const PASSWORD_HASHER = "PASSWORD_HASHER";
export interface IPasswordHasher {
    /** 对明文密码进行哈希 */
    hash(plain: string): Promise<string>;
    /** 验证明文密码与哈希是否匹配 */
    compare(plain: string, hash: string): Promise<boolean>;
}
//# sourceMappingURL=password-hasher.interface.d.ts.map