import { HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import Redis from 'ioredis';
export declare class HealthController {
    private health;
    private databaseService;
    private storageService;
    private readonly redis;
    constructor(health: HealthCheckService, databaseService: DatabaseService, storageService: StorageService, redis: Redis);
    liveness(): Promise<{
        status: string;
        timestamp: string;
        uptime: string;
        memory: {
            heapUsed: string;
            heapTotal: string;
        };
        checks: {
            database: string;
            redis: string;
        };
    }>;
    publicHealth(): Promise<{
        status: string;
        info: {
            database: {
                status: "up" | "down";
                message: string;
            };
            storage: {
                status: "up" | "down";
                message: string;
            };
        };
        error: {};
        details: {};
    }>;
    check(): Promise<HealthCheckResult>;
    checkDatabase(): Promise<{
        status: string;
        message: string;
        error?: undefined;
    } | {
        status: string;
        message: string;
        error: any;
    }>;
    checkStorage(): Promise<{
        status: string;
        message: string;
    }>;
}
//# sourceMappingURL=health.controller.d.ts.map