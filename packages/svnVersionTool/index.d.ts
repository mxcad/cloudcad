/**
 * SVN 版本控制工具包类型定义
 */

/**
 * SVN 操作回调函数类型
 */
export type SvnCallback = (error: Error | null, result?: string) => void;

/**
 * 从 SVN 仓库检出代码
 * @param repoUrl - 仓库 URL
 * @param targetDir - 目标目录
 * @param username - 用户名（可选）
 * @param password - 密码（可选）
 * @param callback - 回调函数
 */
export function svnCheckout(
  repoUrl: string,
  targetDir: string,
  username: string | null,
  password: string | null,
  callback: SvnCallback
): void;

/**
 * 添加文件或目录到 SVN 版本控制
 * @param targetPaths - 目标路径数组
 * @param isRecursive - 是否递归
 * @param callback - 回调函数
 */
export function svnAdd(
  targetPaths: string[],
  isRecursive: boolean,
  callback: SvnCallback
): void;

/**
 * 向 SVN 仓库提交更改
 * @param targetPaths - 目标路径数组
 * @param message - 提交日志
 * @param isRecursive - 是否递归
 * @param username - 用户名（可选）
 * @param password - 密码（可选）
 * @param callback - 回调函数
 */
export function svnCommit(
  targetPaths: string[],
  message: string,
  isRecursive: boolean,
  username: string | null,
  password: string | null,
  callback: SvnCallback
): void;

/**
 * 从 SVN 工作副本中删除文件或目录（仅标记删除，不提交）
 * @param targetPaths - 目标路径数组
 * @param isRecursive - 是否递归
 * @param keepLocal - 是否保留本地文件
 * @param username - 用户名（可选）
 * @param password - 密码（可选）
 * @param callback - 回调函数
 */
export function svnDelete(
  targetPaths: string[],
  isRecursive: boolean,
  keepLocal: boolean,
  username: string | null,
  password: string | null,
  callback: SvnCallback
): void;

/**
 * 列出 SVN 仓库内容
 * @param repoUrl - 仓库 URL
 * @param isRecursive - 是否递归
 * @param revision - 修订版本号（可选）
 * @param username - 用户名（可选）
 * @param password - 密码（可选）
 * @param callback - 回调函数
 */
export function svnList(
  repoUrl: string,
  isRecursive: boolean,
  revision: number | null,
  username: string | null,
  password: string | null,
  callback: SvnCallback
): void;

/**
 * 创建一个新的 SVN 仓库
 * @param repoPath - 仓库路径
 * @param callback - 回调函数
 */
export function svnadminCreate(
  repoPath: string,
  callback: SvnCallback
): void;

/**
 * SVN import - 将未版本控制的目录树导入仓库
 * @param importPath - 要导入的路径
 * @param repoUrl - 仓库 URL
 * @param message - 提交日志
 * @param callback - 回调函数
 */
export function svnImport(
  importPath: string,
  repoUrl: string,
  message: string,
  callback: SvnCallback
): void;

/**
 * 获取 SVN 提交历史
 * @param targetPath - 目标路径（文件或目录）
 * @param limit - 限制返回的提交记录数量（可选）
 * @param verbose - 是否显示详细信息（包括变更的文件列表）
 * @param username - 用户名（可选）
 * @param password - 密码（可选）
 * @param callback - 回调函数
 */
export function svnLog(
  targetPath: string,
  limit: number | null,
  verbose: boolean,
  username: string | null,
  password: string | null,
  callback: SvnCallback
): void;

/**
 * 获取指定版本的文件内容
 * @param filePath - 文件路径
 * @param revision - 修订版本号（可选，不指定则获取最新版本）
 * @param username - 用户名（可选）
 * @param password - 密码（可选）
 * @param callback - 回调函数
 */
export function svnCat(
  filePath: string,
  revision: number | null,
  username: string | null,
  password: string | null,
  callback: SvnCallback
): void;

/**
 * SVN 检查结果
 */
export interface SvnCheckResult {
  available: boolean;
  version: string | null;
  message: string;
}

/**
 * 平台信息
 */
export interface PlatformInfo {
  platform: string;
  isWindows: boolean;
  svnPath: string;
  svnadminPath: string;
}

/**
 * SVN 检查回调函数类型
 */
export type SvnCheckCallback = (error: Error | null, result?: SvnCheckResult) => void;

/**
 * 检查 SVN 是否可用（异步）
 * @param callback - 回调函数
 */
export function checkSvnAvailable(callback: SvnCheckCallback): void;

/**
 * 检查 SVN 是否可用（同步）
 * 仅用于启动时快速检查，会阻塞进程
 * @returns SVN 检查结果
 */
export function checkSvnAvailableSync(): SvnCheckResult;

/**
 * 获取当前平台信息
 * @returns 平台信息对象
 */
export function getPlatformInfo(): PlatformInfo;

/**
 * 设置 SVN 属性
 * @param targetPath - 目标路径
 * @param propertyName - 属性名称
 * @param propertyValue - 属性值
 * @param callback - 回调函数
 */
export function svnPropset(
  targetPath: string,
  propertyName: string,
  propertyValue: string,
  callback: SvnCallback
): void;

/**
 * 更新 SVN 工作副本
 * @param targetPath - 目标路径
 * @param username - 用户名（可选）
 * @param password - 密码（可选）
 * @param callback - 回调函数
 */
export function svnUpdate(
  targetPath: string,
  username: string | null,
  password: string | null,
  callback: SvnCallback
): void;

/**
 * 清理 SVN 工作副本锁定
 * 用于解决 "Working copy locked" 错误
 * @param targetPath - 目标路径
 * @param callback - 回调函数
 */
export function svnCleanup(
  targetPath: string,
  callback: SvnCallback
): void;