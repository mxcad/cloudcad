import { OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { DatabaseService } from '../database/database.service';
import { RuntimeConfigDefinition, RuntimeConfigItem } from './runtime-config.types';
export declare class RuntimeConfigService implements OnModuleInit {
    private readonly prisma;
    private readonly redis;
    private readonly logger;
    constructor(prisma: DatabaseService, redis: Redis);
    /**
     * 模块初始化时同步默认配置到数据库
     * 优化：使用异步并行同步，不阻塞启动
     */
    onModuleInit(): Promise<void>;
    /**
     * 同步默认配置到数据库（仅添加不存在的配置项）
     * 优化：使用批量操作减少数据库往返
     */
    private syncDefaultConfigs;
    /**
     * 获取单个配置值（用于内部调用）
     */
    getValue<T = string | number | boolean>(key: string, defaultValue?: T): Promise<T>;
    /**
     * 获取单个配置项（用于 Controller 返回）
     */
    get(key: string): Promise<RuntimeConfigItem>;
    /**
     * 设置配置值
     */
    set(key: string, value: string | number | boolean, operatorId?: string, operatorIp?: string): Promise<void>;
    /**
     * 获取所有公开配置（供前端使用）
     */
    getPublicConfigs(): Promise<Record<string, string | number | boolean>>;
    /**
     * 获取所有配置项（管理后台使用）
     */
    getAllConfigs(): Promise<RuntimeConfigItem[]>;
    /**
     * 重置配置为默认值
     */
    resetToDefault(key: string, operatorId?: string, operatorIp?: string): Promise<void>;
    /**
     * 解析配置值
     */
    private parseValue;
    /**
     * 获取配置定义列表
     */
    getDefinitions(): RuntimeConfigDefinition[];
}
//# sourceMappingURL=runtime-config.service.d.ts.map