import { FileStatus } from '@prisma/client';
export declare enum SearchScope {
    PROJECT = "project",
    PROJECT_FILES = "project_files",
    ALL_PROJECTS = "all_projects",
    LIBRARY = "library"
}
export declare enum SearchType {
    ALL = "all",
    FILE = "file",
    FOLDER = "folder"
}
export declare class SearchDto {
    keyword: string;
    scope?: SearchScope;
    type?: SearchType;
    filter?: 'all' | 'owned' | 'joined';
    projectId?: string;
    libraryKey?: string;
    extension?: string;
    fileStatus?: FileStatus;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
//# sourceMappingURL=search.dto.d.ts.map