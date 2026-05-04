import { ApiResponseDto } from '../../common/dto/api-response.dto';
export declare class ForgotPasswordDto {
    email?: string;
    phone?: string;
    validateContact: string;
}
export declare class ResetPasswordDto {
    email?: string;
    phone?: string;
    code: string;
    newPassword: string;
    confirmPassword: string;
    validateContact: string;
}
export declare class ChangePasswordDto {
    oldPassword?: string;
    newPassword: string;
}
export declare class ForgotPasswordResponseDto {
    message: string;
    mailEnabled: boolean;
    smsEnabled: boolean;
    supportEmail?: string;
    supportPhone?: string;
}
export declare class ResetPasswordResponseDto {
    message: string;
}
export declare class ChangePasswordResponseDto {
    message: string;
}
export declare class ForgotPasswordApiResponseDto extends ApiResponseDto<ForgotPasswordResponseDto> {
    data: ForgotPasswordResponseDto;
}
export declare class ResetPasswordApiResponseDto extends ApiResponseDto<ResetPasswordResponseDto> {
    data: ResetPasswordResponseDto;
}
export declare class ChangePasswordApiResponseDto extends ApiResponseDto<ChangePasswordResponseDto> {
    data: ChangePasswordResponseDto;
}
export declare class BindEmailDto {
    email: string;
}
export declare class VerifyBindEmailDto {
    email: string;
    code: string;
}
export declare class BindEmailResponseDto {
    message: string;
}
export declare class BindEmailApiResponseDto extends ApiResponseDto<BindEmailResponseDto> {
    data: BindEmailResponseDto;
}
//# sourceMappingURL=password-reset.dto.d.ts.map