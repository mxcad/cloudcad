/**
 * 文件名规则——跨端共享的纯判定（单一事实源在 @cloudcad/contracts）。
 *
 * 本文件仅 re-export contracts 的 files/name-rules，供前端从 `@cloudcad/platform`
 * 消费同一份实现（新建文件夹/新建图纸/重命名共用）。逻辑与测试在 contracts。
 */
export * from '@cloudcad/contracts/files/name-rules';
