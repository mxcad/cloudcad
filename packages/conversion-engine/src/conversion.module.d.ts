import { DynamicModule } from '@nestjs/common';
import { ConversionEngineConfig } from './interfaces/conversion-service.interface';
export declare class ConversionModule {
    /**
     * 动态初始化转换引擎模块
     *
     * 使用方式：
     * ```typescript
     * ConversionModule.forRoot({
     *   binPath: '/usr/local/mxcad/mxcad_converter',
     *   outputRoot: '/data/conversions',
     *   maxConcurrency: 3,
     * })
     * ```
     *
     * @param config - 转换引擎配置
     */
    static forRoot(config: ConversionEngineConfig): DynamicModule;
}
//# sourceMappingURL=conversion.module.d.ts.map