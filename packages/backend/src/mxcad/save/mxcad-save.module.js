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
import { DatabaseModule } from '../../database/database.module';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../../common/common.module';
import { FileSystemModule } from '../../file-system/file-system.module';
import { FilePermissionModule } from '../../file-system/file-permission/file-permission.module';
import { VersionControlModule } from '../../version-control/version-control.module';
import { MxcadConversionModule } from '../conversion/mxcad-conversion.module';
import { MxcadNodeModule } from '../node/mxcad-node.module';
import { SaveAsService } from './save-as.service';
/**
 * Mxcad 另存为子模块
 *
 * 职责: 提供 CAD 文件的另存为功能。
 * 将 mxweb 文件转换为 dwg/dxf 格式并保存到目标位置。
 *
 * 包含的服务:
 * - SaveAsService: CAD 另存为主服务
 */
let MxcadSaveModule = (() => {
    let _classDecorators = [Module({
            imports: [
                DatabaseModule,
                ConfigModule,
                CommonModule,
                FileSystemModule,
                FilePermissionModule,
                VersionControlModule,
                MxcadConversionModule,
                MxcadNodeModule,
            ],
            providers: [SaveAsService],
            exports: [SaveAsService],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var MxcadSaveModule = _classThis = class {
    };
    __setFunctionName(_classThis, "MxcadSaveModule");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        MxcadSaveModule = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return MxcadSaveModule = _classThis;
})();
export { MxcadSaveModule };
//# sourceMappingURL=mxcad-save.module.js.map