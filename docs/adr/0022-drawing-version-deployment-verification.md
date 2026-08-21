# 图纸版本部署采用轻量验证方案
**Status**: accepted

图纸版本管理涉及的 SVN 部署变更长期缺乏规范化流程，导致每次修改 `mxVersionTool`/`version-control`/`storage`/`storage-service` 或相关配置后部署到线上都会出现 SVN 异常。

**Decision**

不采用类 Prisma Migrate 的版本化迁移框架，而是采用轻量验证方案——将「部署前检查 + 部署后验证」集成到现有 `cli.js` 运维 CLI 中。

**对比**

| 维度 | 迁移框架方案（否决） | 轻量验证方案（采用） |
|------|-------------------|-------------------|
| 核心思想 | SVN 仓库状态变更像数据库 schema 一样版本化迁移 | 利用现有自愈能力，在部署前后验证关键链路 |
| 复杂度 | 需要迁移文件格式、meta.json 编排、up/down 脚本 | 5 项检查 + 5 项验证，直接调用 svn CLI |
| 与现有代码的关系 | 与 `MxVersionControlProvider.initializeMxRepository()` 自愈逻辑重复 | 互补：检查发现缺失（自愈会补），验证确认功能正常 |
| 变更频率匹配度 | 低（SVN 破坏性变更几个月一次） | 高（每次部署都执行，不依赖变更频率） |
| 维护成本 | 需维护迁移框架本身 + 迁移脚本 | 极低——辅助脚本 490 行，与 CLI 同目录 |

**Rationale**

1. `MxVersionControlProvider` 已内置完善的自动修复逻辑（E155010 自动 revert+retry、E200009 cleanup+update、URL 不匹配自动 switch/relocate），迁移框架会与自愈逻辑重复覆盖。
2. SVN 相关的破坏性变更（路径配置/目录结构）发生频率极低，不值得为此构建完整迁移框架。
3. 大多数线上 SVN 问题的根因是**配置文件遗漏**（改了 `.env` 没同步到 `docker-compose.yml`），而非仓库状态迁移。
4. 现有 `cli.js` 已有成熟的 `runDatabaseMigration()` 模式，沿袭相同风格集成新命令，开发人员无学习成本。

**Consequences**

- 正向：每次部署自动执行 10 项检查/验证，变更记录写入 `deploy/version-changelog/`，问题早期暴露。
- 正向：技能 `drawing-version-deployment` 在检测到 SVN 相关代码变更时，强制 agent 完成 9 个配置文件的完整性扫描。
- 风险：`svnadmin verify` 在 `file://` 协议直连模式下可能失败，已降级为 warning 不阻塞部署。
- 风险：磁盘空间检查在权限受限环境下可能无法获取准确值。

**Status**

Accepted

**References**

- `.agents/skills/drawing-version-deployment/SKILL.md` — 技能主文件
- `.agents/skills/drawing-version-deployment/REFERENCE.md` — 配置完整性扫描表
- `runtime/scripts/drawing-version-helper.js` — 检查/验证实现
- `runtime/scripts/cli.js` — 集成入口（`deployMode` 第 2/6、6/6 步）
- `AGENTS.md` — 铁律三层一致性原则
