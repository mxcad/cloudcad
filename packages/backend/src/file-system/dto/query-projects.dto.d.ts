import { ProjectStatus } from '@prisma/client';
/**
 * 项目过滤类型
 * - all: 全部项目（我创建的 + 我加入的）
 * - owned: 我创建的项目
 * - joined: 我加入的项目（非创建者）
 */
export declare enum ProjectFilterType {
    ALL = "all",
    OWNED = "owned",
    JOINED = "joined"
}
export declare class QueryProjectsDto {
    search?: string;
    projectStatus?: ProjectStatus;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    filter?: ProjectFilterType;
}
//# sourceMappingURL=query-projects.dto.d.ts.map