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
import { Injectable, Logger, InternalServerErrorException, } from '@nestjs/common';
let DirectoryAllocator = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var DirectoryAllocator = _classThis = class {
        constructor(configService, fileLockService, localStorageProvider) {
            this.configService = configService;
            this.fileLockService = fileLockService;
            this.localStorageProvider = localStorageProvider;
            this.logger = new Logger(DirectoryAllocator.name);
            this.nodeLimit = this.configService.get('storage', {
                infer: true,
            }).nodeLimit;
        }
        /**
         * 分配目标目录
         * @returns 分配结果
         */
        async allocateDirectory() {
            const currentDate = new Date();
            const yearMonth = this.formatYearMonth(currentDate); // YYYYMM
            this.logger.log(`开始分配目录，当前月份: ${yearMonth}`);
            // 尝试分配主目录
            const mainResult = await this.tryAllocateDirectory(yearMonth);
            if (mainResult) {
                this.logger.log(`分配主目录成功: ${mainResult.targetDirectory}`);
                return mainResult;
            }
            // 主目录已满，尝试分配子目录
            let suffix = 1;
            while (suffix <= 100) {
                // 最多支持 100 个子目录
                const subDirectoryName = `${yearMonth}_${suffix}`;
                const subResult = await this.tryAllocateDirectory(subDirectoryName);
                if (subResult) {
                    this.logger.log(`分配子目录成功: ${subResult.targetDirectory}`);
                    return subResult;
                }
                suffix++;
            }
            throw new InternalServerErrorException(`无法分配目录：所有 ${yearMonth} 相关目录都已满`);
        }
        /**
         * 尝试分配指定目录
         * @param directoryName 目录名称（如：202602 或 202602_1）
         * @returns 分配结果或 null（如果目录已满）
         */
        async tryAllocateDirectory(directoryName) {
            const lockName = `allocate-${directoryName}`;
            try {
                return await this.fileLockService.withLock(lockName, async () => {
                    // 检查目录是否存在
                    const exists = await this.localStorageProvider.directoryExists(directoryName);
                    if (!exists) {
                        // 目录不存在，创建它
                        await this.localStorageProvider.createDirectory(directoryName);
                        this.logger.log(`创建新目录: ${directoryName}`);
                        return {
                            targetDirectory: directoryName,
                            fullPath: this.localStorageProvider['getAbsolutePath'](directoryName),
                            nodeCount: 0,
                        };
                    }
                    // 目录存在，检查节点数量
                    const nodeCount = await this.localStorageProvider.getSubdirectoryCount(directoryName);
                    if (nodeCount >= this.nodeLimit) {
                        this.logger.log(`目录已满: ${directoryName} (${nodeCount}/${this.nodeLimit})`);
                        return null;
                    }
                    // 目录可用
                    return {
                        targetDirectory: directoryName,
                        fullPath: this.localStorageProvider['getAbsolutePath'](directoryName),
                        nodeCount,
                    };
                });
            }
            catch (error) {
                this.logger.error(`分配目录失败: ${directoryName}`, error.stack);
                throw error;
            }
        }
        /**
         * 格式化年月
         * @param date 日期
         * @returns YYYYMM 格式的字符串
         */
        formatYearMonth(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            return `${year}${month}`;
        }
        /**
         * 获取目录信息
         * @param directoryName 目录名称
         * @returns 目录信息
         */
        async getDirectoryInfo(directoryName) {
            const exists = await this.localStorageProvider.directoryExists(directoryName);
            const nodeCount = exists
                ? await this.localStorageProvider.getSubdirectoryCount(directoryName)
                : 0;
            const fullPath = this.localStorageProvider['getAbsolutePath'](directoryName);
            return {
                exists,
                nodeCount,
                fullPath,
            };
        }
        /**
         * 获取所有目录列表
         * @returns 目录列表
         */
        async listDirectories() {
            try {
                const files = await this.localStorageProvider.listFiles('', '');
                const directories = [];
                for (const file of files) {
                    const dirName = file.replace(/\/$/, ''); // 移除末尾斜杠
                    const info = await this.getDirectoryInfo(dirName);
                    if (info.exists) {
                        directories.push({
                            name: dirName,
                            nodeCount: info.nodeCount,
                            isFull: info.nodeCount >= this.nodeLimit,
                        });
                    }
                }
                // 按名称排序
                directories.sort((a, b) => a.name.localeCompare(b.name));
                return directories;
            }
            catch (error) {
                this.logger.error(`获取目录列表失败`, error.stack);
                return [];
            }
        }
    };
    __setFunctionName(_classThis, "DirectoryAllocator");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        DirectoryAllocator = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return DirectoryAllocator = _classThis;
})();
export { DirectoryAllocator };
//# sourceMappingURL=directory-allocator.service.js.map