import { ConversionFormat, ConversionOptions, ConversionEngineConfig } from './interfaces/conversion-service.interface';
/**
 * OutputPathResolverService
 *
 * 统一管理转换输出路径的计算逻辑。
 * 根据源文件路径、目标格式和选项，生成标准化的输出路径，
 * 并确保输出目录存在。
 */
export declare class OutputPathResolverService {
    private readonly config;
    private readonly logger;
    constructor(config: ConversionEngineConfig);
    /** 格式 → 文件扩展名映射 */
    private static readonly FORMAT_EXTENSIONS;
    /**
     * 解析输出文件路径
     *
     * 路径生成规则：
     *   {outputRoot}/{datePrefix}/{timestamp}_{random}.{ext}
     *
     * 如果 options.outputDir 不为空，则优先使用。
     *
     * @param sourcePath - 源文件路径
     * @param format     - 目标格式
     * @param options    - 转换选项
     * @returns 完整的输出文件路径
     */
    resolve(sourcePath: string, format: ConversionFormat, options?: ConversionOptions): string;
    /**
     * 解析输出目录路径
     *
     * 对于 splitToBins 等会产生多个输出文件的场景，
     * 返回一个子目录而非单个文件路径。
     *
     * 目录规则：
     *   {outputRoot}/{datePrefix}/{timestamp}_{random}/
     *
     * @param sourcePath - 源文件路径
     * @param format     - 目标格式
     * @param options    - 转换选项
     * @returns 输出目录路径
     */
    resolveDir(sourcePath: string, format: ConversionFormat, options?: ConversionOptions): string;
    /**
     * 根据源文件生成唯一基础文件名（不含扩展名）
     *
     * 格式：{源文件名}_{timestamp}_{random4}
     */
    private generateBaseName;
    /**
     * 确保目录存在（mkdir -p）
     */
    private ensureDir;
}
//# sourceMappingURL=output-path-resolver.service.d.ts.map