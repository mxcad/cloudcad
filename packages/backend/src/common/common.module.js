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
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { StorageModule } from '../storage/storage.module';
import { CacheArchitectureModule } from '../cache-architecture/cache-architecture.module';
import { PermissionService } from './services/permission.service';
import { PermissionCacheService } from './services/permission-cache.service';
import { RolesCacheService } from './services/roles-cache.service';
import { FileLockService } from './services/file-lock.service';
import { DirectoryAllocator } from './services/directory-allocator.service';
import { StorageManager } from './services/storage-manager.service';
import { FileCopyService } from './services/file-copy.service';
import { DiskMonitorService } from './services/disk-monitor.service';
import { StorageCleanupService } from './services/storage-cleanup.service';
import { StorageCleanupScheduler } from './schedulers/storage-cleanup.scheduler';
import { RoleInheritanceService } from './services/role-inheritance.service';
import { InitializationService } from './services/initialization.service';
import { FileExtensionsService } from './services/file-extensions.service';
import { UserCleanupService } from './services/user-cleanup.service';
import { UserCleanupScheduler } from './schedulers/user-cleanup.scheduler';
import { UserCleanupController } from './controllers/user-cleanup.controller';
import { ConcurrencyManager } from './concurrency/concurrency-manager';
let CommonModule = (() => {
    let _classDecorators = [Module({
            imports: [ConfigModule, DatabaseModule, RedisModule, StorageModule, forwardRef(() => CacheArchitectureModule)],
            providers: [
                PermissionService,
                PermissionCacheService,
                RolesCacheService,
                FileLockService,
                DirectoryAllocator,
                StorageManager,
                FileCopyService,
                DiskMonitorService,
                StorageCleanupService,
                StorageCleanupScheduler,
                RoleInheritanceService,
                InitializationService,
                FileExtensionsService,
                UserCleanupService,
                UserCleanupScheduler,
                ConcurrencyManager,
            ],
            controllers: [UserCleanupController],
            exports: [
                PermissionService,
                PermissionCacheService,
                RolesCacheService,
                FileLockService,
                DirectoryAllocator,
                StorageManager,
                FileCopyService,
                DiskMonitorService,
                StorageCleanupService,
                RoleInheritanceService,
                InitializationService,
                FileExtensionsService,
                UserCleanupService,
                ConcurrencyManager,
            ],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var CommonModule = _classThis = class {
    };
    __setFunctionName(_classThis, "CommonModule");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        CommonModule = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return CommonModule = _classThis;
})();
export { CommonModule };
//# sourceMappingURL=common.module.js.map