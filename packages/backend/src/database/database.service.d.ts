import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/app.config';
import { PrismaClient } from '@prisma/client';
export declare class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly configService;
    private readonly logger;
    constructor(configService: ConfigService<AppConfig>);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    healthCheck(): Promise<{
        status: string;
        message: string;
        error?: undefined;
    } | {
        status: string;
        message: string;
        error: any;
    }>;
}
//# sourceMappingURL=database.service.d.ts.map