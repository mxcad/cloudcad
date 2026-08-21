# 图纸版本部署技能上下文

## 为什么是轻量验证而非迁移框架

2026-07-29 在 `docs/adr/0022-drawing-version-deployment-verification.md` 记录。

**关键原因**：
- `MxVersionControlProvider` 已有自动修复逻辑（E155010/E200009/E170013 等），迁移框架会重复
- SVN 破坏性变更频率极低（路径配置/目录结构几个月一次），不值得构建完整迁移框架
- 大多数线上问题根因是配置文件遗漏，而非仓库状态迁移

## 体系定位

```
AGENTS.md (铁律: 三层一致性)
  └─ drawing-version-deployment (本技能)
       ├─ 配置完整性扫描表 (9个配置点)
       ├─ version:check (cli.js [2/6])  ← 部署前执行
       ├─ version:verify (cli.js [6/6]) ← 部署后执行
       └─ deploy/version-changelog/      ← 变更记录
```

## 相关 ADR

| ADR | 主题 |
|-----|------|
| 0015 | `storage-service` 独立存储 SVN 分片架构 |
| 0022 | 图纸版本部署采用轻量验证方案（本技能） |

## 技能与代码对应

| 技能概念 | 代码位置 |
|---------|---------|
| 触发条件 10 种 | `SKILL.md` front matter `description` |
| 配置完整性扫描表 | `SKILL.md` 表格 + `REFERENCE.md` 详细索引 |
| 部署前检查 5 项 | `drawing-version-helper.js` `runHealthCheck()` |
| 部署后验证 5 项 | `drawing-version-helper.js` `runVerification()` |
| 变更记录 | `drawing-version-helper.js` `writeChangelog()` → `deploy/version-changelog/` |
| CLI 集成 | `cli.js` `deployMode()` 步骤 2 和 7 |
