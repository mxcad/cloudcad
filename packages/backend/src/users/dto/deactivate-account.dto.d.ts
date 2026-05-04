import { ApiResponseDto } from '../../common/dto/api-response.dto';
export declare class DeactivateAccountDto {
    password?: string;
    phoneCode?: string;
    emailCode?: string;
    wechatConfirm?: string;
}
export declare class DeactivateAccountResponseDto {
    message: string;
}
export declare class DeactivateAccountApiResponseDto extends ApiResponseDto<DeactivateAccountResponseDto> {
    data: DeactivateAccountResponseDto;
}
//# sourceMappingURL=deactivate-account.dto.d.ts.map