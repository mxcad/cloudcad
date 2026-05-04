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
import { Injectable, Logger } from '@nestjs/common';
/**
 * 存储配额类型枚举
 */
export var StorageQuotaType;
(function (StorageQuotaType) {
    StorageQuotaType["PERSONAL"] = "PERSONAL";
    StorageQuotaType["PROJECT"] = "PROJECT";
    StorageQuotaType["LIBRARY"] = "LIBRARY";
})(StorageQuotaType || (StorageQuotaType = {}));
/**
 * 存储配额服务
 * 负责统一管理三种类型的存储配额逻辑（个人空间、项目、公共资源库）
 */
let StorageQuotaService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var StorageQuotaService = _classThis = class {
        constructor(runtimeConfigService) {
            this.runtimeConfigService = runtimeConfigService;
            this.logger = new Logger(StorageQuotaService.name);
        }
        /**
         * 判断节点的存储配额类型
         * @param node 文件系统节点
         * @returns 存储配额类型
         */
        determineQuotaType(node) {
            // libraryKey !== null → LIBRARY
            if (node.libraryKey) {
                return StorageQuotaType.LIBRARY;
            }
            // isRoot === true → PROJECT
            if (node.isRoot === true) {
                return StorageQuotaType.PROJECT;
            }
            // 其他 → PERSONAL
            return StorageQuotaType.PERSONAL;
        }
        /**
         * 获取存储配额上限
         * @param node 文件系统节点（可选）
         * @returns 配额上限（字节）
         */
        async getStorageQuotaLimit(node) {
            const type = node
                ? this.determineQuotaType(node)
                : StorageQuotaType.PERSONAL;
            // 节点 storageQuota（单位：GB）> RuntimeConfig 默认值
            if (node?.storageQuota && node.storageQuota > 0) {
                // storageQuota 存储 GB 值，转换为字节
                return node.storageQuota * 1024 * 1024 * 1024;
            }
            // 从 RuntimeConfig 获取默认值（单位：GB）
            const configMap = {
                [StorageQuotaType.PERSONAL]: 'userStorageQuota',
                [StorageQuotaType.PROJECT]: 'projectStorageQuota',
                [StorageQuotaType.LIBRARY]: 'libraryStorageQuota',
            };
            // 默认值（单位：GB）
            const defaultValuesGB = {
                [StorageQuotaType.PERSONAL]: 10, // 10GB
                [StorageQuotaType.PROJECT]: 50, // 50GB
                [StorageQuotaType.LIBRARY]: 100, // 100GB
            };
            const configKey = configMap[type];
            const quotaGB = await this.runtimeConfigService.getValue(configKey, defaultValuesGB[type]);
            // GB 转换为字节
            return quotaGB * 1024 * 1024 * 1024;
        }
        /**
         * 更新节点的存储配额
         * @param nodeId 节点 ID
         * @param quotaGB 新配额值（GB）
         * @returns 更新后的节点
         */
        async updateNodeStorageQuota(nodeId, quotaGB) {
            this.logger.log(`更新节点 ${nodeId} 的存储配额为 ${quotaGB} GB`);
            // 注意：这里需要注入 DatabaseService，实际更新逻辑在调用方处理
            // 此方法仅作为接口定义，实际实现在 FileSystemService 中
            throw new Error('此方法应在 FileSystemService 中实现');
        }
    };
    __setFunctionName(_classThis, "StorageQuotaService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        StorageQuotaService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return StorageQuotaService = _classThis;
})();
export { StorageQuotaService };
//# sourceMappingURL=storage-quota.service.js.map