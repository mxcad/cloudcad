---
name: frontend-i18n-audit
description: 审计并修复前端（PC packages/frontend + 移动端 packages/frontend_mobile）i18n 翻译完整性——找出「切到英文仍显示中文」的漏网点并修复验证。触发条件：用户说「还有中文没翻译」「切换到英文不应该出现中文」「每个页面都看看翻译」「你再排查一下看还有没有」「db-strings」「语言切换不生效/文案不刷新」等。核心根因是模块级 t() 烘焙（非中文语言包异步加载，模块求值期 t() 回退 zh-CN，模块级常量被烘焙成中文且切语言后永不刷新）。
---

# 前端 i18n 翻译完整性审计（PC + 移动端）

用户报「切英文还有中文」时，绝大多数根因是**模块级 t() 烘焙**，少数是文案没写 `t()`、或后端下发文案（前端不该修）。按下面六步走，不要跳步。

## 一、根因：模块级 t() 烘焙

`src/languages/index.ts` 中非中文语言包（en-US/zh-TW/ko-KR）全是**动态 import（异步）**。模块求值期（import 阶段）en-US pack 尚未就绪，`t()` 必然回退同步 zh-CN。于是：

```ts
// ❌ 模块顶层——求值时烘焙成中文，切语言后永不刷新
const TIER_LABEL = { user: t('普通用户') };
const ACTION_LABELS: Record<string, string> = { FILE_CREATE: t('新增图纸') };

// ✅ 函数式 getter——渲染期求值，switch + t() 字面量让 extract 自动登记
export function getTierLabel(tier: string): string {
  switch (tier) {
    case 'user': return t('普通用户');
    default: return tier;
  }
}
```

修复模式按优先级：

1. **函数式 getter**（首选，静态标签表）：`getXxxLabel(x)` 内 switch + `t('中文')` 字面量，default 返回原值。调用方在渲染期调用。
2. **移入组件体 / hook 体**：每次渲染求值。
3. **消费方自愈合 → 免修**：若烘焙值的唯一消费方在渲染期再包一层 `t(bakedValue)`（实例：`openDrawing.ts` 的 `t(DEFAULT_MESSAGES.OPENING_FILE)`），主方向（zh→en）自愈，**不要修**。下结论前先 grep 消费点。
4. **重挂载保证**：`key={activeLanguage}`（PC `App.tsx` / `CADEditorDirect.tsx`）整树重挂载，保证 memo 子树内 getter 刷新——修 getter 后无需额外处理。

## 二、静态扫描（双端）

```bash
# 候选：模块级赋值 / 对象字面量值里的 t()（.spec. 排除）
grep -rnE "^\s{0,2}(export )?(const|let) [A-Za-z_$][A-Za-z0-9_$]*\s*[:=].*\bt\(" packages/frontend/src packages/frontend_mobile/src --include=*.ts --include=*.tsx --include=*.vue | grep -v "\.spec\."
grep -rnE "^\s{2,4}[A-Z_]{2,}:\s*t\(" packages/frontend/src packages/frontend_mobile/src --include=*.ts | grep -v "\.spec\."
```

grep 只能给候选，**逐个人工判 scope**：在模块顶层 = 真烘焙；在函数/组件/hook 体内 = 安全（渲染期求值）。

## 三、分类（先分类再动手，方向错了全白干）

| 类别 | 判据 | 处置 |
|---|---|---|
| 真烘焙 | 模块顶层 `t()` 且消费方渲染期**没有**再包 `t()` | 修（第一节模式 1/2） |
| 自愈合 | 消费方渲染期 `t(bakedValue)` | 免修，报告里说明 |
| 品牌名（B 类） | 「梦想网页CAD实时协同平台」等专有名词 | 保留中文，报告说明 |
| 后端下发（C 类） | runtime-config 选项标签（Mock（开发测试）/阿里云/普通模式/便利优先/周一至周五）、角色描述、DB 配置文案 | **前端不修**——属后端 i18n 工程（后端 4 语言 error.yml/配置），报告单列 |
| 数据 | 账号名、图纸名、用户输入 | 保留，报告说明 |
| 语言名 | 语言切换器里语言自身名称 | 保留 |
| 死代码 | 无消费者 | 不修，按仓库规则标注/删 |

## 四、zod 表单消息（v4.4.3）

模块级 schema 的校验消息同样会烘焙，且 v4 的 API 有坑：

```ts
// ❌ 位置参数函数形式——运行时不生效
z.string().min(1, () => t('请输入账号'))
// ❌ message 参数 v4 类型只收 string（已废弃）
z.string().min(1, { message: () => t('请输入账号') })
// ✅ error 收函数（$ZodErrorMap），min/regex/refine 三种形式实测均生效
z.string().min(1, { error: () => t('请输入账号') })
```

注意：有些页面**按设计不渲染字段级错误**（如 PC 登录页账号表单 `trigger()` 失败静默返回，只渲染表单级 error），zod 消息无法可视化验证——以 Node 运行时实证（safeParse 返回动态消息）+ tsc 0 错为据，不要硬凑浏览器复现。

## 五、修复后管道（双端都要跑）

1. `pnpm i18n`（PC 与移动端各一次；= extract → translate → compile）
2. 验证新键：`idMap.json` 有 `source→id`，`messages/en-US.ts` 有 `id→英文译文`（**验证正则勿用 `\\s*`**——bash heredoc/node -e 下会误报 MISSING，用 `new RegExp('"' + id + '": "([^"]*)"')` 或字面量正则）
3. **重启双端 Vite**（8000/7001）——内存缓存旧模块，页面会显示裸数字 id，刷新无效
4. 双端 `tsc --noEmit` 0 错 + 单测（全量跑失败 → 单独重跑该 spec 过 = 高负载 flake，不算回归）

## 六、浏览器验证（agent-browser，先加载 agent-browser/browser-testing 技能）

```bash
agent-browser set viewport 1440 900   # PC；移动端 390 844
agent-browser open http://localhost:8000/<page>
agent-browser eval "(() => { localStorage.setItem('language','en-US'); location.reload(); return 'ok'; })()"
# 等 3-4s 后 CJK 扫描：
agent-browser eval "(() => { const m=document.body.innerText.match(/[\u4e00-\u9fff]+/g)||[]; return JSON.stringify([...new Set(m)]); })()"
```

操作要点：

- **eval 一律 IIFE 包裹**——裸 `const t = ...` 会残留页面上下文，下次 eval 报 `Identifier already declared`
- refs（@eN）页面一变化就失效 → 重新 snapshot 再操作
- 登出清会话：`fetch('/api/v1/auth/logout',{method:'POST',credentials:'include'})`；登出后匿名态回落浏览器语言，须重设 `localStorage` language + reload
- 移动端 App 在桌面 Chrome 中跳 PC 8000/cad-editor = ADR-0070 逃生设计，**不是翻译 bug**
- 残留 CJK 按第三节分类后报告，不要当 bug 修

## 七、汇报格式

中文汇报，含四块：① 修复清单（文件 + 模式）② 验证链（tsc/单测/i18n 键登记/Vite 重启/浏览器复验）③ 残留中文分类（数据/品牌/语言名/C 类后端下发）④ 免修判定说明（自愈合/设计行为）。
