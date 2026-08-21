## What to build

新增额度守卫层，在用户进行上传、粘贴、移动、复制、另存为、转换等操作前主动检查其 VIP 等级对应的额度。

- `QuotaEnforcementService`：读用户 tierLevel → 查 VipTier.configs → 比较当前用量
- `FileSystemNode` 新增 `totalSize` 缓存字段（仅 Project / PersonalSpace 根节点）
- 原子更新 totalSize：上传时 +size，删除/回收站时 -size，恢复时 +size，移动时源 - 目标 +
- 项目体积检查：`target.totalSize + increment ≤ user.configs["quota.project_size_mb"]`
- 个人空间体积检查：`userPersonalSpace.totalSize + increment ≤ user.configs["quota.personal_storage_mb"]`
- 日转换次数检查：Redis key `conversion:daily:{userId}:{YYYY-MM-DD}`，自然日 UTC+8，TTL 48h

## Acceptance criteria

- [ ] Prisma migration：FileSystemNode 新增 totalSize Float
- [ ] 回填脚本：计算所有项目的当前 totalSize
- [ ] `QuotaEnforcementService` 实现 3 个检查：`checkProjectQuota`、`checkPersonalQuota`、`checkConversionQuota`
- [ ] 上传/保存/复制/移动/粘贴/另存为流程集成项目+个人空间额度检查
- [ ] 转换流程集成日次数检查
- [ ] 超出额度时返回 `InsufficientQuotaException`（HTTP 403 + 错误码 + 中文提示）
- [ ] Redis 计数器原子递增，自然日 UTC+8 自动过期
- [ ] 单元 + 集成测试覆盖各类操作和边界条件

## Blocked by

- #129 (T2 — UserMembership 迁移至 tierLevel)
