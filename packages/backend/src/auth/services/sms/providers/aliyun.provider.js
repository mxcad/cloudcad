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
import Dysmsapi20170525, * as dysmsapi from '@alicloud/dysmsapi20170525';
import * as OpenApi from '@alicloud/openapi-client';
/**
 * 阿里云短信服务商
 *
 * 使用阿里云短信服务发送短信
 * 文档: https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25
 */
let AliyunSmsProvider = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var AliyunSmsProvider = _classThis = class {
        constructor(config) {
            this.name = 'aliyun';
            this.logger = new Logger(AliyunSmsProvider.name);
            if (!config) {
                throw new BadRequestException('阿里云短信配置缺失');
            }
            const openApiConfig = new OpenApi.Config({
                accessKeyId: config.accessKeyId,
                accessKeySecret: config.accessKeySecret,
                endpoint: 'dysmsapi.aliyuncs.com',
            });
            this.client = new Dysmsapi20170525(openApiConfig);
            this.signName = config.signName;
            this.templateCode = config.templateCode;
            this.logger.log('阿里云短信服务商初始化成功');
        }
        /**
         * 格式化手机号（移除国际区号前缀）
         */
        formatPhone(phone) {
            // 阿里云短信不需要 +86 前缀
            return phone.replace(/^\+86/, '');
        }
        async sendVerificationCode(phone, code) {
            try {
                const formattedPhone = this.formatPhone(phone);
                const result = await this.client.sendSms(new dysmsapi.SendSmsRequest({
                    phoneNumbers: formattedPhone,
                    signName: this.signName,
                    templateCode: this.templateCode,
                    templateParam: JSON.stringify({ code }),
                }));
                const isSuccess = result.body?.code === 'OK';
                if (isSuccess) {
                    this.logger.log(`验证码发送成功: ${formattedPhone}`);
                }
                else {
                    this.logger.warn(`验证码发送失败: ${formattedPhone}, 错误码: ${result.body?.code}, 错误信息: ${result.body?.message}`);
                }
                return {
                    success: isSuccess,
                    messageId: result.body?.bizId,
                    code: result.body?.code,
                    message: result.body?.message,
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
                const result = await this.client.sendSms(new dysmsapi.SendSmsRequest({
                    phoneNumbers: formattedPhone,
                    signName: this.signName,
                    templateCode: templateId,
                    templateParam: JSON.stringify(params),
                }));
                const isSuccess = result.body?.code === 'OK';
                return {
                    success: isSuccess,
                    messageId: result.body?.bizId,
                    code: result.body?.code,
                    message: result.body?.message,
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
            // 检查必要配置是否存在
            return !!(this.signName && this.templateCode);
        }
    };
    __setFunctionName(_classThis, "AliyunSmsProvider");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AliyunSmsProvider = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AliyunSmsProvider = _classThis;
})();
export { AliyunSmsProvider };
//# sourceMappingURL=aliyun.provider.js.map