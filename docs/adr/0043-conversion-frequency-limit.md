# 0043 — 转换频率限制（窗口化）替代每日转换配额
**Status**: accepted

上传/打开图纸的转换由「每日固定配额」（`quota.daily_conversion_count`，自然日 UTC+8 重置，默认 10 次/日）改为「每 N 小时窗口频率限制」：窗口内转换次数超限即拒绝，不转换、不创建 DB 节点，提示「转换过于频繁，请稍后再试」。触发背景：游客（匿名公开上传，uploads 预览）同样消耗转换引擎算力却完全不受限，形成免费刷算力后门；且「每日 10 次」的配额语义无法表达产品期望的防滥用频率控制（按小时窗口）。

**Decision**

1. **身份维度**：登录用户按 `userId` 计数（限制值来自 VIP tier 配置），游客按请求 IP 计数（限制值来自运行时配置）。已登录用户的公开上传（无 nodeId、仅预览）同样计入其 userId 窗口——限制对象是「转换」而非「上传到哪」。
2. **窗口语义**：每 N 小时固定窗口，N 与窗口内次数均可配置。登录用户默认 `quota.conversion_window_hours=2` + `quota.conversion_window_count=10`（替代并废弃 `quota.daily_conversion_count`）；游客默认 `conversionGuestWindowHours=2` + `conversionGuestLimit=5`（运行时配置）。Redis 键 `conversion:daily:{userId}:{date}` → `conversion:window:{user|ip}:{id}:{slot}`（旧键 TTL 2 天自然过期，无需迁移）。保留原子占位（Lua INCR + 上限判断）与失败释放（`releaseConversionCount`）机制。
3. **限制只发生在转换执行点**：3 处统一计数——上传→mxweb（`drawing-ingest`）、导出 DWG/DXF/PDF（`file-download-export`）、文件访问格式转换下载（`mxcad-file-access`）。上传接口、存储、其他服务一律不检查、不耦合；uploads 临时区不设容量防滥用（运维侧处理）。
4. **超限行为**：不转换、不创建 FileSystemNode、403 + 统一文案「图纸转换过于频繁，每 {hours} 小时最多可转换 {count} 次，请稍后再试」（i18n 新键 `error.quota.conversion_frequency_exceeded`，4 语言，删除旧键 `error.quota.daily_conversion_exceeded`）。
5. **会员中心/升级弹窗文案**动态读取窗口与次数，不再写死「每日重置」「VIP1 100 次/日」等静态值。

**Rejected options**

- **超限留存 + 待转换状态**（Q1 原方案 A）：上传成功建节点标记「待转换」，明天次数恢复后重转。否决原因：uploads 为临时区随时可清理，源文件丢失后待转换节点无意义；且引入新状态枚举、重转入口、存储语义等多处复杂化。最终统一「超限即拒、不留存」。
- **公开上传完全免限**：游客上传不转换则无法预览（CAD 编辑器只认 mxweb），免限即放弃对游客转换算力的保护。

**Status**: accepted

**Cross-references**
- CONTEXT.md「额度守卫（Quota Enforcement）」「限制策略（Restriction Strategy）」「VIP 配置（VIP Config）」
- ADR-0036 会员状态读侧权威：限制值经 `MembershipService.getQuota` 解析，默认值回落 `ConfigKeyRegistry.defaultValue`
- ADR-0022 配置注册表共享模块：游客窗口键注册进 `ConfigKeyRegistry`（运行时配置）
