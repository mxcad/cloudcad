# 01 — batchDownloadEnabled 运行时开关（批量下载灰度闸门）

**What to build:** 批量下载能力受运行时开关控制——默认关闭时请求被拒且前端不显示入口；运营可在配置中心一键开启/关闭，免发版。参照既有 `collaborationEnabled` 模式（`runtime-config.constants.ts` 定义，默认 `false`，`isPublic: true`）。

**Blocked by:** None — can start immediately

**Status:** done (2026-08-04)

- [ ] runtime-config 新增 `batchDownloadEnabled`（boolean，默认 `false`，`isPublic: true`），对齐 `collaborationEnabled` 的注册模式
- [ ] 批量下载入口（后端）增加开关守卫：关闭时返回业务错误（带 i18n 错误键，4 语言文件同步补），不暴露接口实现细节
- [ ] API SDK 重新生成，前端类型不报错
- [ ] 前端批量下载入口按开关隐藏/禁用（获取开关状态时同时读取 `batchDownloadEnabled`）
- [ ] 单元测试：开关关→拒绝；开关开→放行；覆盖 runtime-config 注册与守卫逻辑
- [ ] 上线默认关闭状态验证（配置中心可切换，切换后无需重启生效）
