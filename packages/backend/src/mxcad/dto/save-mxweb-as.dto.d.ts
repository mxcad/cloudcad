export declare class SaveMxwebAsDto {
    file?: Express.Multer.File;
    targetType: 'personal' | 'project';
    targetParentId: string;
    projectId?: string;
    format?: 'dwg' | 'dxf';
    commitMessage?: string;
    fileName?: string;
}
//# sourceMappingURL=save-mxweb-as.dto.d.ts.map