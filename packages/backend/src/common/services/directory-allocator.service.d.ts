import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/app.config';
import { FileLockService } from './file-lock.service';
import { LocalStorageProvider } from '../../storage/local-storage.provider';
export interface AllocationResult {
    targetDirectory: string;
    fullPath: string;
    nodeCount: number;
}
export declare class DirectoryAllocator {
    private readonly configService;
    private readonly fileLockService;
    private readonly localStorageProvider;
    private readonly logger;
    private readonly nodeLimit;
    constructor(configService: ConfigService<AppConfig>, fileLockService: FileLockService, localStorageProvider: LocalStorageProvider);
    /**
     * 分配目标目录
     * @returns 分配结果
     */
    allocateDirectory(): Promise<AllocationResult>;
    /**
     * 尝试分配指定目录
     * @param directoryName 目录名称（如：202602 或 202602_1）
     * @returns 分配结果或 null（如果目录已满）
     */
    private tryAllocateDirectory;
    /**
     * 格式化年月
     * @param date 日期
     * @returns YYYYMM 格式的字符串
     */
    private formatYearMonth;
    /**
     * 获取目录信息
     * @param directoryName 目录名称
     * @returns 目录信息
     */
    getDirectoryInfo(directoryName: string): Promise<{
        exists: boolean;
        nodeCount: number;
        fullPath: string;
    }>;
    /**
     * 获取所有目录列表
     * @returns 目录列表
     */
    listDirectories(): Promise<Array<{
        name: string;
        nodeCount: number;
        isFull: boolean;
    }>>;
}
//# sourceMappingURL=directory-allocator.service.d.ts.map