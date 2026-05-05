---
id: P2-01
phase: 2
group: sequential
depends_on: []
skills: [tdd, code-reviewer]
files:
  - packages/frontend/src/services/mxcadManager.ts
commit_format: "refactor: split P2-01 - mxcadManager.ts"
---

# P2-01 — mxcadManager.ts 拆分 (~3198 行)

## Skills
- `/tdd` — 写测试先行
- `/code-reviewer` — 拆分后审查

## Prompt

复制以下内容发给你的 agent（替换 `{YOUR_AGENT_NAME}`）：

```
{YOUR_AGENT_NAME}，执行 P2-01。

## 工作目录
D:\project\cloudcad

## 任务
将 `packages/frontend/src/services/mxcadManager.ts` (~3198行) 拆分为 ≤800 行的模块。

## 必读文件
- 本任务文档：docs/tasks/phase2-file-split/P2-01-mxcadManager-split.md
- 项目规范：CLAUDE.md
- 前端规范：packages/frontend/CLAUDE.md
- T07 拆分模式参考：docs/tasks/archived/t00-t14/T07-UserManagement-migration+split.md

## 执行规范 — TDD 流程

### Phase A: 分析现有结构
1. 读取 `packages/frontend/src/services/mxcadManager.ts` 全文
2. 识别可提取的功能模块（保存、上传缩略图、外部参照、文件检查、缩略图检查等）
3. 列出所有被导出的函数和它们之间的依赖关系

### Phase B: RED — 先写测试
创建 `packages/frontend/src/services/mxcadManager/__tests__/` 目录，为每个提取的模块写测试：
- `mxcadSave.spec.ts` — 保存 mxweb 文件相关
- `mxcadThumbnail.spec.ts` — 缩略图上传/检查
- `mxcadExtRef.spec.ts` — 外部参照上传
- `mxcadCheck.spec.ts` — 文件去重检查

### Phase C: 拆分
目标结构：
```
services/mxcadManager/
├── index.ts              (~200行, 单例 + 公共API组装层)
├── mxcadSave.ts          (<400行, saveMxwebFile, saveMxwebAs)
├── mxcadThumbnail.ts     (<300行, uploadThumbnail, checkThumbnail)
├── mxcadExtRef.ts        (<300行, uploadExtReferenceImage)
├── mxcadCheck.ts         (<200行, checkDuplicateFile)
├── mxcadTypes.ts         (纯类型定义)
└── __tests__/
    ├── mxcadSave.spec.ts
    ├── mxcadThumbnail.spec.ts
    ├── mxcadExtRef.spec.ts
    └── mxcadCheck.spec.ts
```

拆分规则：
- 每个文件 ≤800 行
- `index.ts` 组装子模块，暴露单例工厂
- 子模块包含业务逻辑，通过参数接收依赖
- 使用 `@/` 导入
- 错误处理使用 `handleError`
- 无 `console.log`/`console.warn`

### Phase D: GREEN — 让测试通过
实现拆分后的模块，直到所有测试通过。

## 完成标准
- `cd packages/frontend && node ./node_modules/typescript/bin/tsc --noEmit` → exit 0
- 所有新测试通过
- `index.ts` 保持与原 `mxcadManager.ts` 相同的导出 API

## 完成后
- git commit，消息格式: "refactor: split P2-01 - mxcadManager.ts"
- 写报告到 docs/tasks/reports/P2-01-report.md
```

---

## Dependency
无前置依赖。

## Known Issues
- mxcadManager 是全局单例，拆分后需保持单例语义不变
- 文件是最大的单体文件（3198行），风险最高
- 拆分后所有导入方（CADEditorDirect.tsx, FileSystemManager.tsx, LibraryManager.tsx 等）需更新导入路径

## Instructions

1. **先分析**: 理解 mxcadManager 的完整结构
2. **TDD 先行**: 为每个提取模块写测试
3. **渐进拆分**: 一次提取一个模块，每次保证类型检查通过
4. **保留单例**: `index.ts` 必须保持与原始文件相同的单例语义
5. **更新导入方**: 拆分后检查并更新所有导入 mxcadManager 的文件

## Verify

```bash
# 类型检查
cd packages/frontend && node ./node_modules/typescript/bin/tsc --noEmit

# 确认新文件结构
ls -la packages/frontend/src/services/mxcadManager/

# 确认 index.ts 导出与原文件一致
diff <(grep -E '^export ' packages/frontend/src/services/mxcadManager.ts.orig) <(grep -E '^export ' packages/frontend/src/services/mxcadManager/index.ts)
```

## Report
Write to `docs/tasks/reports/P2-01-report.md`
