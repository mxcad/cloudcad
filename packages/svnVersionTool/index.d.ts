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
 * 列出 SVN 仓库内容
 * @param repoUrl - 仓库 URL
 * @param isRecursive - 是否递归
 * @param username - 用户名（可选）
 * @param password - 密码（可选）
 * @param callback - 回调函数
 */
export function svnList(
  repoUrl: string,
  isRecursive: boolean,
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