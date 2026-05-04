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
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../../database/database.module';
import { CommonModule } from '../../common/common.module';
import { FileSystemModule } from '../../file-system/file-system.module';
import { FilePermissionModule } from '../../file-system/file-permission/file-permission.module';
import { StorageQuotaModule } from '../../file-system/storage-quota/storage-quota.module';
import { StorageModule } from '../../storage/storage.module';
import { VersionControlModule } from '../../version-control/version-control.module';
import { RolesModule } from '../../roles/roles.module';
import { RuntimeConfigModule } from '../../runtime-config/runtime-config.module';
import { MxcadInfraModule } from '../infra/mxcad-infra.module';
import { MxcadConversionModule } from '../conversion/mxcad-conversion.module';
import { MxcadNodeModule } from '../node/mxcad-node.module';
import { MxcadExternalRefModule } from '../external-ref/mxcad-external-ref.module';
import { MxcadFacadeModule } from '../facade/mxcad-facade.module';
import { MxcadSaveModule } from '../save/mxcad-save.module';
import { MxCadService } from './mxcad.service';
import { MxcadFileHandlerService } from './mxcad-file-handler.service';
import { MxCadController } from './mxcad.controller';
/**
 * Mxcad 核心子模块
 *
 * 职责: 提供 MxCAD 模块的核心服务和 API 控制器。
 * 依赖所有下层子模块。
 *
 * 包含的服务:
 * - MxCadService: CAD 文件操作主入口
 * - MxcadFileHandlerService: 文件流式传输服务
 * - MxCadController: 所有上传/下载/转换 API
 */
let MxcadCoreModule = (() => {
    let _classDecorators = [Module({
            imports: [
                ConfigModule,
                DatabaseModule,
                CommonModule,
                RuntimeConfigModule,
                FileSystemModule,
                FilePermissionModule,
                StorageQuotaModule,
                StorageModule,
                VersionControlModule,
                RolesModule,
                JwtModule,
                MxcadInfraModule,
                MxcadConversionModule,
                MxcadNodeModule,
                MxcadExternalRefModule,
                MxcadFacadeModule,
                MxcadSaveModule,
            ],
            controllers: [MxCadController],
            providers: [
                MxCadService,
                MxcadFileHandlerService,
            ],
            exports: [
                MxCadService,
                MxcadFileHandlerService,
            ],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var MxcadCoreModule = _classThis = class {
    };
    __setFunctionName(_classThis, "MxcadCoreModule");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        MxcadCoreModule = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return MxcadCoreModule = _classThis;
})();
export { MxcadCoreModule };
//# sourceMappingURL=mxcad-core.module.js.map