///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
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
import { Injectable, Logger, InternalServerErrorException, BadRequestException, } from '@nestjs/common';
import * as crypto from 'crypto';
/**
 * 微信服务 - 处理微信 OAuth2 授权流程
 */
let WechatService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var WechatService = _classThis = class {
        constructor(configService) {
            this.configService = configService;
            this.logger = new Logger(WechatService.name);
        }
        get appId() {
            if (this._appId === undefined) {
                this._appId = this.configService.get('WECHAT_APP_ID') || '';
            }
            return this._appId;
        }
        get packagesecret() {
            if (this._packagesecret === undefined) {
                this._packagesecret = this.configService.get('WECHAT_APP_SECRET') || '';
            }
            return this._packagesecret;
        }
        get callbackUrl() {
            if (this._callbackUrl === undefined) {
                this._callbackUrl = this.configService.get('WECHAT_CALLBACK_URL') || '';
            }
            return this._callbackUrl;
        }
        /**
         * 生成微信授权 URL
         * @param state CSRF 防护状态参数
         * @returns 微信授权 URL
         */
        getAuthUrl(state) {
            if (!this.appId) {
                throw new BadRequestException('微信 AppID 未配置，请在 .env 文件中设置 WECHAT_APP_ID');
            }
            if (!this.callbackUrl) {
                throw new BadRequestException('微信回调地址未配置，请在 .env 文件中设置 WECHAT_CALLBACK_URL');
            }
            const redirectUri = encodeURIComponent(this.callbackUrl);
            return (`https://open.weixin.qq.com/connect/qrconnect?` +
                `appid=${this.appId}` +
                `&redirect_uri=${redirectUri}` +
                `&response_type=code` +
                `&scope=snsapi_login` +
                `&state=${state}` +
                `#wechat_redirect`);
        }
        /**
         * 通过授权码获取 access_token
         * @param code 微信授权码
         * @returns Token 响应
         */
        async getAccessToken(code) {
            const url = `https://api.weixin.qq.com/sns/oauth2/access_token?` +
                `appid=${this.appId}` +
                `&secret=${this.packagesecret}` +
                `&code=${code}` +
                `&grant_type=authorization_code`;
            try {
                const response = await fetch(url);
                const data = await response.json();
                if (data.errcode) {
                    this.logger.error(`获取微信 access_token 失败: ${data.errmsg}`);
                    throw new InternalServerErrorException(`微信授权失败: ${data.errmsg}`);
                }
                return data;
            }
            catch (error) {
                this.logger.error('获取微信 access_token 异常', error.stack);
                throw new InternalServerErrorException('微信授权服务异常');
            }
        }
        /**
         * 获取微信用户信息
         * @param accessToken access_token
         * @param openid 用户 openid
         * @returns 用户信息
         */
        async getUserInfo(accessToken, openid) {
            const url = `https://api.weixin.qq.com/sns/userinfo?` +
                `access_token=${accessToken}` +
                `&openid=${openid}` +
                `&lang=zh_CN`;
            try {
                const response = await fetch(url);
                const data = await response.json();
                if (data.errcode) {
                    this.logger.error(`获取微信用户信息失败: ${data.errmsg}`);
                    throw new InternalServerErrorException(`获取用户信息失败: ${data.errmsg}`);
                }
                return data;
            }
            catch (error) {
                this.logger.error('获取微信用户信息异常', error.stack);
                throw new InternalServerErrorException('微信用户信息服务异常');
            }
        }
        /**
         * 刷新 access_token
         * @param refreshToken refresh_token
         * @returns 新的 Token 响应
         */
        async refreshAccessToken(refreshToken) {
            const url = `https://api.weixin.qq.com/sns/oauth2/refresh_token?` +
                `appid=${this.appId}` +
                `&grant_type=refresh_token` +
                `&refresh_token=${refreshToken}`;
            try {
                const response = await fetch(url);
                const data = await response.json();
                if (data.errcode) {
                    this.logger.error(`刷新微信 access_token 失败: ${data.errmsg}`);
                    throw new InternalServerErrorException(`刷新授权失败: ${data.errmsg}`);
                }
                return data;
            }
            catch (error) {
                this.logger.error('刷新微信 access_token 异常', error.stack);
                throw new InternalServerErrorException('微信授权服务异常');
            }
        }
        /**
         * 生成状态参数（CSRF 防护）
         * @returns 随机状态字符串
         */
        generateState() {
            return crypto.randomBytes(32).toString('hex');
        }
        /**
         * 验证状态参数
         * @param state 状态参数
         * @returns 是否有效
         */
        validateState(state) {
            if (typeof state !== 'string')
                return false;
            try {
                // 尝试解析新的 Base64 格式: { csrf: "...", origin: "..." }
                const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
                if (stateData.csrf) {
                    // 验证内部的 csrf 是否是合法的 64 位 Hex 字符串
                    return (typeof stateData.csrf === 'string' && stateData.csrf.length === 64);
                }
            }
            catch (e) {
                // 如果解析失败，说明不是 Base64 格式，尝试旧格式
            }
            // 旧格式：直接是 64 位 Hex 字符串
            return state.length === 64;
        }
    };
    __setFunctionName(_classThis, "WechatService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        WechatService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return WechatService = _classThis;
})();
export { WechatService };
//# sourceMappingURL=wechat.service.js.map