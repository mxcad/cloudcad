/**
 * 微信用户信息 DTO
 */
export declare class WechatUserInfoDto {
    openid: string;
    nickname: string;
    avatar: string;
    sex?: number;
    province?: string;
    city?: string;
    country?: string;
}
/**
 * 微信登录响应中的用户信息 DTO（包含完整用户数据）
 */
export declare class WechatLoginUserDto {
    id: string;
    email?: string;
    username: string;
    nickname?: string;
    avatar?: string;
    wechatId?: string;
    provider: string;
    role: {
        id: string;
        name: string;
        description?: string;
        isSystem: boolean;
        permissions: Array<{
            permission: string;
        }>;
    };
    status: string;
    emailVerified: boolean;
    phone?: string;
    phoneVerified: boolean;
}
/**
 * 微信登录响应 DTO
 */
export declare class WechatLoginResponseDto {
    accessToken: string;
    refreshToken: string;
    user: WechatLoginUserDto;
    requireEmailBinding?: boolean;
    requirePhoneBinding?: boolean;
    tempToken?: string;
    needRegister?: boolean;
}
/**
 * 微信绑定响应 DTO
 */
export declare class WechatBindResponseDto {
    success: boolean;
    message: string;
}
/**
 * 微信解绑响应 DTO
 */
export declare class WechatUnbindResponseDto {
    success: boolean;
    message: string;
}
//# sourceMappingURL=wechat.dto.d.ts.map