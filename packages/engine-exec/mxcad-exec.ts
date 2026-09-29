import { spawnManagedProcess } from './spawn';
import type { ManagedProcessResult, ManagedSpawnOptions } from './spawn';

/**
 * mxcadAssembly 运行结果的类型别名（形状即受管进程结果）。
 */
export type RunMxcadAssemblyResult = ManagedProcessResult;

/**
 * mxcadAssembly 专用选项。字段集与 `ManagedSpawnOptions` 相同——mxcadAssembly 没有
 * 协议之外的额外旋钮，故此处不重复声明，避免两份清单漂移。
 */
export type RunMxcadAssemblyOptions = ManagedSpawnOptions;

/**
 * 以独立进程组方式运行 mxcadAssembly，超时或结束时杀掉整个进程组。
 *
 * mxcadAssembly 专用的薄封装：唯一职责是把 JSON 参数包装成单元素 argv 交出去。
 * 进程组隔离、超时升级、杀进程树、输出捕获全部在 `spawnManagedProcess` 里（协议无关），
 * 本函数不持有自己的 spawn 逻辑——两侧要加杀树/超时行为时只改 `spawn.ts` 一处。
 *
 * `arg` 是**已序列化**的 JSON 字符串参数（Linux 单引号 / Windows 原始双引号约定由调用方
 * 在序列化时决定）。引擎成败只看该 JSON 里的 `{"code":...}`，**退出码恒 2123，勿按退出码判成败**。
 * 始终 resolve（不 reject），由调用方用 `interpretEngineRun` 解读结果。
 */
export function runMxcadAssembly(
  bin: string,
  arg: string,
  opts: RunMxcadAssemblyOptions
): Promise<RunMxcadAssemblyResult> {
  return spawnManagedProcess(bin, [arg], opts);
}
