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
import { IsEmail, IsNotEmpty, IsString, MinLength, Validate, IsOptional, IsMobilePhone, } from 'class-validator';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { IsMatch } from '../../common/decorators/validation.decorator';
let ForgotPasswordDto = (() => {
    var _a;
    let _email_decorators;
    let _email_initializers = [];
    let _email_extraInitializers = [];
    let _phone_decorators;
    let _phone_initializers = [];
    let _phone_extraInitializers = [];
    let _validateContact_decorators;
    let _validateContact_initializers = [];
    let _validateContact_extraInitializers = [];
    return _a = class ForgotPasswordDto {
            constructor() {
                this.email = __runInitializers(this, _email_initializers, void 0);
                this.phone = (__runInitializers(this, _email_extraInitializers), __runInitializers(this, _phone_initializers, void 0));
                this.validateContact = (__runInitializers(this, _phone_extraInitializers), __runInitializers(this, _validateContact_initializers, void 0));
                __runInitializers(this, _validateContact_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _email_decorators = [ApiPropertyOptional({ description: '邮箱地址', example: 'user@example.com' }), IsEmail({}, { message: '邮箱格式不正确' }), IsOptional()];
            _phone_decorators = [ApiPropertyOptional({ description: '手机号码', example: '13800138000' }), IsMobilePhone('zh-CN', {}, { message: '手机号格式不正确' }), IsOptional()];
            _validateContact_decorators = [ApiProperty({
                    description: '验证联系方式（内部使用，用于触发邮箱或手机号验证器）',
                    example: '',
                }), Validate(HasEmailOrPhone, { message: '必须提供邮箱或手机号' })];
            __esDecorate(null, null, _email_decorators, { kind: "field", name: "email", static: false, private: false, access: { has: obj => "email" in obj, get: obj => obj.email, set: (obj, value) => { obj.email = value; } }, metadata: _metadata }, _email_initializers, _email_extraInitializers);
            __esDecorate(null, null, _phone_decorators, { kind: "field", name: "phone", static: false, private: false, access: { has: obj => "phone" in obj, get: obj => obj.phone, set: (obj, value) => { obj.phone = value; } }, metadata: _metadata }, _phone_initializers, _phone_extraInitializers);
            __esDecorate(null, null, _validateContact_decorators, { kind: "field", name: "validateContact", static: false, private: false, access: { has: obj => "validateContact" in obj, get: obj => obj.validateContact, set: (obj, value) => { obj.validateContact = value; } }, metadata: _metadata }, _validateContact_initializers, _validateContact_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { ForgotPasswordDto };
/**
 * 自定义验证器：确保邮箱或手机号至少提供一个
 */
function HasEmailOrPhone(value, args) {
    const dto = args.object;
    return !!(dto.email || dto.phone);
}
let ResetPasswordDto = (() => {
    var _a;
    let _email_decorators;
    let _email_initializers = [];
    let _email_extraInitializers = [];
    let _phone_decorators;
    let _phone_initializers = [];
    let _phone_extraInitializers = [];
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    let _newPassword_decorators;
    let _newPassword_initializers = [];
    let _newPassword_extraInitializers = [];
    let _confirmPassword_decorators;
    let _confirmPassword_initializers = [];
    let _confirmPassword_extraInitializers = [];
    let _validateContact_decorators;
    let _validateContact_initializers = [];
    let _validateContact_extraInitializers = [];
    return _a = class ResetPasswordDto {
            constructor() {
                this.email = __runInitializers(this, _email_initializers, void 0);
                this.phone = (__runInitializers(this, _email_extraInitializers), __runInitializers(this, _phone_initializers, void 0));
                this.code = (__runInitializers(this, _phone_extraInitializers), __runInitializers(this, _code_initializers, void 0));
                this.newPassword = (__runInitializers(this, _code_extraInitializers), __runInitializers(this, _newPassword_initializers, void 0));
                this.confirmPassword = (__runInitializers(this, _newPassword_extraInitializers), __runInitializers(this, _confirmPassword_initializers, void 0));
                this.validateContact = (__runInitializers(this, _confirmPassword_extraInitializers), __runInitializers(this, _validateContact_initializers, void 0));
                __runInitializers(this, _validateContact_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _email_decorators = [ApiPropertyOptional({ description: '邮箱地址', example: 'user@example.com' }), IsEmail({}, { message: '邮箱格式不正确' }), IsOptional()];
            _phone_decorators = [ApiPropertyOptional({ description: '手机号码', example: '13800138000' }), IsMobilePhone('zh-CN', {}, { message: '手机号格式不正确' }), IsOptional()];
            _code_decorators = [ApiProperty({ description: '验证码', example: '123456' }), IsString({ message: '验证码必须是字符串' }), IsNotEmpty({ message: '验证码不能为空' })];
            _newPassword_decorators = [ApiProperty({ description: '新密码', example: 'NewPassword123!' }), IsString({ message: '密码必须是字符串' }), MinLength(6, { message: '密码至少 6 个字符' }), IsNotEmpty({ message: '密码不能为空' })];
            _confirmPassword_decorators = [ApiProperty({ description: '确认新密码', example: 'NewPassword123!' }), IsString({ message: '确认密码必须是字符串' }), IsNotEmpty({ message: '确认密码不能为空' }), Validate(IsMatch, ['newPassword'], {
                    message: '两次输入的密码不一致',
                })];
            _validateContact_decorators = [ApiProperty({
                    description: '验证联系方式（内部使用，用于触发邮箱或手机号验证器）',
                    example: '',
                }), Validate(HasEmailOrPhoneReset, { message: '必须提供邮箱或手机号' })];
            __esDecorate(null, null, _email_decorators, { kind: "field", name: "email", static: false, private: false, access: { has: obj => "email" in obj, get: obj => obj.email, set: (obj, value) => { obj.email = value; } }, metadata: _metadata }, _email_initializers, _email_extraInitializers);
            __esDecorate(null, null, _phone_decorators, { kind: "field", name: "phone", static: false, private: false, access: { has: obj => "phone" in obj, get: obj => obj.phone, set: (obj, value) => { obj.phone = value; } }, metadata: _metadata }, _phone_initializers, _phone_extraInitializers);
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            __esDecorate(null, null, _newPassword_decorators, { kind: "field", name: "newPassword", static: false, private: false, access: { has: obj => "newPassword" in obj, get: obj => obj.newPassword, set: (obj, value) => { obj.newPassword = value; } }, metadata: _metadata }, _newPassword_initializers, _newPassword_extraInitializers);
            __esDecorate(null, null, _confirmPassword_decorators, { kind: "field", name: "confirmPassword", static: false, private: false, access: { has: obj => "confirmPassword" in obj, get: obj => obj.confirmPassword, set: (obj, value) => { obj.confirmPassword = value; } }, metadata: _metadata }, _confirmPassword_initializers, _confirmPassword_extraInitializers);
            __esDecorate(null, null, _validateContact_decorators, { kind: "field", name: "validateContact", static: false, private: false, access: { has: obj => "validateContact" in obj, get: obj => obj.validateContact, set: (obj, value) => { obj.validateContact = value; } }, metadata: _metadata }, _validateContact_initializers, _validateContact_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { ResetPasswordDto };
/**
 * 自定义验证器：确保邮箱或手机号至少提供一个（用于重置密码）
 */
function HasEmailOrPhoneReset(value, args) {
    const dto = args.object;
    return !!(dto.email || dto.phone);
}
let ChangePasswordDto = (() => {
    var _a;
    let _oldPassword_decorators;
    let _oldPassword_initializers = [];
    let _oldPassword_extraInitializers = [];
    let _newPassword_decorators;
    let _newPassword_initializers = [];
    let _newPassword_extraInitializers = [];
    return _a = class ChangePasswordDto {
            constructor() {
                this.oldPassword = __runInitializers(this, _oldPassword_initializers, void 0);
                this.newPassword = (__runInitializers(this, _oldPassword_extraInitializers), __runInitializers(this, _newPassword_initializers, void 0));
                __runInitializers(this, _newPassword_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _oldPassword_decorators = [ApiPropertyOptional({
                    description: '当前密码（无密码用户可不填）',
                    example: 'OldPassword123!',
                }), IsString({ message: '当前密码必须是字符串' }), IsOptional()];
            _newPassword_decorators = [ApiProperty({ description: '新密码', example: 'NewPassword123!' }), IsString({ message: '新密码必须是字符串' }), MinLength(6, { message: '新密码至少 6 个字符' }), IsNotEmpty({ message: '新密码不能为空' })];
            __esDecorate(null, null, _oldPassword_decorators, { kind: "field", name: "oldPassword", static: false, private: false, access: { has: obj => "oldPassword" in obj, get: obj => obj.oldPassword, set: (obj, value) => { obj.oldPassword = value; } }, metadata: _metadata }, _oldPassword_initializers, _oldPassword_extraInitializers);
            __esDecorate(null, null, _newPassword_decorators, { kind: "field", name: "newPassword", static: false, private: false, access: { has: obj => "newPassword" in obj, get: obj => obj.newPassword, set: (obj, value) => { obj.newPassword = value; } }, metadata: _metadata }, _newPassword_initializers, _newPassword_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { ChangePasswordDto };
let ForgotPasswordResponseDto = (() => {
    var _a;
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    let _mailEnabled_decorators;
    let _mailEnabled_initializers = [];
    let _mailEnabled_extraInitializers = [];
    let _smsEnabled_decorators;
    let _smsEnabled_initializers = [];
    let _smsEnabled_extraInitializers = [];
    let _supportEmail_decorators;
    let _supportEmail_initializers = [];
    let _supportEmail_extraInitializers = [];
    let _supportPhone_decorators;
    let _supportPhone_initializers = [];
    let _supportPhone_extraInitializers = [];
    return _a = class ForgotPasswordResponseDto {
            constructor() {
                this.message = __runInitializers(this, _message_initializers, void 0);
                this.mailEnabled = (__runInitializers(this, _message_extraInitializers), __runInitializers(this, _mailEnabled_initializers, void 0));
                this.smsEnabled = (__runInitializers(this, _mailEnabled_extraInitializers), __runInitializers(this, _smsEnabled_initializers, void 0));
                this.supportEmail = (__runInitializers(this, _smsEnabled_extraInitializers), __runInitializers(this, _supportEmail_initializers, void 0));
                this.supportPhone = (__runInitializers(this, _supportEmail_extraInitializers), __runInitializers(this, _supportPhone_initializers, void 0));
                __runInitializers(this, _supportPhone_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _message_decorators = [ApiProperty({ description: '消息' })];
            _mailEnabled_decorators = [ApiProperty({ description: '邮件服务是否启用' })];
            _smsEnabled_decorators = [ApiProperty({ description: '短信服务是否启用' })];
            _supportEmail_decorators = [ApiPropertyOptional({
                    description: '客服邮箱（邮件禁用时返回）',
                    nullable: true,
                })];
            _supportPhone_decorators = [ApiPropertyOptional({
                    description: '客服电话（邮件禁用时返回）',
                    nullable: true,
                })];
            __esDecorate(null, null, _message_decorators, { kind: "field", name: "message", static: false, private: false, access: { has: obj => "message" in obj, get: obj => obj.message, set: (obj, value) => { obj.message = value; } }, metadata: _metadata }, _message_initializers, _message_extraInitializers);
            __esDecorate(null, null, _mailEnabled_decorators, { kind: "field", name: "mailEnabled", static: false, private: false, access: { has: obj => "mailEnabled" in obj, get: obj => obj.mailEnabled, set: (obj, value) => { obj.mailEnabled = value; } }, metadata: _metadata }, _mailEnabled_initializers, _mailEnabled_extraInitializers);
            __esDecorate(null, null, _smsEnabled_decorators, { kind: "field", name: "smsEnabled", static: false, private: false, access: { has: obj => "smsEnabled" in obj, get: obj => obj.smsEnabled, set: (obj, value) => { obj.smsEnabled = value; } }, metadata: _metadata }, _smsEnabled_initializers, _smsEnabled_extraInitializers);
            __esDecorate(null, null, _supportEmail_decorators, { kind: "field", name: "supportEmail", static: false, private: false, access: { has: obj => "supportEmail" in obj, get: obj => obj.supportEmail, set: (obj, value) => { obj.supportEmail = value; } }, metadata: _metadata }, _supportEmail_initializers, _supportEmail_extraInitializers);
            __esDecorate(null, null, _supportPhone_decorators, { kind: "field", name: "supportPhone", static: false, private: false, access: { has: obj => "supportPhone" in obj, get: obj => obj.supportPhone, set: (obj, value) => { obj.supportPhone = value; } }, metadata: _metadata }, _supportPhone_initializers, _supportPhone_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { ForgotPasswordResponseDto };
let ResetPasswordResponseDto = (() => {
    var _a;
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    return _a = class ResetPasswordResponseDto {
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
export { ResetPasswordResponseDto };
let ChangePasswordResponseDto = (() => {
    var _a;
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    return _a = class ChangePasswordResponseDto {
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
export { ChangePasswordResponseDto };
export class ForgotPasswordApiResponseDto extends ApiResponseDto {
}
export class ResetPasswordApiResponseDto extends ApiResponseDto {
}
export class ChangePasswordApiResponseDto extends ApiResponseDto {
}
// 绑定邮箱相关 DTO
let BindEmailDto = (() => {
    var _a;
    let _email_decorators;
    let _email_initializers = [];
    let _email_extraInitializers = [];
    return _a = class BindEmailDto {
            constructor() {
                this.email = __runInitializers(this, _email_initializers, void 0);
                __runInitializers(this, _email_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _email_decorators = [ApiProperty({ description: '要绑定的邮箱地址', example: 'user@example.com' }), IsEmail({}, { message: '邮箱格式不正确' }), IsNotEmpty({ message: '邮箱不能为空' })];
            __esDecorate(null, null, _email_decorators, { kind: "field", name: "email", static: false, private: false, access: { has: obj => "email" in obj, get: obj => obj.email, set: (obj, value) => { obj.email = value; } }, metadata: _metadata }, _email_initializers, _email_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { BindEmailDto };
let VerifyBindEmailDto = (() => {
    var _a;
    let _email_decorators;
    let _email_initializers = [];
    let _email_extraInitializers = [];
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    return _a = class VerifyBindEmailDto {
            constructor() {
                this.email = __runInitializers(this, _email_initializers, void 0);
                this.code = (__runInitializers(this, _email_extraInitializers), __runInitializers(this, _code_initializers, void 0));
                __runInitializers(this, _code_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _email_decorators = [ApiProperty({ description: '邮箱地址', example: 'user@example.com' }), IsEmail({}, { message: '邮箱格式不正确' }), IsNotEmpty({ message: '邮箱不能为空' })];
            _code_decorators = [ApiProperty({ description: '验证码', example: '123456' }), IsString({ message: '验证码必须是字符串' }), IsNotEmpty({ message: '验证码不能为空' })];
            __esDecorate(null, null, _email_decorators, { kind: "field", name: "email", static: false, private: false, access: { has: obj => "email" in obj, get: obj => obj.email, set: (obj, value) => { obj.email = value; } }, metadata: _metadata }, _email_initializers, _email_extraInitializers);
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { VerifyBindEmailDto };
let BindEmailResponseDto = (() => {
    var _a;
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    return _a = class BindEmailResponseDto {
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
export { BindEmailResponseDto };
export class BindEmailApiResponseDto extends ApiResponseDto {
}
//# sourceMappingURL=password-reset.dto.js.map