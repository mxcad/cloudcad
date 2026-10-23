/**
 * 版本历史展示计算——跨端共享的纯计算。
 *
 * 后端 getFileHistory 返回时间正序列表 [r0(初始), r1, ..., rN]（可能被 limit 截断，
 * totalCount 为真实修改总次数）。前端渲染需要：顶部为最新版本（rN）、底部为初始版本（r0），
 * 版本编号基于真实总次数（totalCount - index），limit 截断时编号不漂移。
 *
 * 过去只有 PC 一份实现（frontend/src/utils/versionHistory.ts）；移动端版本历史面板需要
 * 同一套编号算法与说明提取，按准入四条收敛到这里，两端共用一份。
 */

export const INITIAL_VERSION_REVISION = -1;

export interface VersionDisplayEntry<T> {
  entry: T;
  versionIndex: number;
}

export function toVersionDisplayList<T extends { revision?: number }>(
  entries: readonly T[],
  totalCount: number
): VersionDisplayEntry<T>[] {
  // entries 只读视图（pinia storeToRefs 的 ref 值）与可变数组都能直接传入，
  // 不要求调用方先 [...entries]
  return [...entries].reverse().map((entry, index) => ({
    entry,
    versionIndex:
      entry.revision === INITIAL_VERSION_REVISION ? 0 : totalCount - index,
  }));
}

/**
 * 从版本提交消息中提取用户填写的修改说明。
 *
 * 后端保存时消息格式为 `Save: <文件名> - <说明>`。说明来自保存弹窗的多行输入，
 * 可能含换行/空行，故说明捕获组必须用 [\s\S]（. 不匹配换行，多行说明会导致
 * 整体失配、说明整条丢失）。无说明（如 `Save: <文件名>`）或纯空白说明返回 null。
 */
export function extractUserNote(message: string): string | null {
  if (!message) return null;
  const saveMatch = message.match(/^Save:\s*.+?\s*-\s*([\s\S]+)$/i);
  if (saveMatch) {
    return saveMatch[1]?.trim() || null;
  }
  return null;
}
