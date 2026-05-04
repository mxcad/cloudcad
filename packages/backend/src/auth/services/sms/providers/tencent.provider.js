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
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as tencentcloud from 'tencentcloud-sdk-nodejs';
// 腾讯云短信客户端
const SmsClient = tencentcloud.sms.v20210111.Client;
/**
 * 腾讯云短信服务商
 *
 * 使用腾讯云短信服务发送短信
 * 文档: https://cloud.tencent.com/document/api/382/55981
 */
let TencentSmsProvider = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var TencentSmsProvider = _classThis = class {
        constructor(config) {
            this.name = 'tencent';
            this.logger = new Logger(TencentSmsProvider.name);
            if (!config) {
                throw new BadRequestException('腾讯云短信配置缺失');
            }
            this.client = new SmsClient({
                credential: {
                    secretId: config.secretId,
                    secretKey: config.secretKey,
                },
                region: config.region || 'ap-guangzhou',
                profile: {
                    signMethod: 'HmacSHA256',
                    httpProfile: {
                        reqMethod: 'POST',
                        reqTimeout: 30,
                        endpoint: 'sms.tencentcloudapi.com',
                    },
                },
            });
            this.appId = config.appId;
            this.signName = config.signName;
            this.templateId = config.templateId;
            this.logger.log('腾讯云短信服务商初始化成功');
        }
        /**
         * 格式化手机号（确保带国际区号）
         */
        formatPhone(phone) {
            // 腾讯云短信需要带国际区号
            if (phone.startsWith('+')) {
                return phone;
            }
            return `+86${phone}`;
        }
        async sendVerificationCode(phone, code) {
            try {
                const formattedPhone = this.formatPhone(phone);
                const params = {
                    SmsSdkAppId: this.appId,
                    SignName: this.signName,
                    TemplateId: this.templateId,
                    PhoneNumberSet: [formattedPhone],
                    TemplateParamSet: [code],
                };
                const result = await this.client.SendSms(params);
                const status = result.SendStatusSet?.[0];
                const isSuccess = status?.Code === 'Ok';
                if (isSuccess) {
                    this.logger.log(`验证码发送成功: ${formattedPhone}`);
                }
                else {
                    this.logger.warn(`验证码发送失败: ${formattedPhone}, 错误: ${status?.Message}`);
                }
                return {
                    success: isSuccess,
                    messageId: status?.SerialNo,
                    code: status?.Code,
                    message: status?.Message,
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`验证码发送异常: ${errorMessage}`);
                return {
                    success: false,
                    message: errorMessage,
                };
            }
        }
        async sendTemplate(phone, templateId, params) {
            try {
                const formattedPhone = this.formatPhone(phone);
                const result = await this.client.SendSms({
                    SmsSdkAppId: this.appId,
                    SignName: this.signName,
                    TemplateId: templateId,
                    PhoneNumberSet: [formattedPhone],
                    TemplateParamSet: Object.values(params),
                });
                const status = result.SendStatusSet?.[0];
                return {
                    success: status?.Code === 'Ok',
                    messageId: status?.SerialNo,
                    code: status?.Code,
                    message: status?.Message,
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`模板短信发送异常: ${errorMessage}`);
                return {
                    success: false,
                    message: errorMessage,
                };
            }
        }
        async healthCheck() {
            try {
                // 简单检查配置是否正确
                return !!(this.appId && this.signName && this.templateId);
            }
            catch {
                return false;
            }
        }
    };
    __setFunctionName(_classThis, "TencentSmsProvider");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        TencentSmsProvider = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return TencentSmsProvider = _classThis;
})();
export { TencentSmsProvider };
//# sourceMappingURL=tencent.provider.js.map