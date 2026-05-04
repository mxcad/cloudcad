///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { Catch, HttpException, HttpStatus, Logger, } from '@nestjs/common';
let GlobalExceptionFilter = (() => {
    let _classDecorators = [Catch()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var GlobalExceptionFilter = _classThis = class {
        constructor() {
            this.logger = new Logger(GlobalExceptionFilter.name);
            // 敏感信息正则表达式
            this.sensitivePatterns = [
                // Windows 路径
                /[A-Za-z]:\\[^\\]+\\[^\\]+/g,
                // Unix/Linux 路径
                /(home|var|tmp|usr|opt|etc)\/[^/]+/g,
                // 磁盘路径
                /[A-Za-z]:\/[^/]+/g,
                // 数据库连接字符串
                /(mongodb|postgresql|mysql):\/\/[^@]+@[^/]+/g,
                // 环境变量
                /\$\{[^}]+\}/g,
                // 绝对路径（通用）
                /[A-Z]:\/[^/]+/gi,
                // 项目路径
                /packages\/(backend|frontend|[^/]+)\//g,
                // Node modules 路径
                /node_modules\/[^/]+/g,
            ];
        }
        catch(exception, host) {
            // 添加日志以确认过滤器是否被调用
            this.logger.debug('[GlobalExceptionFilter] 异常过滤器被调用', {
                exception,
                exceptionType: typeof exception,
                exceptionName: exception instanceof Error ? exception.name : 'unknown',
            });
            const ctx = host.switchToHttp();
            const response = ctx.getResponse();
            const request = ctx.getRequest();
            let status = HttpStatus.INTERNAL_SERVER_ERROR;
            let message = '服务器内部错误';
            let code = 'INTERNAL_SERVER_ERROR';
            const extraFields = {};
            if (exception instanceof HttpException) {
                status = exception.getStatus();
                const exceptionResponse = exception.getResponse();
                // 调试日志
                this.logger.debug(`HttpException response: ${JSON.stringify(exceptionResponse)}, type: ${typeof exceptionResponse}`);
                if (typeof exceptionResponse === 'string') {
                    // NestJS 传入字符串时，getResponse() 返回该字符串
                    message = exceptionResponse;
                    code = this.getErrorCode(status);
                }
                else if (typeof exceptionResponse === 'object' &&
                    exceptionResponse !== null) {
                    // NestJS 标准错误对象格式: { statusCode, message, error }
                    const responseObj = exceptionResponse;
                    // message 可能是字符串或字符串数组
                    const responseMessage = responseObj.message;
                    if (Array.isArray(responseMessage)) {
                        message = responseMessage.join(', ');
                    }
                    else if (typeof responseMessage === 'string') {
                        message = responseMessage;
                    }
                    else {
                        message = exception.message;
                    }
                    code =
                        (typeof responseObj.code === 'string' ? responseObj.code : null) ||
                            this.getErrorCode(status);
                    // 传递额外字段（如 email、phone 等业务数据）
                    for (const key of Object.keys(responseObj)) {
                        if (!['statusCode', 'message', 'error', 'code'].includes(key)) {
                            extraFields[key] = responseObj[key];
                        }
                    }
                }
            }
            else if (exception instanceof Error) {
                message = exception.message;
                this.logger.error(`未处理的异常: ${exception.message}`, exception.stack);
            }
            // 过滤敏感信息
            const sanitizedMessage = this.sanitizeMessage(message);
            const errorResponse = {
                code,
                message: sanitizedMessage,
                ...extraFields,
                timestamp: new Date().toISOString(),
                path: request.url,
                method: request.method,
            };
            // 记录错误日志（包含完整错误信息）
            if (status >= 500) {
                this.logger.error(`${request.method} ${request.url} - ${status} - ${message}`, exception instanceof Error ? exception.stack : exception);
            }
            else {
                this.logger.warn(`${request.method} ${request.url} - ${status} - ${message}`);
            }
            // 确保响应头为 JSON 格式
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.status(status).json(errorResponse);
        }
        /**
         * 过滤敏感信息
         * @param message 原始消息
         * @returns 过滤后的消息
         */
        sanitizeMessage(message) {
            let sanitized = message;
            // 应用所有敏感信息过滤规则
            for (const pattern of this.sensitivePatterns) {
                sanitized = sanitized.replace(pattern, '[REDACTED]');
            }
            // 限制消息长度，防止过长的错误信息
            if (sanitized.length > 500) {
                sanitized = sanitized.substring(0, 500) + '...';
            }
            return sanitized;
        }
        getErrorCode(status) {
            const statusMap = {
                400: 'BAD_REQUEST',
                401: 'UNAUTHORIZED',
                403: 'FORBIDDEN',
                404: 'NOT_FOUND',
                409: 'CONFLICT',
                422: 'UNPROCESSABLE_ENTITY',
                500: 'INTERNAL_SERVER_ERROR',
                503: 'SERVICE_UNAVAILABLE',
            };
            return statusMap[status] || 'UNKNOWN_ERROR';
        }
    };
    __setFunctionName(_classThis, "GlobalExceptionFilter");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        GlobalExceptionFilter = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return GlobalExceptionFilter = _classThis;
})();
export { GlobalExceptionFilter };
//# sourceMappingURL=exception.filter.js.map