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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
let DeactivateAccountDto = (() => {
    var _a;
    let _password_decorators;
    let _password_initializers = [];
    let _password_extraInitializers = [];
    let _phoneCode_decorators;
    let _phoneCode_initializers = [];
    let _phoneCode_extraInitializers = [];
    let _emailCode_decorators;
    let _emailCode_initializers = [];
    let _emailCode_extraInitializers = [];
    let _wechatConfirm_decorators;
    let _wechatConfirm_initializers = [];
    let _wechatConfirm_extraInitializers = [];
    return _a = class DeactivateAccountDto {
            constructor() {
                this.password = __runInitializers(this, _password_initializers, void 0);
                this.phoneCode = (__runInitializers(this, _password_extraInitializers), __runInitializers(this, _phoneCode_initializers, void 0));
                this.emailCode = (__runInitializers(this, _phoneCode_extraInitializers), __runInitializers(this, _emailCode_initializers, void 0));
                this.wechatConfirm = (__runInitializers(this, _emailCode_extraInitializers), __runInitializers(this, _wechatConfirm_initializers, void 0));
                __runInitializers(this, _wechatConfirm_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _password_decorators = [ApiPropertyOptional({
                    description: '用户密码（密码登录用户必填）',
                    example: 'UserPassword123!',
                }), IsString({ message: '密码必须是字符串' }), IsOptional()];
            _phoneCode_decorators = [ApiPropertyOptional({
                    description: '手机验证码（绑定手机的用户必填）',
                    example: '123456',
                }), IsString({ message: '验证码必须是字符串' }), IsOptional()];
            _emailCode_decorators = [ApiPropertyOptional({
                    description: '邮箱验证码（邮箱注册用户必填）',
                    example: '123456',
                }), IsString({ message: '验证码必须是字符串' }), IsOptional()];
            _wechatConfirm_decorators = [ApiPropertyOptional({
                    description: '微信扫码验证（微信登录用户必填，值为 \"confirmed\" 表示已确认）',
                    example: 'confirmed',
                }), IsString({ message: '微信验证必须是字符串' }), IsOptional()];
            __esDecorate(null, null, _password_decorators, { kind: "field", name: "password", static: false, private: false, access: { has: obj => "password" in obj, get: obj => obj.password, set: (obj, value) => { obj.password = value; } }, metadata: _metadata }, _password_initializers, _password_extraInitializers);
            __esDecorate(null, null, _phoneCode_decorators, { kind: "field", name: "phoneCode", static: false, private: false, access: { has: obj => "phoneCode" in obj, get: obj => obj.phoneCode, set: (obj, value) => { obj.phoneCode = value; } }, metadata: _metadata }, _phoneCode_initializers, _phoneCode_extraInitializers);
            __esDecorate(null, null, _emailCode_decorators, { kind: "field", name: "emailCode", static: false, private: false, access: { has: obj => "emailCode" in obj, get: obj => obj.emailCode, set: (obj, value) => { obj.emailCode = value; } }, metadata: _metadata }, _emailCode_initializers, _emailCode_extraInitializers);
            __esDecorate(null, null, _wechatConfirm_decorators, { kind: "field", name: "wechatConfirm", static: false, private: false, access: { has: obj => "wechatConfirm" in obj, get: obj => obj.wechatConfirm, set: (obj, value) => { obj.wechatConfirm = value; } }, metadata: _metadata }, _wechatConfirm_initializers, _wechatConfirm_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { DeactivateAccountDto };
let DeactivateAccountResponseDto = (() => {
    var _a;
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    return _a = class DeactivateAccountResponseDto {
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
export { DeactivateAccountResponseDto };
export class DeactivateAccountApiResponseDto extends ApiResponseDto {
}
//# sourceMappingURL=deactivate-account.dto.js.map