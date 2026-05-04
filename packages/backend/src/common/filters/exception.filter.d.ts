import { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
export declare class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger;
    private readonly sensitivePatterns;
    catch(exception: unknown, host: ArgumentsHost): void;
    /**
     * 过滤敏感信息
     * @param message 原始消息
     * @returns 过滤后的消息
     */
    private sanitizeMessage;
    private getErrorCode;
}
//# sourceMappingURL=exception.filter.d.ts.map