# 02 — 清理"永久会员"商品化残留（前端）

**What to build:** 界面不再出现"永久会员"商品/推广表述。ADR-0042 已界定：产品体系只有 VIP0（免费）+ 限时 VIP 等级，"永久会员"仅是 `expiresAt: null` 的数据兼容状态。甄别并保留 VIP0 免费档"永久有效"的正确描述（免费档本身永久，不是商品）。

**Blocked by:** None — can start immediately

**Status:** done (2026-08-04)

- [ ] 全局搜索前端源码"永久"相关文案（MemberCenter / MembershipBadge / ProfileMembershipTab / 会员中心各页），逐一甄别：
  - 描述 VIP0 免费档"永久有效"的 → 保留（正确语义）
  - 暗示"永久会员"商品/购买/等级 → 改写为限时 VIP 语义或移除
- [ ] 新增/修改文案走 VoerkaI18n 流程（`pnpm i18n:extract` → 补 4 语言 → `pnpm i18n:compile`），无硬编码中文残留
- [ ] 与 `GET /billing/membership` 返回的 `expiresAt` 展示逻辑一致：`expiresAt: null` 按兼容状态展示，不展示"永久会员"品牌话术
- [ ] 前端 type-check 通过
