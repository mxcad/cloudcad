import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
/**
 * Linux 环境初始化服务
 * 在项目启动时自动配置 Linux 环境所需的权限和依赖
 */
export declare class LinuxInitService implements OnModuleInit {
    private readonly configService;
    private readonly logger;
    private readonly mxcadAssemblyDir;
    constructor(configService: ConfigService);
    /**
     * 模块初始化时执行
     */
    onModuleInit(): Promise<void>;
    /**
     * 初始化 Linux 环境
     * 根据文档要求：
     * 1. 设置 mxcadassembly 目录权限
     * 2. 设置 mx/so 目录权限
     * 3. 复制 locale 文件到系统目录
     */
    private initializeLinuxEnvironment;
    /**
     * 设置 mxcadassembly 主程序权限
     */
    private setExecutablePermissions;
    /**
     * 设置 mx/so 共享库权限
     */
    private setSharedLibraryPermissions;
    /**
     * 复制 locale 文件到系统目录
     */
    private copyLocaleFiles;
    /**
     * 检查 Linux 环境是否已正确配置
     */
    checkEnvironment(): Promise<{
        isConfigured: boolean;
        issues: string[];
    }>;
}
//# sourceMappingURL=linux-init.service.d.ts.map