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
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MxcadInfraModule } from '../infra/mxcad-infra.module';
import { MxcadCoreModule } from '../core/mxcad-core.module';
import { MxcadUploadModule } from '../upload/mxcad-upload.module';
import { FileSystemModule } from '../../file-system/file-system.module';
import { TusService } from './tus.service';
import { TusEventHandler } from './tus-event-handler.service';
import { TusAuthMiddleware } from './tus-auth.middleware';
/**
 * Tus 上传协议模块
 *
 * 基于 @tus/server 实现标准 tus 协议的分片上传服务。
 * 替换原有的 MxcadChunkModule + MxcadUploadModule 自定义分片逻辑。
 *
 * tus 协议端点：
 *   POST   /api/v1/files              — 创建上传会话
 *   PATCH  /api/v1/files/:id          — 上传分片数据
 *   HEAD   /api/v1/files/:id          — 检查上传状态
 *   DELETE /api/v1/files/:id          — 取消上传
 *
 * 事件处理:
 *   onUploadFinish — 上传完成后触发文件转换和节点创建
 */
let TusModule = (() => {
    let _classDecorators = [Module({
            imports: [
                ConfigModule,
                MxcadInfraModule,
                MxcadCoreModule,
                MxcadUploadModule,
                forwardRef(() => FileSystemModule),
                JwtModule.registerAsync({
                    imports: [ConfigModule],
                    useFactory: async (configService) => ({
                        secret: configService.get('jwt.secret', { infer: true }),
                    }),
                    inject: [ConfigService],
                }),
            ],
            providers: [TusService, TusEventHandler, TusAuthMiddleware],
            exports: [TusService, TusAuthMiddleware],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var TusModule = _classThis = class {
    };
    __setFunctionName(_classThis, "TusModule");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        TusModule = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return TusModule = _classThis;
})();
export { TusModule };
//# sourceMappingURL=tus.module.js.map