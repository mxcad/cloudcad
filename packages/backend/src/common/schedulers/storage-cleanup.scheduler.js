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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
let StorageCleanupScheduler = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _handleCleanup_decorators;
    let _handleTrashCleanup_decorators;
    let _handleLockCleanup_decorators;
    let _handleDiskMonitor_decorators;
    var StorageCleanupScheduler = _classThis = class {
        constructor(storageCleanupService, diskMonitorService, fileLockService) {
            this.storageCleanupService = (__runInitializers(this, _instanceExtraInitializers), storageCleanupService);
            this.diskMonitorService = diskMonitorService;
            this.fileLockService = fileLockService;
            this.logger = new Logger(StorageCleanupScheduler.name);
        }
        /**
         * 每天凌晨 3 点执行清理任务
         */
        async handleCleanup() {
            this.logger.log('Starting scheduled cleanup task');
            try {
                // 执行存储清理
                const result = await this.storageCleanupService.cleanupExpiredStorage();
                this.logger.log(`Scheduled cleanup completed: Deleted ${result.deletedNodes} nodes, cleaned ${result.deletedDirectories} empty directories`);
                if (result.errors.length > 0) {
                    this.logger.warn(`Cleanup task encountered ${result.errors.length} errors`);
                    result.errors.forEach((error, index) => {
                        this.logger.warn(`Error ${index + 1}: ${error}`);
                    });
                }
                // 检查磁盘状态
                const healthReport = this.diskMonitorService.getHealthReport();
                if (!healthReport.healthy) {
                    this.logger.warn(`Disk status abnormal: ${healthReport.status.message}`);
                    this.logger.warn(`Recommendation: ${healthReport.recommendation}`);
                }
                else {
                    this.logger.log(`Disk status normal: ${healthReport.status.message}`);
                }
            }
            catch (error) {
                this.logger.error('Scheduled cleanup task failed', error.stack);
            }
        }
        /**
         * 每天凌晨 4 点执行回收站清理任务
         */
        async handleTrashCleanup() {
            this.logger.log('Starting scheduled trash cleanup task');
            try {
                // 执行回收站清理
                const result = await this.storageCleanupService.cleanupExpiredTrash();
                this.logger.log(`Scheduled trash cleanup completed: Deleted ${result.deletedNodes} items, cleaned ${result.deletedDirectories} empty directories`);
                if (result.errors.length > 0) {
                    this.logger.warn(`Trash cleanup task encountered ${result.errors.length} errors`);
                    result.errors.forEach((error, index) => {
                        this.logger.warn(`Error ${index + 1}: ${error}`);
                    });
                }
            }
            catch (error) {
                this.logger.error('Scheduled trash cleanup task failed', error.stack);
            }
        }
        /**
         * 每周清理一次过期锁文件
         */
        async handleLockCleanup() {
            this.logger.log('Starting expired lock file cleanup');
            try {
                const cleanedCount = await this.fileLockService.cleanupExpiredLocks();
                this.logger.log(`Expired lock file cleanup completed: Cleaned ${cleanedCount} lock files`);
            }
            catch (error) {
                this.logger.error('Expired lock file cleanup failed', error.stack);
            }
        }
        /**
         * 每小时检查一次磁盘状态（仅在警告状态下记录）
         */
        async handleDiskMonitor() {
            try {
                const healthReport = this.diskMonitorService.getHealthReport();
                if (healthReport.status.warning || healthReport.status.critical) {
                    this.logger.warn(`Disk status check: ${healthReport.status.message}`);
                    this.logger.warn(`Recommendation: ${healthReport.recommendation}`);
                }
            }
            catch (error) {
                this.logger.error('Disk status check failed', error.stack);
            }
        }
    };
    __setFunctionName(_classThis, "StorageCleanupScheduler");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _handleCleanup_decorators = [Cron(CronExpression.EVERY_DAY_AT_3AM)];
        _handleTrashCleanup_decorators = [Cron('0 4 * * *')];
        _handleLockCleanup_decorators = [Cron(CronExpression.EVERY_WEEK)];
        _handleDiskMonitor_decorators = [Cron(CronExpression.EVERY_HOUR)];
        __esDecorate(_classThis, null, _handleCleanup_decorators, { kind: "method", name: "handleCleanup", static: false, private: false, access: { has: obj => "handleCleanup" in obj, get: obj => obj.handleCleanup }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _handleTrashCleanup_decorators, { kind: "method", name: "handleTrashCleanup", static: false, private: false, access: { has: obj => "handleTrashCleanup" in obj, get: obj => obj.handleTrashCleanup }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _handleLockCleanup_decorators, { kind: "method", name: "handleLockCleanup", static: false, private: false, access: { has: obj => "handleLockCleanup" in obj, get: obj => obj.handleLockCleanup }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _handleDiskMonitor_decorators, { kind: "method", name: "handleDiskMonitor", static: false, private: false, access: { has: obj => "handleDiskMonitor" in obj, get: obj => obj.handleDiskMonitor }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        StorageCleanupScheduler = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return StorageCleanupScheduler = _classThis;
})();
export { StorageCleanupScheduler };
//# sourceMappingURL=storage-cleanup.scheduler.js.map