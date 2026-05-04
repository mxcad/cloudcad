/**
 * 外部参照刷新统计 DTO
 */
export declare class ExternalReferenceStatsDto {
    added?: number;
    updated?: number;
    removed?: number;
}
/**
 * 刷新外部参照响应 DTO
 */
export declare class RefreshExternalReferencesResponseDto {
    code: number;
    message: string;
    stats?: ExternalReferenceStatsDto;
}
//# sourceMappingURL=refresh-external-references-response.dto.d.ts.map