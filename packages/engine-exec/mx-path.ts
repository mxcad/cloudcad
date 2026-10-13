import os from 'node:os';
import path from 'node:path';

/**
 * MX 可执行文件路径解析 —— 跨平台误配置回退的唯一出口
 *
 * 背景：用户在 Windows 上配好的 `.env` 被复制到 Linux 机器（或反之）时，
 * `MXCAD_ASSEMBLY_PATH` 会指向另一平台的二进制。Linux 上以 `.exe` 结尾的路径
 * 一定是 Windows 可执行文件，此时必须忽略环境变量、回退到当前平台的默认路径。
 *
 * 不做这个回退的后果是静默的：spawn 找不到文件 → ENOENT → `interpretEngineRun`
 * 归类为 `not-started`（可重试的环境性失败），每次转换都会重试到超时，看起来像
 * 「引擎抽风」而实际是环境配错。runtime/scripts/lib/mxcad-path.js 在部署侧已有一份
 * 同语义实现（部署/运维脚本进程族，不依赖本 TS 包的 dist，故不能合并过去）。
 *
 * 默认路径由调用方传入而不是本层拼接：backend 与 conversion-service 的项目根锚点
 * 各自不同（backend 从 dist 深度固定上溯、conversion-service 向上查找含 runtime/ 的
 * 目录），本层只定规则、不定位置。
 */
export interface ResolveMxExecutablePathOptions {
  /** Windows 平台默认路径（调用方按自己的项目根锚点拼好） */
  windowsDefault: string;
  /** Linux 平台默认路径 */
  linuxDefault: string;
  /** 目标平台；缺省取当前进程平台，可注入以便跨平台单测 */
  platform?: NodeJS.Platform;
}

/**
 * 解析与当前平台匹配的 MX 可执行文件路径。
 *
 * - Windows：环境变量优先（不判 `.exe`，Windows 上两者都是 `.exe`）。
 * - Linux：环境变量指向 `.exe` 时判定为跨平台误配置，回退 Linux 默认路径；
 *   其余情况（非 `.exe` 路径、或本就正确）原样采用。
 * - 未配置：按平台取默认路径。
 *
 * @param envPath 环境变量中配置的路径（可能为空）
 * @param options 平台默认路径与目标平台
 * @returns 与当前平台匹配的可执行文件路径
 */
export function resolveMxExecutablePath(
  envPath: string | undefined,
  options: ResolveMxExecutablePathOptions
): string {
  const isWindows = (options.platform ?? os.platform()) === 'win32';
  if (envPath) {
    if (isWindows) return envPath;
    if (path.extname(envPath).toLowerCase() !== '.exe') return envPath;
  }
  return isWindows ? options.windowsDefault : options.linuxDefault;
}
