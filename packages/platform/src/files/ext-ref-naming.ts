/**
 * 外部参照文件命名契约——跨端（PC/移动端/后端）共用的纯变换（单一事实源在
 * @cloudcad/contracts）。
 *
 * 本文件仅 re-export contracts 的 files/ext-ref-naming，供前端从
 * `@cloudcad/platform` 消费同一份实现（查看/下载/引擎解析统一命名）。逻辑与测试
 * 在 contracts。
 */
export * from '@cloudcad/contracts/files/ext-ref-naming';
