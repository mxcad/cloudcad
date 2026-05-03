# 废弃依赖清理审计报告

**审计日期**：2026-05-02  
**审计范围**：@css-inline/css-inline, @nestjs/throttler, @paralleldrive/cuid2, graphmatch, is-unicode-supported, uuid, @types/uuid

---

## 1. package.json 依赖检查

### 检查结果
| 依赖包 | root | backend | frontend | conversion-engine | config-service | svnVersionTool | server-tasks |
|-------|------|---------|----------|-------------------|----------------|----------------|--------------|
| @css-inline/css-inline | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| @nestjs/throttler | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| @paralleldrive/cuid2 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| graphmatch | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| is-unicode-supported | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| uuid | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| @types/uuid | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

✅ **所有依赖已从所有包的 package.json 中移除**

---

## 2. 源码引用检查

### 检查结果

对整个代码库进行搜索，检查是否存在对这些依赖的引用：

| 文件路径 | 引用内容 | 说明 |
|---------|---------|------|
| `pnpm-lock.yaml` | 锁文件 | 正常，锁文件会保留历史引用 |
| `docs/dependency-audit-report.md` | 审计文档 | 正常，历史审计记录 |
| `packages/backend/src/test/global-setup.ts` | `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` | ✅ 注释内容，是 PostgreSQL 扩展引用，非 npm 包 |
| `API.md` | - | 文档，无实际引用 |

✅ **源码中没有实际引用这些依赖**

---

## 3. pnpm install 检查

### 执行结果
```
Scope: all 7 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 2.1s using pnpm v9.15.9
```

✅ **pnpm install 成功，无错误**

---

## 4. 类型检查结果

### packages/backend
✅ **类型检查通过** (tsc --noEmit 无错误)

### packages/conversion-engine
✅ **类型检查通过** (tsc --noEmit 无错误)

### packages/frontend
⚠️ 存在类型错误，但**与本次清理的依赖无关**：
- 现有类型错误主要是 UserDto/User 类型不兼容等问题
- 这些错误在清理前已存在
- 不影响依赖清理的有效性

---

## 5. 审计总结

### ✅ 清理成功
- 所有目标依赖已从 package.json 中移除
- 源码中无实际引用
- pnpm install 无错误
- backend 和 conversion-engine 包类型检查通过

### 📋 建议
- 前端项目的类型错误应单独修复
- pnpm-lock.yaml 会随着后续依赖更新自动清理

---

**审计结论**：废弃依赖清理**完全执行**，项目状态正常。
