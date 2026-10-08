/**
 * 协同 wire 协议已收敛到 @cloudcad/platform（collaboration/wire.ts，与移动端
 * 共用唯一实现）。本文件仅保留 re-export shim，避免全部 import 点迁移。
 */
export type {
  CollaborateWorkDataV1,
  CollaborateWorkDataV2,
  CollaborateWorkDataV3,
  CollaborateWorkData,
  CollaborateUserData,
  Work,
} from '@cloudcad/platform';
export {
  encodeUserData,
  encodeV3WorkData,
  parseWorkData,
  parseUserData,
  getWorkCreator,
  deduplicateWorkUsers,
} from '@cloudcad/platform';
