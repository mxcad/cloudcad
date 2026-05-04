import { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { QuotaEnforcementService } from '../../file-system/storage-quota/quota-enforcement.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
/**
 * 存储配额拦截器
 * 在文件上传前检查用户配额是否充足
 */
export declare class StorageQuotaInterceptor implements NestInterceptor {
    private readonly quotaEnforcementService;
    private readonly runtimeConfigService;
    private readonly logger;
    constructor(quotaEnforcementService: QuotaEnforcementService, runtimeConfigService: RuntimeConfigService);
    intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>>;
    /**
     * 从请求中提取文件大小
     * 支持多种上传方式：Multer 单文件/多文件、Base64、分片上传等
     */
    private extractFileSize;
    /**
     * 从请求中提取父节点 ID
     * 支持多种参数名称和位置（body、query、params）
     */
    private extractParentNodeId;
}
//# sourceMappingURL=storage-quota.interceptor.d.ts.map