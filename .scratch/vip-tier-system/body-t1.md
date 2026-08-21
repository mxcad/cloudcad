## What to build

当前会员体系只有二元 FREE/PRO。新增三个领域模型作为新 VIP 等级体系的底层基础设施，与旧 MembershipPlan 并存（expand 阶段）。

- **VipTier**：等级定义表（level、name、baseMonthlyPrice、configs JSON、isActive）
- **DurationPricing**：时长定价表（months、multiplier、label、isActive、sortOrder）
- **ConfigKeyRegistry**：配置元数据表（key、type、label i18n、defaultValue、sortOrder）

含种子数据：VIP0（免费兜底）/VIP1/VIP2/VIP3 各一级，4 种时长（1/3/6/12 月），4 个配置 key（personal_storage_mb / daily_conversion_count / project_size_mb / max_projects）。

## Acceptance criteria

- [ ] Prisma migration 创建 3 张新表
- [ ] 种子数据插入 VIP0-VIP3、4 种时长、4 个配置 key
- [ ] admin CRUD API：`GET/PUT /api/admin/vip-tiers`、`GET/PUT /api/admin/vip-tiers/:id/configs`
- [ ] admin CRUD API：`GET/POST/PUT/DELETE /api/admin/duration-pricings`
- [ ] admin CRUD API：`GET/PUT /api/admin/config-key-registry`
- [ ] public-read API：`GET /api/vip-tiers`（仅 isActive）、`GET /api/duration-pricings`
- [ ] `GET /api/vip-tiers/registry` 返回 ConfigKeyRegistry 供前端动态渲染
- [ ] 单元测试覆盖 CRUD 逻辑和验证规则

## Blocked by

None — can start immediately
