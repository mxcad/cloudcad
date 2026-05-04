///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
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
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { CommonModule } from '../../common/common.module';
import { FileSystemModule } from '../../file-system/file-system.module';
import { FileSystemService as MainFileSystemService } from '../../file-system/file-system.service';
import { StorageModule } from '../../storage/storage.module';
import { VersionControlModule } from '../../version-control/version-control.module';
import { MxcadInfraModule } from '../infra/mxcad-infra.module';
import { MxcadNodeModule } from '../node/mxcad-node.module';
import { MxcadConversionModule } from '../conversion/mxcad-conversion.module';
import { MxcadExternalRefModule } from '../external-ref/mxcad-external-ref.module';
import { MxcadSaveModule } from '../save/mxcad-save.module';
import { FileMergeService } from './file-merge.service';
import { FileConversionUploadService } from './file-conversion-upload.service';
import { UploadUtilityService } from './upload-utility.service';
import { ChunkUploadManagerService } from './chunk-upload-manager.service';
let MxcadUploadModule = (() => {
    let _classDecorators = [Module({
            imports: [ConfigModule, DatabaseModule, CommonModule, FileSystemModule, StorageModule, VersionControlModule, MxcadInfraModule, MxcadNodeModule, MxcadConversionModule, MxcadExternalRefModule, MxcadSaveModule],
            providers: [
                FileMergeService,
                FileConversionUploadService,
                UploadUtilityService,
                ChunkUploadManagerService,
                { provide: 'FileSystemServiceMain', useExisting: MainFileSystemService },
            ],
            exports: [
                FileMergeService,
                FileConversionUploadService,
                UploadUtilityService,
                ChunkUploadManagerService,
            ],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var MxcadUploadModule = _classThis = class {
    };
    __setFunctionName(_classThis, "MxcadUploadModule");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        MxcadUploadModule = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return MxcadUploadModule = _classThis;
})();
export { MxcadUploadModule };
//# sourceMappingURL=mxcad-upload.module.js.map