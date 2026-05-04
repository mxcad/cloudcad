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
import { Injectable, ForbiddenException, } from '@nestjs/common';
import { PERMISSIONS_KEY, PERMISSIONS_MODE_KEY, PermissionCheckMode, } from '../decorators/require-permissions.decorator';
/**
 * 统一权限检查 Guard
 *
 * 功能：
 * 1. 检查用户是否具有所需的权限
 * 2. 支持 AND 和 OR 逻辑
 * 3. 自动从请求中提取用户信息和节点 ID
 * 4. 支持上下文感知的权限检查
 */
let PermissionsGuard = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PermissionsGuard = _classThis = class {
        constructor(reflector, permissionService) {
            this.reflector = reflector;
            this.permissionService = permissionService;
        }
        async canActivate(context) {
            // 获取装饰器设置的权限
            const requiredPermissions = this.reflector.getAllAndOverride(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
            // 如果没有设置权限，则允许访问
            if (!requiredPermissions || requiredPermissions.length === 0) {
                return true;
            }
            // 获取权限检查模式
            const mode = this.reflector.getAllAndOverride(PERMISSIONS_MODE_KEY, [context.getHandler(), context.getClass()]) || PermissionCheckMode.ALL;
            // 获取请求对象
            const request = context.switchToHttp().getRequest();
            const userId = request.user?.id;
            if (!userId) {
                throw new ForbiddenException('用户未认证');
            }
            // 提取上下文信息
            const permissionContext = this.extractContext(request);
            // 检查权限
            const hasPermission = await this.checkPermissions(userId, requiredPermissions, mode, permissionContext);
            if (!hasPermission) {
                throw new ForbiddenException('权限不足');
            }
            return true;
        }
        /**
         * 从请求中提取上下文信息
         */
        extractContext(request) {
            return {
                ipAddress: request.ip ||
                    request.connection?.remoteAddress,
                userAgent: request.headers['user-agent'],
                time: new Date(),
                // 可以根据需要添加更多上下文信息
            };
        }
        /**
         * 检查权限
         */
        async checkPermissions(userId, requiredPermissions, mode, context) {
            if (mode === PermissionCheckMode.ALL) {
                // AND 逻辑：所有权限都必须满足
                for (const permission of requiredPermissions) {
                    const hasPermission = await this.permissionService.checkSystemPermissionWithContext(userId, permission, context);
                    if (!hasPermission) {
                        return false;
                    }
                }
                return true;
            }
            else {
                // OR 逻辑：满足任意一个权限即可
                for (const permission of requiredPermissions) {
                    const hasPermission = await this.permissionService.checkSystemPermissionWithContext(userId, permission, context);
                    if (hasPermission) {
                        return true;
                    }
                }
                return false;
            }
        }
    };
    __setFunctionName(_classThis, "PermissionsGuard");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        PermissionsGuard = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return PermissionsGuard = _classThis;
})();
export { PermissionsGuard };
//# sourceMappingURL=permissions.guard.js.map