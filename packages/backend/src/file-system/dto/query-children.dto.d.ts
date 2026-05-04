import { FileStatus } from '@prisma/client';
export declare class QueryChildrenDto {
    search?: string;
    nodeType?: 'folder' | 'file';
    extension?: string;
    fileStatus?: FileStatus;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    includeDeleted?: boolean;
}
//# sourceMappingURL=query-children.dto.d.ts.map