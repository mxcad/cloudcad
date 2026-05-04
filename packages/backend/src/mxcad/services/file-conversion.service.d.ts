import { ConfigService } from '@nestjs/config';
import type { IFileConversionService, ConversionResult, ConversionOptions } from '../interfaces/file-conversion.interface';
export declare class FileConversionService implements IFileConversionService {
    private readonly configService;
    private readonly logger;
    private readonly mxCadAssemblyPath;
    private readonly mxCadBinPath;
    private readonly mxCadFileExt;
    private readonly compression;
    private readonly conversionRateLimiter;
    constructor(configService: ConfigService);
    /**
     * 将路径解析为绝对路径
     * 确保传递给 mxcadassembly.exe 的路径都是绝对路径
     * @param inputPath 输入路径（可能是相对路径或绝对路径）
     * @returns 绝对路径
     */
    private resolveToAbsolutePath;
    /**
     * 检测是否为 Linux 平台
     */
    private isLinux;
    /**
     * 执行文件转换（带并发限制）
     */
    convertFile(options: ConversionOptions): Promise<ConversionResult>;
    /**
     * 实际执行文件转换（内部方法）
     */
    private executeConversion;
    convertFileAsync(options: ConversionOptions, callbackUrl?: string): Promise<string>;
    checkConversionStatus(taskId: string): Promise<{
        code: number;
        status?: string;
    }>;
    getConvertedExtension(originalFilename: string): string;
    needsConversion(filename: string): boolean;
    /**
     * 将 .bin 文件转换成 .mxweb 文件
     * 用于历史版本访问时从 SVN 中的 bin 文件恢复 mxweb 文件
     * @param binPath bin 文件的完整路径
     * @param outputPath 输出目录
     * @param outName 输出文件名（如 test2.mxweb）
     * @returns 转换结果，包含输出文件路径
     */
    convertBinToMxweb(binPath: string, outputPath: string, outName: string): Promise<{
        success: boolean;
        outputPath?: string;
        error?: string;
    }>;
}
//# sourceMappingURL=file-conversion.service.d.ts.map