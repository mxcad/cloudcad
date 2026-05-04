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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { Controller, Post, Get, Logger } from '@nestjs/common';
import { Public } from './decorators/public.decorator';
let SessionController = (() => {
    let _classDecorators = [Public(), Controller('session')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _createSession_decorators;
    let _getSessionUser_decorators;
    let _destroySession_decorators;
    var SessionController = _classThis = class {
        constructor(configService) {
            this.configService = (__runInitializers(this, _instanceExtraInitializers), configService);
            this.logger = new Logger(SessionController.name);
        }
        /**
         * 设置用户 Session
         */
        async createSession(req, body) {
            this.logger.debug(`创建 Session, 用户: ${body.user?.id}`);
            this.logger.debug(`Session ID: ${req.sessionID}`);
            if (!body.user) {
                return { success: false, message: '用户信息不能为空' };
            }
            // 将用户信息存储到 session 中
            req.session.user = {
                id: body.user.id,
                email: body.user.email,
                username: body.user.username,
                role: body.user.role,
            };
            // 确保 session 保存
            await new Promise((resolve, reject) => {
                req.session.save((err) => {
                    if (err) {
                        this.logger.error(`Session 保存失败: ${err.message}`);
                        reject(err);
                    }
                    else {
                        this.logger.debug('Session 保存成功');
                        resolve();
                    }
                });
            });
            return { success: true, message: 'Session 创建成功' };
        }
        /**
         * 获取当前 Session 用户信息
         */
        async getSessionUser(req) {
            this.logger.debug('获取 Session 用户信息');
            this.logger.debug(`Session ID: ${req.sessionID}`);
            const user = req.session?.user;
            if (!user) {
                return { success: false, message: '用户未登录' };
            }
            return { success: true, user };
        }
        /**
         * 清除 Session
         */
        async destroySession(req, res) {
            req.session.destroy((err) => {
                if (err) {
                    res.status(500).json({ success: false, message: 'Session 销毁失败' });
                    return;
                }
                const sessionName = this.configService.get('session.name');
                res.clearCookie(sessionName);
                res.json({ success: true, message: 'Session 已销毁' });
            });
        }
    };
    __setFunctionName(_classThis, "SessionController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _createSession_decorators = [Post('create')];
        _getSessionUser_decorators = [Get('user')];
        _destroySession_decorators = [Post('destroy')];
        __esDecorate(_classThis, null, _createSession_decorators, { kind: "method", name: "createSession", static: false, private: false, access: { has: obj => "createSession" in obj, get: obj => obj.createSession }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getSessionUser_decorators, { kind: "method", name: "getSessionUser", static: false, private: false, access: { has: obj => "getSessionUser" in obj, get: obj => obj.getSessionUser }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _destroySession_decorators, { kind: "method", name: "destroySession", static: false, private: false, access: { has: obj => "destroySession" in obj, get: obj => obj.destroySession }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        SessionController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return SessionController = _classThis;
})();
export { SessionController };
//# sourceMappingURL=session.controller.js.map