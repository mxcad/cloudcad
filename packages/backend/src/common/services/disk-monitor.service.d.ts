import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/app.config';
export interface DiskStats {
    path: string;
    total: number;
    free: number;
    used: number;
    usagePercentage: number;
}
export interface DiskStatus {
    stats: DiskStats;
    warning: boolean;
    critical: boolean;
    message: string;
}
export declare class DiskMonitorService {
    private configService;
    private readonly logger;
    private readonly warningThreshold;
    private readonly criticalThreshold;
    private readonly filesDataPath;
    constructor(configService: ConfigService<AppConfig>);
    /**
     * 获取磁盘统计信息
     * @param filePath 文件路径（默认为 FILES_DATA_PATH）
     * @returns 磁盘统计信息
     */
    getDiskStats(filePath?: string): DiskStats;
    /**
     * 获取磁盘信息
     * @param drivePath 驱动器路径
     * @returns 磁盘信息
     */
    private getDiskInfo;
    /**
     * 检查磁盘状态
     * @param filePath 文件路径（默认为 FILES_DATA_PATH）
     * @returns 磁盘状态
     */
    checkDiskStatus(filePath?: string): DiskStatus;
    /**
     * 检查是否允许上传
     * @param filePath 文件路径（默认为 FILES_DATA_PATH）
     * @returns 是否允许上传
     */
    allowUpload(filePath?: string): boolean;
    /**
     * 格式化字节数
     * @param bytes 字节数
     * @returns 格式化字符串
     */
    private formatBytes;
    /**
     * 获取磁盘健康报告
     * @returns 健康报告
     */
    getHealthReport(): {
        healthy: boolean;
        status: DiskStatus;
        recommendation: string;
    };
}
//# sourceMappingURL=disk-monitor.service.d.ts.map