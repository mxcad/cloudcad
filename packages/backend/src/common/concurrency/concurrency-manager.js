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
import { Injectable, Logger } from '@nestjs/common';
/**
 * 并发管理器
 *
 * 功能：
 * 1. 提供分布式锁机制，防止并发冲突
 * 2. 支持任务超时控制
 * 3. 支持锁状态查询和管理
 */
let ConcurrencyManager = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ConcurrencyManager = _classThis = class {
        constructor() {
            this.logger = new Logger(ConcurrencyManager.name);
            this.locks = new Map();
        }
        /**
         * 获取锁并执行任务
         *
         * @param key 锁的键
         * @param task 要执行的任务函数
         * @returns 任务执行结果，成功返回 true，失败返回 false
         */
        async acquireLock(key, task) {
            if (this.locks.has(key)) {
                this.logger.warn(`锁已被占用: ${key}`);
                return null;
            }
            let resolve;
            const promise = new Promise((r) => {
                resolve = r;
            });
            const lockState = {
                resolve: resolve,
                promise,
                acquiredAt: Date.now(),
            };
            this.locks.set(key, lockState);
            this.logger.debug(`获取锁成功: ${key}`);
            try {
                const result = await task();
                return result;
            }
            catch (error) {
                this.logger.error(`任务执行失败 [${key}]: ${error.message}`, error.stack);
                return null;
            }
            finally {
                this.releaseLock(key);
            }
        }
        /**
         * 执行带超时的任务
         *
         * @param task 要执行的任务函数
         * @param timeout 超时时间（毫秒）
         * @returns 任务执行结果，成功返回结果，超时或失败返回 null
         */
        async withTimeout(task, timeout) {
            try {
                const result = await Promise.race([
                    task(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error(`任务超时 (${timeout}ms)`)), timeout)),
                ]);
                return result;
            }
            catch (error) {
                if (error.message.includes('超时')) {
                    this.logger.warn(`任务执行超时: ${error.message}`);
                }
                else {
                    this.logger.error(`任务执行失败: ${error.message}`, error.stack);
                }
                return null;
            }
        }
        /**
         * 检查锁是否存在
         *
         * @param key 锁的键
         * @returns 是否存在锁
         */
        isLocked(key) {
            return this.locks.has(key);
        }
        /**
         * 释放锁
         *
         * @param key 锁的键
         * @returns 是否成功释放
         */
        releaseLock(key) {
            const lockState = this.locks.get(key);
            if (!lockState) {
                this.logger.warn(`尝试释放不存在的锁: ${key}`);
                return false;
            }
            const duration = Date.now() - lockState.acquiredAt;
            lockState.resolve();
            this.locks.delete(key);
            this.logger.debug(`释放锁成功: ${key} (持有时间: ${duration}ms)`);
            return true;
        }
        /**
         * 获取所有被锁定的键
         *
         * @returns 锁键数组
         */
        getLockedKeys() {
            return Array.from(this.locks.keys());
        }
        /**
         * 获取当前锁的数量
         *
         * @returns 锁的数量
         */
        getLockCount() {
            return this.locks.size;
        }
        /**
         * 清除所有锁
         *
         * @returns 清除的锁数量
         */
        clearAllLocks() {
            const count = this.locks.size;
            this.locks.forEach((lockState, key) => {
                lockState.resolve();
                this.logger.warn(`强制清除锁: ${key}`);
            });
            this.locks.clear();
            this.logger.log(`清除所有锁成功: ${count} 个`);
            return count;
        }
    };
    __setFunctionName(_classThis, "ConcurrencyManager");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ConcurrencyManager = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ConcurrencyManager = _classThis;
})();
export { ConcurrencyManager };
//# sourceMappingURL=concurrency-manager.js.map