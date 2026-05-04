import { TestingModule } from '@nestjs/testing';
export declare const createTestModule: () => Promise<TestingModule>;
export declare const createMockUser: (overrides?: any) => any;
export declare const createMockProject: (overrides?: any) => any;
export declare const createMockFile: (overrides?: any) => any;
export declare const createMockProjectMember: (overrides?: any) => any;
export declare const createMockFileAccess: (overrides?: any) => any;
export declare const testUsers: {
    admin: {
        id: string;
        email: string;
        username: string;
        nickname: string;
        role: string;
        status: string;
    };
    user: {
        id: string;
        email: string;
        username: string;
        nickname: string;
        role: string;
        status: string;
    };
    inactive: {
        id: string;
        email: string;
        username: string;
        nickname: string;
        role: string;
        status: string;
    };
};
export declare const testTokens: {
    admin: string;
    user: string;
    expired: string;
    invalid: string;
};
export declare const testPermissions: {
    userRead: string;
    userWrite: string;
    userDelete: string;
    projectCreate: string;
    projectRead: string;
    projectWrite: string;
    projectDelete: string;
    fileCreate: string;
    fileRead: string;
    fileWrite: string;
    fileDelete: string;
    fileShare: string;
    fileDownload: string;
};
export declare const mockDatabaseService: {
    user: {
        findUnique: any;
        findFirst: any;
        findMany: any;
        count: any;
        create: any;
        update: any;
        delete: any;
    };
    project: {
        findUnique: any;
        findMany: any;
        create: any;
        update: any;
        delete: any;
    };
    projectMember: {
        findUnique: any;
        findMany: any;
        create: any;
        update: any;
        delete: any;
    };
    file: {
        findUnique: any;
        findMany: any;
        create: any;
        update: any;
        delete: any;
    };
    fileAccess: {
        findUnique: any;
        findMany: any;
        create: any;
        update: any;
        delete: any;
    };
};
export declare const mockJwtService: {
    signAsync: any;
    verify: any;
    sign: any;
};
export declare const mockConfigService: {
    get: any;
};
export declare const mockPermissionService: {
    hasPermission: any;
    hasRole: any;
    hasProjectRole: any;
    hasFileRole: any;
    getProjectPermissions: any;
    getFilePermissions: any;
};
export declare const mockPermissionCacheService: {
    getProjectPermissions: any;
    cacheProjectPermissions: any;
    invalidateProjectPermissions: any;
    getFilePermissions: any;
    cacheFilePermissions: any;
    invalidateFilePermissions: any;
    clearCache: any;
    cleanupExpired: any;
    getCacheStats: any;
};
export declare const mockAuthService: {
    register: any;
    login: any;
    refreshToken: any;
    logout: any;
    validateUser: any;
};
export declare const mockUsersService: {
    create: any;
    findAll: any;
    findOne: any;
    findByEmail: any;
    update: any;
    remove: any;
    updateStatus: any;
    validatePassword: any;
};
export declare const setupTestDatabase: () => Promise<void>;
export declare const cleanupTestDatabase: () => Promise<void>;
export declare const createTestExecutionContext: (user?: any, params?: any, query?: any, body?: any) => {
    switchToHttp: any;
    getHandler: any;
    getClass: any;
};
export declare const expectValidUserResponse: (response: any, expectedUser: any) => void;
export declare const expectValidAuthResponse: (response: any) => void;
export declare const expectPaginatedResponse: (response: any) => void;
export declare const expectErrorResponse: (response: any, statusCode: number, message: string) => void;
export declare const createTestUserData: (overrides?: any) => any;
export declare const createTestProjectData: (overrides?: any) => any;
export declare const createTestFileData: (overrides?: any) => any;
export declare const createTestLoginData: (account: string, password: string) => {
    account: string;
    password: string;
};
export declare const createTestUpdateUserData: (overrides?: any) => any;
//# sourceMappingURL=test-utils.d.ts.map