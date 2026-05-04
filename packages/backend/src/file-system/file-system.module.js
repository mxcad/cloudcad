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
import { Module } from '@nestjs/common';
import { FileOperationsModule } from '../file-operations/file-operations.module';
import { FileSystemController } from './file-system.controller';
import { FileSystemService } from './file-system.service';
import { FileHashModule } from './file-hash/file-hash.module';
import { FileValidationModule } from './file-validation/file-validation.module';
import { StorageQuotaModule } from './storage-quota/storage-quota.module';
import { FileTreeModule } from './file-tree/file-tree.module';
import { FilePermissionModule } from './file-permission/file-permission.module';
import { ProjectMemberModule } from './project-member/project-member.module';
import { SearchModule } from './search/search.module';
import { FileDownloadModule } from './file-download/file-download.module';
import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';
import { StorageModule } from '../storage/storage.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { RolesModule } from '../roles/roles.module';
import { VersionControlModule } from '../version-control/version-control.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { PersonalSpaceModule } from '../personal-space/personal-space.module';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';
let FileSystemModule = (() => {
    let _classDecorators = [Module({
            imports: [
                DatabaseModule,
                CommonModule,
                StorageModule,
                AuditLogModule,
                RolesModule,
                VersionControlModule,
                RuntimeConfigModule,
                PersonalSpaceModule,
                FileOperationsModule,
                FileHashModule,
                FileValidationModule,
                StorageQuotaModule,
                FileTreeModule,
                FilePermissionModule,
                ProjectMemberModule,
                SearchModule,
                FileDownloadModule,
            ],
            controllers: [FileSystemController],
            providers: [
                FileSystemService,
                RequireProjectPermissionGuard,
            ],
            exports: [
                FileSystemService,
                FileTreeModule,
                FileDownloadModule,
            ],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FileSystemModule = _classThis = class {
    };
    __setFunctionName(_classThis, "FileSystemModule");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FileSystemModule = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FileSystemModule = _classThis;
})();
export { FileSystemModule };
//# sourceMappingURL=file-system.module.js.map