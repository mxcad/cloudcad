# 三层依赖约束架构
**Status**: accepted

后端 22 个模块扁平排布，谁都可以 import 谁。这导致循环依赖反复出现（ADR-0003 修了一个但还会再出现）、测试需要 mock 的依赖链过长、新人不知道模块间应该怎样依赖。我们引入一个显式的三层依赖方向约束：基础设施层 → 核心业务层 → 业务编排层，箭头方向不可逆转。

**Details**

- **Layer 1 基础设施**：不依赖任何业务模块。包括 DatabaseModule、RedisModule、CacheArchitectureModule、StorageModule、CommonModule、I18nModule。
- **Layer 2 核心业务**：只能依赖 Layer 1。同层之间尽量通过接口解耦（如 IUserService、IPermissionStore）。包括 AuthModule、UsersModule、RolesModule、FileSystemModule、BillingModule、AuditLogModule、RuntimeConfigModule、PolicyEngineModule、FontsModule。
- **Layer 3 业务编排**：只能依赖 Layer 1 + Layer 2。不能互相依赖。包括 MxCadModule、ConversionModule、LibraryModule、ShareModule、BatchDownloadModule、AdminModule、PublicFileModule、SchedulerModule、HealthModule、VersionControlModule。

**Enforcement**

- Code Review 必查。新人加入时通过此文档讲解分层规则。
- `pnpm depcruise` 命令已配置，可用于自愿的依赖分析（基于 dependency-cruiser），不接入 CI。

**Status**: accepted
