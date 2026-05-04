import { RuntimeConfigService } from './runtime-config.service';
import { UpdateRuntimeConfigDto, RuntimeConfigResponseDto, RuntimeConfigDefinitionDto } from './dto/runtime-config.dto';
import type { Request } from 'express';
export declare class RuntimeConfigController {
    private readonly runtimeConfigService;
    constructor(runtimeConfigService: RuntimeConfigService);
    /**
     * 获取前端所需的公开配置（无需登录）
     */
    getPublicConfigs(): Promise<Record<string, string | number | boolean>>;
    /**
     * 获取所有配置项（需要权限）
     */
    getAllConfigs(): Promise<RuntimeConfigResponseDto[]>;
    /**
     * 获取配置定义列表
     */
    getDefinitions(): Promise<RuntimeConfigDefinitionDto[]>;
    /**
     * 获取单个配置项
     */
    getConfig(key: string): Promise<RuntimeConfigResponseDto>;
    /**
     * 更新配置项
     */
    updateConfig(key: string, dto: UpdateRuntimeConfigDto, req: Request): Promise<{
        success: boolean;
    }>;
    /**
     * 重置配置为默认值
     */
    resetConfig(key: string, req: Request): Promise<{
        success: boolean;
    }>;
}
//# sourceMappingURL=runtime-config.controller.d.ts.map