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
import { spawn, execSync } from 'child_process';
// ---------------------------------------------------------------------------
// Semaphore — 轻量信号量，用于控制最大并发数
// ---------------------------------------------------------------------------
class Semaphore {
    constructor(max) {
        this.max = max;
        this.current = 0;
        this.queue = [];
    }
    async acquire() {
        if (this.current < this.max) {
            this.current++;
            return;
        }
        return new Promise((resolve) => {
            this.queue.push(resolve);
        });
    }
    release() {
        const next = this.queue.shift();
        if (next) {
            next();
        }
        else {
            this.current--;
        }
    }
    get running() {
        return this.current;
    }
    get waiting() {
        return this.queue.length;
    }
}
// ---------------------------------------------------------------------------
// ProcessError — 进程执行异常
// ---------------------------------------------------------------------------
export class ProcessError extends Error {
    constructor(message, binaryPath, durationMs, cause) {
        super(message);
        this.name = 'ProcessError';
        this.binaryPath = binaryPath;
        this.durationMs = durationMs;
        this.cause = cause;
    }
}
// ---------------------------------------------------------------------------
// ProcessRunnerService
// ---------------------------------------------------------------------------
/**
 * ProcessRunnerService
 *
 * 负责调用外部二进制（MxCAD 转换程序），包含：
 * - 信号量并发控制（默认最大 3，通过 ConversionEngineConfig 覆盖）
 * - 超时强杀机制（默认 300 秒）
 * - 错误捕获与日志记录
 * - 重试支持
 */
let ProcessRunnerService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ProcessRunnerService = _classThis = class {
        constructor(config) {
            this.logger = new Logger(ProcessRunnerService.name);
            const maxConcurrency = config.maxConcurrency ?? 3;
            this.defaultTimeoutMs = config.defaultTimeoutMs ?? 300000;
            this.semaphore = new Semaphore(maxConcurrency);
            this.logger.log(`ProcessRunnerService 初始化: 最大并发 ${maxConcurrency}, 默认超时 ${this.defaultTimeoutMs}ms`);
        }
        /**
         * 执行外部进程（带并发队列 + 超时控制 + 错误捕获）
         *
         * 流程：
         *  1. 获取信号量许可（队列等待）
         *  2. child_process.spawn 启动进程
         *  3. 设置超时定时器，到期发送 SIGTERM，5 秒后未响应则 SIGKILL
         *  4. 收集 stdout / stderr
         *  5. 释放信号量许可
         *
         * @param binaryPath - 可执行文件路径
         * @param options   - 执行选项
         */
        async run(binaryPath, options) {
            const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
            const maxRetries = options.maxRetries ?? 0;
            const retryDelayMs = options.retryDelayMs ?? 1000;
            let lastError;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    return await this.executeOnce(binaryPath, options, timeoutMs);
                }
                catch (err) {
                    lastError = err instanceof Error ? err : new Error(String(err));
                    if (attempt < maxRetries) {
                        this.logger.warn(`执行失败 (第 ${attempt + 1}/${maxRetries + 1} 次): ${binaryPath} — ${lastError.message}`);
                        await this.delay(retryDelayMs);
                    }
                }
            }
            throw lastError;
        }
        /**
         * 单次执行（不含重试）
         */
        async executeOnce(binaryPath, options, timeoutMs) {
            const startTime = Date.now();
            await this.semaphore.acquire();
            this.logger.debug(`[running=${this.semaphore.running} queued=${this.semaphore.waiting}] 执行: ${binaryPath} ${options.args.join(' ')}`);
            try {
                return await new Promise((resolve, reject) => {
                    let timedOut = false;
                    let settled = false;
                    // ---- 启动子进程 ----
                    const child = spawn(binaryPath, options.args, {
                        cwd: options.cwd,
                        env: { ...process.env, ...options.env },
                        stdio: ['ignore', 'pipe', 'pipe'],
                        windowsHide: true,
                    });
                    let stdout = '';
                    let stderr = '';
                    child.stdout?.on('data', (data) => {
                        stdout += data.toString();
                    });
                    child.stderr?.on('data', (data) => {
                        stderr += data.toString();
                    });
                    // ---- 超时定时器 ----
                    const timer = setTimeout(() => {
                        timedOut = true;
                        this.logger.warn(`进程超时 (${timeoutMs}ms)，发送 SIGTERM: ${binaryPath}`);
                        child.kill('SIGTERM');
                        // SIGTERM 无效则 5 秒后 SIGKILL
                        setTimeout(() => {
                            if (!child.killed && !settled) {
                                this.logger.warn(`进程未响应 SIGTERM，发送 SIGKILL: ${binaryPath}`);
                                child.kill('SIGKILL');
                            }
                        }, 5000);
                    }, timeoutMs);
                    // ---- 进程启动失败（如二进制不存在） ----
                    child.on('error', (err) => {
                        if (settled)
                            return;
                        settled = true;
                        clearTimeout(timer);
                        const durationMs = Date.now() - startTime;
                        reject(new ProcessError(`进程启动失败: ${err.message} (code=${err.code})`, binaryPath, durationMs, err));
                    });
                    // ---- 进程退出 ----
                    child.on('close', (exitCode, signal) => {
                        if (settled)
                            return;
                        settled = true;
                        clearTimeout(timer);
                        const durationMs = Date.now() - startTime;
                        if (timedOut) {
                            reject(new ProcessError(`进程执行超时 (${timeoutMs}ms)`, binaryPath, durationMs));
                            return;
                        }
                        const code = exitCode ?? (signal ? -1 : 0);
                        if (code !== 0) {
                            const detail = stderr.trim() || stdout.trim() || `exitCode=${code}`;
                            this.logger.warn(`进程退出码非零: ${binaryPath} — ${detail.slice(0, 200)}`);
                        }
                        resolve({ exitCode: code, stdout, stderr, durationMs });
                    });
                });
            }
            finally {
                this.semaphore.release();
            }
        }
        /**
         * 同步执行外部进程（非并发控制，用于快速探测等场景）
         *
         * @param binaryPath - 可执行文件路径
         * @param args       - 参数列表
         * @param timeoutMs  - 超时时间
         */
        runSync(binaryPath, args, timeoutMs) {
            const startTime = Date.now();
            try {
                const stdout = execSync(`"${binaryPath}" ${args.map((a) => `"${a}"`).join(' ')}`, {
                    timeout: timeoutMs ?? this.defaultTimeoutMs,
                    windowsHide: true,
                }).toString();
                return {
                    exitCode: 0,
                    stdout,
                    stderr: '',
                    durationMs: Date.now() - startTime,
                };
            }
            catch (err) {
                const error = err;
                return {
                    exitCode: error.status ?? -1,
                    stdout: error.stdout?.toString() ?? '',
                    stderr: error.stderr?.toString() ?? error.message ?? '',
                    durationMs: Date.now() - startTime,
                };
            }
        }
        /**
         * 安全地终止进程
         *
         * @param pid       - 进程 PID
         * @param signal    - 信号类型，默认 SIGKILL
         */
        async kill(pid, signal = 'SIGKILL') {
            try {
                process.kill(pid, signal);
                this.logger.debug(`已发送 ${signal} 到进程 ${pid}`);
            }
            catch (err) {
                const error = err;
                if (error.code === 'ESRCH') {
                    this.logger.warn(`进程 ${pid} 不存在`);
                }
                else {
                    throw new ProcessError(`终止进程失败 (pid=${pid}): ${error.message}`, '', 0, error);
                }
            }
        }
        /** 当前正在运行的进程数 */
        getRunningCount() {
            return this.semaphore.running;
        }
        /** 队列中等待的进程数 */
        getQueuedCount() {
            return this.semaphore.waiting;
        }
        /**
         * 解析进程输出中的 JSON
         *
         * MxCAD 转换程序通常在 stdout 的最后一行输出 JSON 格式的结果。
         * 此方法提取最后一行 JSON 进行解析，忽略之前的非 JSON 输出。
         *
         * @param stdout - 标准输出内容
         */
        parseJsonOutput(stdout) {
            const lines = stdout
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean);
            // 从后往前找第一个合法的 JSON
            for (let i = lines.length - 1; i >= 0; i--) {
                try {
                    return JSON.parse(lines[i]);
                }
                catch {
                    continue;
                }
            }
            throw new ProcessError('stdout 中未找到合法的 JSON 行', '', 0);
        }
        delay(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        }
    };
    __setFunctionName(_classThis, "ProcessRunnerService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ProcessRunnerService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ProcessRunnerService = _classThis;
})();
export { ProcessRunnerService };
//# sourceMappingURL=process-runner.service.js.map