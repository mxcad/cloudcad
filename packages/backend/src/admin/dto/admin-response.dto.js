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
import { ApiProperty } from '@nestjs/swagger';
/**
 * 管理员统计响应 DTO
 */
let AdminStatsResponseDto = (() => {
    var _a;
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    let _timestamp_decorators;
    let _timestamp_initializers = [];
    let _timestamp_extraInitializers = [];
    return _a = class AdminStatsResponseDto {
            constructor() {
                this.message = __runInitializers(this, _message_initializers, void 0);
                this.timestamp = (__runInitializers(this, _message_extraInitializers), __runInitializers(this, _timestamp_initializers, void 0));
                __runInitializers(this, _timestamp_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _message_decorators = [ApiProperty({ description: '提示消息' })];
            _timestamp_decorators = [ApiProperty({ description: '时间戳' })];
            __esDecorate(null, null, _message_decorators, { kind: "field", name: "message", static: false, private: false, access: { has: obj => "message" in obj, get: obj => obj.message, set: (obj, value) => { obj.message = value; } }, metadata: _metadata }, _message_initializers, _message_extraInitializers);
            __esDecorate(null, null, _timestamp_decorators, { kind: "field", name: "timestamp", static: false, private: false, access: { has: obj => "timestamp" in obj, get: obj => obj.timestamp, set: (obj, value) => { obj.timestamp = value; } }, metadata: _metadata }, _timestamp_initializers, _timestamp_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { AdminStatsResponseDto };
/**
 * 缓存统计 DTO（管理后台视图）
 */
let AdminCacheStatsDto = (() => {
    var _a;
    let _size_decorators;
    let _size_initializers = [];
    let _size_extraInitializers = [];
    let _hits_decorators;
    let _hits_initializers = [];
    let _hits_extraInitializers = [];
    let _misses_decorators;
    let _misses_initializers = [];
    let _misses_extraInitializers = [];
    let _hitRate_decorators;
    let _hitRate_initializers = [];
    let _hitRate_extraInitializers = [];
    return _a = class AdminCacheStatsDto {
            constructor() {
                this.size = __runInitializers(this, _size_initializers, void 0);
                this.hits = (__runInitializers(this, _size_extraInitializers), __runInitializers(this, _hits_initializers, void 0));
                this.misses = (__runInitializers(this, _hits_extraInitializers), __runInitializers(this, _misses_initializers, void 0));
                this.hitRate = (__runInitializers(this, _misses_extraInitializers), __runInitializers(this, _hitRate_initializers, void 0));
                __runInitializers(this, _hitRate_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _size_decorators = [ApiProperty({ description: '缓存条目数' })];
            _hits_decorators = [ApiProperty({ description: '命中次数' })];
            _misses_decorators = [ApiProperty({ description: '未命中次数' })];
            _hitRate_decorators = [ApiProperty({ description: '命中率' })];
            __esDecorate(null, null, _size_decorators, { kind: "field", name: "size", static: false, private: false, access: { has: obj => "size" in obj, get: obj => obj.size, set: (obj, value) => { obj.size = value; } }, metadata: _metadata }, _size_initializers, _size_extraInitializers);
            __esDecorate(null, null, _hits_decorators, { kind: "field", name: "hits", static: false, private: false, access: { has: obj => "hits" in obj, get: obj => obj.hits, set: (obj, value) => { obj.hits = value; } }, metadata: _metadata }, _hits_initializers, _hits_extraInitializers);
            __esDecorate(null, null, _misses_decorators, { kind: "field", name: "misses", static: false, private: false, access: { has: obj => "misses" in obj, get: obj => obj.misses, set: (obj, value) => { obj.misses = value; } }, metadata: _metadata }, _misses_initializers, _misses_extraInitializers);
            __esDecorate(null, null, _hitRate_decorators, { kind: "field", name: "hitRate", static: false, private: false, access: { has: obj => "hitRate" in obj, get: obj => obj.hitRate, set: (obj, value) => { obj.hitRate = value; } }, metadata: _metadata }, _hitRate_initializers, _hitRate_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { AdminCacheStatsDto };
/**
 * 缓存统计响应 DTO
 */
let CacheStatsResponseDto = (() => {
    var _a;
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    let _data_decorators;
    let _data_initializers = [];
    let _data_extraInitializers = [];
    return _a = class CacheStatsResponseDto {
            constructor() {
                this.message = __runInitializers(this, _message_initializers, void 0);
                this.data = (__runInitializers(this, _message_extraInitializers), __runInitializers(this, _data_initializers, void 0));
                __runInitializers(this, _data_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _message_decorators = [ApiProperty({ description: '提示消息' })];
            _data_decorators = [ApiProperty({ description: '缓存统计数据', type: () => AdminCacheStatsDto })];
            __esDecorate(null, null, _message_decorators, { kind: "field", name: "message", static: false, private: false, access: { has: obj => "message" in obj, get: obj => obj.message, set: (obj, value) => { obj.message = value; } }, metadata: _metadata }, _message_initializers, _message_extraInitializers);
            __esDecorate(null, null, _data_decorators, { kind: "field", name: "data", static: false, private: false, access: { has: obj => "data" in obj, get: obj => obj.data, set: (obj, value) => { obj.data = value; } }, metadata: _metadata }, _data_initializers, _data_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CacheStatsResponseDto };
/**
 * 缓存清理响应 DTO
 */
let CacheCleanupResponseDto = (() => {
    var _a;
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    return _a = class CacheCleanupResponseDto {
            constructor() {
                this.message = __runInitializers(this, _message_initializers, void 0);
                __runInitializers(this, _message_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _message_decorators = [ApiProperty({ description: '提示消息' })];
            __esDecorate(null, null, _message_decorators, { kind: "field", name: "message", static: false, private: false, access: { has: obj => "message" in obj, get: obj => obj.message, set: (obj, value) => { obj.message = value; } }, metadata: _metadata }, _message_initializers, _message_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CacheCleanupResponseDto };
/**
 * 用户权限信息 DTO
 */
let UserPermissionInfoDto = (() => {
    var _a;
    let _userRole_decorators;
    let _userRole_initializers = [];
    let _userRole_extraInitializers = [];
    let _permissions_decorators;
    let _permissions_initializers = [];
    let _permissions_extraInitializers = [];
    return _a = class UserPermissionInfoDto {
            constructor() {
                this.userRole = __runInitializers(this, _userRole_initializers, void 0);
                this.permissions = (__runInitializers(this, _userRole_extraInitializers), __runInitializers(this, _permissions_initializers, void 0));
                __runInitializers(this, _permissions_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _userRole_decorators = [ApiProperty({ description: '用户角色' })];
            _permissions_decorators = [ApiProperty({ description: '权限列表', type: () => [String] })];
            __esDecorate(null, null, _userRole_decorators, { kind: "field", name: "userRole", static: false, private: false, access: { has: obj => "userRole" in obj, get: obj => obj.userRole, set: (obj, value) => { obj.userRole = value; } }, metadata: _metadata }, _userRole_initializers, _userRole_extraInitializers);
            __esDecorate(null, null, _permissions_decorators, { kind: "field", name: "permissions", static: false, private: false, access: { has: obj => "permissions" in obj, get: obj => obj.permissions, set: (obj, value) => { obj.permissions = value; } }, metadata: _metadata }, _permissions_initializers, _permissions_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UserPermissionInfoDto };
/**
 * 用户权限响应 DTO
 */
let UserPermissionsResponseDto = (() => {
    var _a;
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    let _data_decorators;
    let _data_initializers = [];
    let _data_extraInitializers = [];
    return _a = class UserPermissionsResponseDto {
            constructor() {
                this.message = __runInitializers(this, _message_initializers, void 0);
                this.data = (__runInitializers(this, _message_extraInitializers), __runInitializers(this, _data_initializers, void 0));
                __runInitializers(this, _data_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _message_decorators = [ApiProperty({ description: '提示消息' })];
            _data_decorators = [ApiProperty({
                    description: '用户权限信息',
                    type: () => UserPermissionInfoDto,
                })];
            __esDecorate(null, null, _message_decorators, { kind: "field", name: "message", static: false, private: false, access: { has: obj => "message" in obj, get: obj => obj.message, set: (obj, value) => { obj.message = value; } }, metadata: _metadata }, _message_initializers, _message_extraInitializers);
            __esDecorate(null, null, _data_decorators, { kind: "field", name: "data", static: false, private: false, access: { has: obj => "data" in obj, get: obj => obj.data, set: (obj, value) => { obj.data = value; } }, metadata: _metadata }, _data_initializers, _data_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UserPermissionsResponseDto };
/**
 * 用户缓存清理响应 DTO
 */
let UserCacheClearResponseDto = (() => {
    var _a;
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    return _a = class UserCacheClearResponseDto {
            constructor() {
                this.message = __runInitializers(this, _message_initializers, void 0);
                __runInitializers(this, _message_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _message_decorators = [ApiProperty({ description: '提示消息' })];
            __esDecorate(null, null, _message_decorators, { kind: "field", name: "message", static: false, private: false, access: { has: obj => "message" in obj, get: obj => obj.message, set: (obj, value) => { obj.message = value; } }, metadata: _metadata }, _message_initializers, _message_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UserCacheClearResponseDto };
//# sourceMappingURL=admin-response.dto.js.map