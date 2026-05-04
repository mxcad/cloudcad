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
/////////////////////////////////////////////////////////////////////////////
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
import { Cron } from '@nestjs/schedule';
let UserCleanupScheduler = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _handleCleanup_decorators;
    var UserCleanupScheduler = _classThis = class {
        constructor(userCleanupService) {
            this.userCleanupService = (__runInitializers(this, _instanceExtraInitializers), userCleanupService);
            this.logger = new Logger(UserCleanupScheduler.name);
        }
        /**
         * 每天凌晨 4 点执行用户数据清理任务
         * 在 StorageCleanupScheduler 之后执行，避免竞争
         */
        async handleCleanup() {
            this.logger.log('Starting scheduled user cleanup task');
            try {
                const result = await this.userCleanupService.cleanupExpiredUsers();
                if (result.success) {
                    this.logger.log(`Scheduled user cleanup completed: Processed ${result.processedUsers} users, ` +
                        `deleted ${result.deletedMembers} members, ${result.deletedProjects} projects, ` +
                        `${result.deletedAuditLogs} audit logs, marked ${result.markedForStorageCleanup} storage`);
                }
                else {
                    this.logger.warn(`Scheduled user cleanup completed with errors: Processed ${result.processedUsers} users, ` +
                        `${result.errors.length} errors`);
                    result.errors.forEach((error, index) => {
                        this.logger.warn(`Error ${index + 1} [${error.userId}]: ${error.message}`);
                    });
                }
            }
            catch (error) {
                this.logger.error('Scheduled user cleanup task failed', error.stack);
            }
        }
    };
    __setFunctionName(_classThis, "UserCleanupScheduler");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _handleCleanup_decorators = [Cron('0 4 * * *')];
        __esDecorate(_classThis, null, _handleCleanup_decorators, { kind: "method", name: "handleCleanup", static: false, private: false, access: { has: obj => "handleCleanup" in obj, get: obj => obj.handleCleanup }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        UserCleanupScheduler = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return UserCleanupScheduler = _classThis;
})();
export { UserCleanupScheduler };
//# sourceMappingURL=user-cleanup.scheduler.js.map