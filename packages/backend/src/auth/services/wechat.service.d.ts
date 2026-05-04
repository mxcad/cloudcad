import { ConfigService } from '@nestjs/config';
/**
 * 微信 OAuth 用户信息
 */
export interface WechatUserInfo {
    openid: string;
    nickname: string;
    sex: number;
    province: string;
    city: string;
    country: string;
    headimgurl: string;
    privilege: string[];
    unionid?: string;
}
/**
 * 微信 Token 响应
 */
interface WechatTokenResponse {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    openid: string;
    scope: string;
    unionid?: string;
    errcode?: number;
    errmsg?: string;
}
/**
 * 微信服务 - 处理微信 OAuth2 授权流程
 */
export declare class WechatService {
    private readonly configService;
    private readonly logger;
    private _appId;
    private _packagesecret;
    private _callbackUrl;
    constructor(configService: ConfigService);
    private get appId();
    private get packagesecret();
    private get callbackUrl();
    /**
     * 生成微信授权 URL
     * @param state CSRF 防护状态参数
     * @returns 微信授权 URL
     */
    getAuthUrl(state: string): string;
    /**
     * 通过授权码获取 access_token
     * @param code 微信授权码
     * @returns Token 响应
     */
    getAccessToken(code: string): Promise<WechatTokenResponse>;
    /**
     * 获取微信用户信息
     * @param accessToken access_token
     * @param openid 用户 openid
     * @returns 用户信息
     */
    getUserInfo(accessToken: string, openid: string): Promise<WechatUserInfo>;
    /**
     * 刷新 access_token
     * @param refreshToken refresh_token
     * @returns 新的 Token 响应
     */
    refreshAccessToken(refreshToken: string): Promise<WechatTokenResponse>;
    /**
     * 生成状态参数（CSRF 防护）
     * @returns 随机状态字符串
     */
    generateState(): string;
    /**
     * 验证状态参数
     * @param state 状态参数
     * @returns 是否有效
     */
    validateState(state: string): boolean;
}
export {};
//# sourceMappingURL=wechat.service.d.ts.map