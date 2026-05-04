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
import { Module, forwardRef } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CommonModule } from '../common/common.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { SmsModule } from '../auth/services/sms/sms.module';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { USER_SERVICE } from '../common/interfaces/user-service.interface';
import { PASSWORD_HASHER } from './interfaces/password-hasher.interface';
import { BcryptPasswordHasher } from './services/password-hasher.service';
import { VERIFICATION_STRATEGIES, } from './interfaces/account-verification-strategy.interface';
import { PasswordVerificationStrategy } from './strategies/password-verification.strategy';
import { PhoneCodeVerificationStrategy } from './strategies/phone-code-verification.strategy';
import { EmailCodeVerificationStrategy } from './strategies/email-code-verification.strategy';
import { WechatVerificationStrategy } from './strategies/wechat-verification.strategy';
let UsersModule = (() => {
    let _classDecorators = [Module({
            imports: [
                CommonModule,
                RuntimeConfigModule,
                SmsModule,
                forwardRef(() => AuthModule),
                EventEmitterModule.forRoot(),
            ],
            controllers: [UsersController],
            providers: [
                UsersService,
                { provide: USER_SERVICE, useExisting: UsersService },
                { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
                PasswordVerificationStrategy,
                PhoneCodeVerificationStrategy,
                EmailCodeVerificationStrategy,
                WechatVerificationStrategy,
                {
                    provide: VERIFICATION_STRATEGIES,
                    useFactory: (password, phoneCode, emailCode, wechat) => [password, phoneCode, emailCode, wechat],
                    inject: [
                        PasswordVerificationStrategy,
                        PhoneCodeVerificationStrategy,
                        EmailCodeVerificationStrategy,
                        WechatVerificationStrategy,
                    ],
                },
            ],
            exports: [UsersService, USER_SERVICE],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var UsersModule = _classThis = class {
    };
    __setFunctionName(_classThis, "UsersModule");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        UsersModule = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return UsersModule = _classThis;
})();
export { UsersModule };
//# sourceMappingURL=users.module.js.map