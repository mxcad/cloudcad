import { IConversionService, ConversionResult, ConversionOptions, ConversionEngineConfig } from './interfaces/conversion-service.interface';
import { ProcessRunnerService } from './process-runner.service';
import { OutputPathResolverService } from './output-path-resolver.service';
/**
 * FormatConverterService
 *
 * 实现 IConversionService，内部委托给 ProcessRunnerService 执行实际转换。
 * 所有转换操作遵循统一的流程：
 *   1. 通过 OutputPathResolverService 计算输出路径
 *   2. 构建 MxCAD 转换程序命令行参数
 *   3. 调用 ProcessRunnerService.run() 执行
 *   4. 解析进程输出，返回 ConversionResult
 */
export declare class FormatConverterService implements IConversionService {
    private readonly processRunner;
    private readonly pathResolver;
    private readonly config;
    private readonly logger;
    constructor(processRunner: ProcessRunnerService, pathResolver: OutputPathResolverService, config: ConversionEngineConfig);
    toMxweb(sourcePath: string, options?: ConversionOptions): Promise<ConversionResult>;
    toDwg(sourcePath: string, options?: ConversionOptions): Promise<ConversionResult>;
    toPdf(sourcePath: string, options?: ConversionOptions): Promise<ConversionResult>;
    generateThumbnail(sourcePath: string, options?: ConversionOptions): Promise<ConversionResult>;
    splitToBins(sourcePath: string, options?: ConversionOptions): Promise<ConversionResult>;
    /**
     * 尝试从进程 stdout 的 JSON 输出中提取 newpath 字段，
     * 失败时返回 fallback 路径
     */
    private tryExtractPath;
    /**
     * 尝试从 stdout JSON 中提取文件路径列表
     */
    private tryExtractPaths;
}
//# sourceMappingURL=format-converter.service.d.ts.map