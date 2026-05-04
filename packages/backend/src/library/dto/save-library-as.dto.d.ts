/**
 * 图块/图纸另存为到库的 DTO
 * 与普通的 SaveMxwebAsDto 不同，库的 save-as 不需要 targetType、projectId、format 等字段
 */
export declare class SaveLibraryAsDto {
    file?: Express.Multer.File;
    targetParentId: string;
    fileName?: string;
}
//# sourceMappingURL=save-library-as.dto.d.ts.map