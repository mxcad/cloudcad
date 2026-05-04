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
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
let RestoreAccountDto = (() => {
    var _a;
    let _verificationMethod_decorators;
    let _verificationMethod_initializers = [];
    let _verificationMethod_extraInitializers = [];
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    return _a = class RestoreAccountDto {
            constructor() {
                this.verificationMethod = __runInitializers(this, _verificationMethod_initializers, void 0);
                this.code = (__runInitializers(this, _verificationMethod_extraInitializers), __runInitializers(this, _code_initializers, void 0));
                __runInitializers(this, _code_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _verificationMethod_decorators = [ApiProperty({
                    description: '恢复验证方式：password | phoneCode | emailCode',
                    example: 'password',
                }), IsString()];
            _code_decorators = [ApiProperty({ description: '密码或验证码', example: 'UserPassword123!' }), IsString()];
            __esDecorate(null, null, _verificationMethod_decorators, { kind: "field", name: "verificationMethod", static: false, private: false, access: { has: obj => "verificationMethod" in obj, get: obj => obj.verificationMethod, set: (obj, value) => { obj.verificationMethod = value; } }, metadata: _metadata }, _verificationMethod_initializers, _verificationMethod_extraInitializers);
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { RestoreAccountDto };
let RestoreAccountResponseDto = (() => {
    var _a;
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    return _a = class RestoreAccountResponseDto {
            constructor() {
                this.message = __runInitializers(this, _message_initializers, void 0);
                __runInitializers(this, _message_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _message_decorators = [ApiProperty({ description: '消息' })];
            __esDecorate(null, null, _message_decorators, { kind: "field", name: "message", static: false, private: false, access: { has: obj => "message" in obj, get: obj => obj.message, set: (obj, value) => { obj.message = value; } }, metadata: _metadata }, _message_initializers, _message_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { RestoreAccountResponseDto };
//# sourceMappingURL=restore-account.dto.js.map