///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
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
 * 热点数据预热策略
 * 从 L3 缓存中识别高频访问数据并预加载到 L1/L2
 */
let HotDataStrategy = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var HotDataStrategy = _classThis = class {
        constructor(l3Cache, multiLevelCache) {
            this.l3Cache = l3Cache;
            this.multiLevelCache = multiLevelCache;
            this.name = 'hot-data';
            this.logger = new Logger(HotDataStrategy.name);
        }
        /**
         * 执行热点数据预热
         */
        async warmup() {
            const startTime = Date.now();
            try {
                // 获取热点数据
                const hotData = await this.l3Cache.getHotData(1000); // 最多 1000 条
                if (hotData.length === 0) {
                    this.logger.debug('没有热点数据需要预热');
                    return {
                        success: true,
                        count: 0,
                        duration: Date.now() - startTime,
                    };
                }
                this.logger.debug(`发现 ${hotData.length} 条热点数据`);
                // 计算访问频率并过滤
                const now = Date.now();
                const hotDataWithFrequency = hotData.map((data) => {
                    const minutesSinceLastAccess = (now - data.lastAccessedAt.getTime()) / 60000;
                    const frequency = data.accessCount / Math.max(minutesSinceLastAccess, 1);
                    return { ...data, frequency };
                });
                const filteredHotData = hotDataWithFrequency.filter((data) => data.frequency >= 10 // 每分钟访问 10 次以上
                );
                if (filteredHotData.length === 0) {
                    this.logger.debug('没有满足阈值的热点数据');
                    return {
                        success: true,
                        count: 0,
                        duration: Date.now() - startTime,
                    };
                }
                // 预加载数据到 L2 和 L1
                const keys = filteredHotData.map((data) => data.key);
                const loadedData = await this.l3Cache.preload(keys, async (key) => {
                    return this.l3Cache.get(key);
                });
                // 写入 L2 和 L1
                await this.multiLevelCache.setMany(loadedData);
                const duration = Date.now() - startTime;
                this.logger.log(`成功预热 ${loadedData.size} 条热点数据，耗时 ${duration}ms`);
                return {
                    success: true,
                    count: loadedData.size,
                    duration,
                };
            }
            catch (error) {
                const duration = Date.now() - startTime;
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                this.logger.error(`热点数据预热失败: ${errorMessage}`, error);
                return {
                    success: false,
                    count: 0,
                    duration,
                    error: errorMessage,
                };
            }
        }
    };
    __setFunctionName(_classThis, "HotDataStrategy");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        HotDataStrategy = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return HotDataStrategy = _classThis;
})();
export { HotDataStrategy };
//# sourceMappingURL=hot-data.strategy.js.map