/**
 * 版本历史显示工具
 *
 * 实现已收敛到 @cloudcad/platform（移动端版本历史面板共用同一份倒序编号算法与
 * 提交说明提取）。本文件退化为兼容出口：PC 调用方仍按原路径导入，勿在此重新实现逻辑。
 */

export {
  INITIAL_VERSION_REVISION,
  toVersionDisplayList,
  extractUserNote,
} from '@cloudcad/platform';

export type { VersionDisplayEntry } from '@cloudcad/platform';
