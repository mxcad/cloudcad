import { LoginDto, RegisterDto, AuthResponseDto, UserDto } from '../dto/auth.dto';
import { WechatLoginResponseDto } from '../dto/wechat.dto';
import { SessionRequest } from './jwt-payload.interface';
export declare const AUTH_PROVIDER = "IAuthProvider";
export interface IAuthProvider {
    login(credentials: LoginDto, req?: SessionRequest): Promise<AuthResponseDto>;
    loginByPhone(phone: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
    loginByWechat(code: string, state: string): Promise<WechatLoginResponseDto>;
    register(data: RegisterDto, req?: SessionRequest): Promise<AuthResponseDto>;
    refreshToken(token: string): Promise<AuthResponseDto>;
    getUserInfo(userId: string): Promise<UserDto>;
}
//# sourceMappingURL=auth-provider.interface.d.ts.map