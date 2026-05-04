import { ApiResponseDto } from '../../common/dto/api-response.dto';
export declare class RegisterDto {
    email?: string;
    username: string;
    password: string;
    nickname?: string;
    wechatTempToken?: string;
}
export declare class LoginDto {
    account: string;
    password: string;
}
export declare class RefreshTokenDto {
    refreshToken: string;
}
export declare class UserDto {
    id: string;
    email?: string | null;
    username: string;
    nickname?: string;
    avatar?: string;
    role: {
        id: string;
        name: string;
        description: string | null;
        isSystem: boolean;
        permissions: Array<{
            permission: string;
        }>;
    };
    status: string;
    phone?: string | null;
    phoneVerified?: boolean;
    wechatId?: string | null;
    provider?: string;
    hasPassword?: boolean;
}
export declare class AuthResponseDto {
    accessToken: string;
    refreshToken: string;
    user: UserDto;
}
export declare class AuthApiResponseDto extends ApiResponseDto<AuthResponseDto> {
    data: AuthResponseDto;
}
//# sourceMappingURL=auth.dto.d.ts.map