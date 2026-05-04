export declare class VerifyEmailDto {
    email: string;
    code: string;
}
export declare class SendVerificationDto {
    email: string;
}
export declare class ResendVerificationDto {
    email: string;
}
export declare class VerifyEmailResponseDto {
    message: string;
}
export declare class SendVerificationResponseDto {
    message: string;
}
export declare class VerifyEmailApiResponseDto {
    code: string;
    message: string;
    data: VerifyEmailResponseDto;
    timestamp: string;
}
export declare class SendVerificationApiResponseDto {
    code: string;
    message: string;
    data: SendVerificationResponseDto;
    timestamp: string;
}
//# sourceMappingURL=email-verification.dto.d.ts.map