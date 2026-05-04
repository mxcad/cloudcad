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
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../../common/common.module';
import { FileSystemModule } from '../../file-system/file-system.module';
import { FileSystemService as MainFileSystemService } from '../../file-system/file-system.service';
import { VersionControlModule } from '../../version-control/version-control.module';
import { MxcadNodeModule } from '../node/mxcad-node.module';
import { MxcadConversionModule } from '../conversion/mxcad-conversion.module';
import { MxcadChunkModule } from '../chunk/mxcad-chunk.module';
import { MxcadInfraModule } from '../infra/mxcad-infra.module';
import { MxcadUploadModule } from '../upload/mxcad-upload.module';
import { MxcadExternalRefModule } from '../external-ref/mxcad-external-ref.module';
import { MxcadSaveModule } from '../save/mxcad-save.module';
import { UploadOrchestrator } from './upload.orchestrator';
import { FileUploadManagerFacadeService } from './file-upload-manager-facade.service';
/**
 * Mxcad 上传编排子模块
 *
 * 职责: 提供上传流程的编排服务。
 *
 * 包含的服务:
 * - UploadOrchestrator: 上传流程编排器
 * - FileUploadManagerFacadeService: 上传管理器门面
 */
let MxcadFacadeModule = (() => {
    let _classDecorators = [Module({
            imports: [
                ConfigModule,
                CommonModule,
                FileSystemModule,
                VersionControlModule,
                MxcadNodeModule,
                MxcadConversionModule,
                MxcadChunkModule,
                MxcadInfraModule,
                MxcadUploadModule,
                MxcadExternalRefModule,
                MxcadSaveModule,
            ],
            providers: [
                UploadOrchestrator,
                FileUploadManagerFacadeService,
                { provide: 'FileSystemServiceMain', useExisting: MainFileSystemService },
            ],
            exports: [
                UploadOrchestrator,
                FileUploadManagerFacadeService,
            ],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var MxcadFacadeModule = _classThis = class {
    };
    __setFunctionName(_classThis, "MxcadFacadeModule");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        MxcadFacadeModule = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return MxcadFacadeModule = _classThis;
})();
export { MxcadFacadeModule };
//# sourceMappingURL=mxcad-facade.module.js.map