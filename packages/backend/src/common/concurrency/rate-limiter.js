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
 * 限流器
 *
 * 功能：
 * 1. 限制并发任务数量
 * 2. 支持任务队列
 * 3. 支持任务超时控制
 * 4. 支持任务优先级
 */
let RateLimiter = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var RateLimiter = _classThis = class {
        constructor(maxConcurrent) {
            this.logger = new Logger(RateLimiter.name);
            this.queue = [];
            this.running = new Map();
            this.nextTaskId = 0;
            this.maxConcurrent = maxConcurrent;
            this.timeout = 600000; // 默认 10 分钟超时
            this.logger.log(`限流器初始化: 最大并发数=${this.maxConcurrent}, 超时=${this.timeout}ms`);
        }
        /**
         * 执行限流任务
         *
         * @param task 要执行的任务函数
         * @returns 任务执行结果
         */
        async execute(task) {
            const taskId = `task_${this.nextTaskId++}`;
            const taskState = {
                id: taskId,
                resolve: () => { },
                reject: () => { },
                promise: Promise.resolve(),
                queuedAt: Date.now(),
            };
            // 创建 Promise
            taskState.promise = new Promise((resolve, reject) => {
                taskState.resolve = resolve;
                taskState.reject = reject;
            });
            // 添加到队列
            this.queue.push(taskState);
            this.logger.debug(`任务加入队列: ${taskId}, 队列长度=${this.queue.length}, 运行中=${this.running.size}`);
            // 尝试执行下一个任务
            this.processNext();
            try {
                // 等待任务完成
                await taskState.promise;
                // 执行实际任务
                const result = await task();
                return result;
            }
            catch (error) {
                this.logger.error(`任务执行失败 [${taskId}]: ${error.message}`, error.stack);
                throw error;
            }
            finally {
                // 从运行中移除
                this.running.delete(taskId);
                this.logger.debug(`任务完成: ${taskId}, 队列长度=${this.queue.length}, 运行中=${this.running.size}`);
                // 执行下一个任务
                this.processNext();
            }
        }
        /**
         * 处理下一个任务
         */
        processNext() {
            // 检查是否达到最大并发数
            if (this.running.size >= this.maxConcurrent) {
                return;
            }
            // 检查队列是否为空
            if (this.queue.length === 0) {
                return;
            }
            // 取出下一个任务
            const taskState = this.queue.shift();
            taskState.startedAt = Date.now();
            // 添加到运行中
            this.running.set(taskState.id, taskState);
            this.logger.debug(`任务开始执行: ${taskState.id}, 等待时间=${taskState.startedAt - taskState.queuedAt}ms`);
            // 检查超时
            if (this.timeout > 0 && taskState.startedAt) {
                const timeout = setTimeout(() => {
                    this.logger.warn(`任务执行超时: ${taskState.id}`);
                    // 超时后清理任务，释放并发槽位
                    this.running.delete(taskState.id);
                    taskState.reject(new Error(`任务执行超时 (${this.timeout}ms)`));
                    // 处理下一个任务
                    this.processNext();
                }, this.timeout);
                // 清理定时器（任务正常完成时）
                taskState.promise.finally(() => {
                    clearTimeout(timeout);
                });
            }
            // 触发任务执行
            taskState.resolve();
        }
        /**
         * 获取队列长度
         *
         * @returns 队列长度
         */
        getQueueLength() {
            return this.queue.length;
        }
        /**
         * 获取运行中的任务数量
         *
         * @returns 运行中的任务数量
         */
        getRunningCount() {
            return this.running.size;
        }
        /**
         * 清空队列
         *
         * @returns 清空的任务数量
         */
        clearQueue() {
            const count = this.queue.length;
            this.queue.forEach((taskState) => {
                taskState.reject(new Error('队列已清空'));
            });
            this.queue.length = 0;
            this.logger.warn(`队列已清空: ${count} 个任务被取消`);
            return count;
        }
        /**
         * 获取统计信息
         *
         * @returns 统计信息
         */
        getStats() {
            return {
                queueLength: this.queue.length,
                runningCount: this.running.size,
                maxConcurrent: this.maxConcurrent,
                timeout: this.timeout,
            };
        }
    };
    __setFunctionName(_classThis, "RateLimiter");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        RateLimiter = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return RateLimiter = _classThis;
})();
export { RateLimiter };
//# sourceMappingURL=rate-limiter.js.map