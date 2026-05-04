import { ConversionEngineConfig } from './interfaces/conversion-service.interface';
export declare class ProcessError extends Error {
    readonly binaryPath: string;
    readonly durationMs: number;
    readonly cause?: Error;
    constructor(message: string, binaryPath: string, durationMs: number, cause?: Error);
}
/**
 * 进程执行结果
 */
export interface ProcessResult {
    /** 退出码，0 表示成功 */
    exitCode: number;
    /** 标准输出 */
    stdout: string;
    /** 标准错误 */
    stderr: string;
    /** 实际耗时（毫秒） */
    durationMs: number;
}
/**
 * 进程执行选项
 */
export interface ProcessRunOptions {
    /** 命令行参数列表 */
    args: string[];
    /** 超时时间（毫秒），默认 300000 */
    timeoutMs?: number;
    /** 工作目录 */
    cwd?: string;
    /** 环境变量 */
    env?: Record<string, string>;
    /** 最大重试次数 */
    maxRetries?: number;
    /** 重试间隔（毫秒），默认 1000 */
    retryDelayMs?: number;
}
/**
 * ProcessRunnerService
 *
 * 负责调用外部二进制（MxCAD 转换程序），包含：
 * - 信号量并发控制（默认最大 3，通过 ConversionEngineConfig 覆盖）
 * - 超时强杀机制（默认 300 秒）
 * - 错误捕获与日志记录
 * - 重试支持
 */
export declare class ProcessRunnerService {
    private readonly logger;
    private readonly semaphore;
    private readonly defaultTimeoutMs;
    constructor(config: ConversionEngineConfig);
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
    run(binaryPath: string, options: ProcessRunOptions): Promise<ProcessResult>;
    /**
     * 单次执行（不含重试）
     */
    private executeOnce;
    /**
     * 同步执行外部进程（非并发控制，用于快速探测等场景）
     *
     * @param binaryPath - 可执行文件路径
     * @param args       - 参数列表
     * @param timeoutMs  - 超时时间
     */
    runSync(binaryPath: string, args: string[], timeoutMs?: number): ProcessResult;
    /**
     * 安全地终止进程
     *
     * @param pid       - 进程 PID
     * @param signal    - 信号类型，默认 SIGKILL
     */
    kill(pid: number, signal?: NodeJS.Signals): Promise<void>;
    /** 当前正在运行的进程数 */
    getRunningCount(): number;
    /** 队列中等待的进程数 */
    getQueuedCount(): number;
    /**
     * 解析进程输出中的 JSON
     *
     * MxCAD 转换程序通常在 stdout 的最后一行输出 JSON 格式的结果。
     * 此方法提取最后一行 JSON 进行解析，忽略之前的非 JSON 输出。
     *
     * @param stdout - 标准输出内容
     */
    parseJsonOutput<T = Record<string, unknown>>(stdout: string): T;
    private delay;
}
//# sourceMappingURL=process-runner.service.d.ts.map