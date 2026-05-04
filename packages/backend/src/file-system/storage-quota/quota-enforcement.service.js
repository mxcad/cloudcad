///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
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
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
/**
 * 配额强制执行服务
 * 负责在上传前检查配额是否充足
 */
let QuotaEnforcementService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var QuotaEnforcementService = _classThis = class {
        constructor(storageInfoService) {
            this.storageInfoService = storageInfoService;
            this.logger = new Logger(QuotaEnforcementService.name);
        }
        /**
         * 检查上传是否超出配额
         * @param userId 用户 ID
         * @param nodeId 目标节点 ID（用于判断配额类型）
         * @param fileSize 文件大小（字节）
         * @throws BadRequestException 如果超出配额
         */
        async checkUploadQuota(userId, nodeId, fileSize) {
            // 获取节点的配额信息
            const quotaInfo = await this.storageInfoService.getStorageQuota(userId, nodeId);
            // 检查剩余空间是否足够
            if (quotaInfo.remaining < fileSize) {
                this.logger.warn(`用户 ${userId} 上传文件超出配额: ` +
                    `需要 ${fileSize} 字节, 剩余 ${quotaInfo.remaining} 字节`);
                const error = {
                    code: 'QUOTA_EXCEEDED',
                    message: `存储空间不足。当前已使用 ${this.formatSize(quotaInfo.used)} / ${this.formatSize(quotaInfo.total)}，` +
                        `还需 ${this.formatSize(fileSize - quotaInfo.remaining)} 空间。`,
                    quotaInfo: {
                        used: quotaInfo.used,
                        total: quotaInfo.total,
                        remaining: quotaInfo.remaining,
                        usagePercent: quotaInfo.usagePercent,
                    },
                };
                throw new BadRequestException(error);
            }
            return { allowed: true, quotaInfo };
        }
        /**
         * 检查用户是否已超额使用配额
         * @param userId 用户 ID
         * @param nodeId 目标节点 ID
         */
        async isQuotaExceeded(userId, nodeId) {
            const quotaInfo = await this.storageInfoService.getStorageQuota(userId, nodeId);
            return quotaInfo.used > quotaInfo.total;
        }
        /**
         * 获取配额超额详情
         * @param userId 用户 ID
         * @param nodeId 目标节点 ID
         */
        async getQuotaExceededDetails(userId, nodeId) {
            const quotaInfo = await this.storageInfoService.getStorageQuota(userId, nodeId);
            const isExceeded = quotaInfo.used > quotaInfo.total;
            const exceededBy = isExceeded ? quotaInfo.used - quotaInfo.total : 0;
            const suggestions = [];
            if (isExceeded) {
                suggestions.push('删除不需要的文件');
                suggestions.push('联系管理员增加配额');
                suggestions.push('清理回收站中的文件');
            }
            return {
                isExceeded,
                exceededBy,
                quotaInfo,
                suggestions,
            };
        }
        /**
         * 格式化文件大小显示
         */
        formatSize(bytes) {
            if (bytes >= 1024 * 1024 * 1024) {
                return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
            }
            if (bytes >= 1024 * 1024) {
                return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
            }
            return `${(bytes / 1024).toFixed(2)} KB`;
        }
    };
    __setFunctionName(_classThis, "QuotaEnforcementService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        QuotaEnforcementService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return QuotaEnforcementService = _classThis;
})();
export { QuotaEnforcementService };
//# sourceMappingURL=quota-enforcement.service.js.map