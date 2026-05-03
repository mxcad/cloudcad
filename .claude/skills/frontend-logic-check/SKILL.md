---
name: frontend-logic-check
description: Frontend logic compliance checker. Use after completing a page/composable migration from React to Vue, before marking the task as done. This skill verifies that the Vue code faithfully replicates all business logic from the React source, with no additions, omissions, or modifications. Triggers on: 逻辑审查, 业务逻辑检查, 照搬检查, logic compliance check, React-Vue 对比, 迁移完整性检查.
---

# 前端逻辑照搬审查（Frontend Logic Compliance Check）

Verify that Vue code migrated from React faithfully replicates all business logic without additions, omissions, or modifications. This is a critical quality gate after any React → Vue migration to ensure no business logic is lost or accidentally changed.

## Scan scope

```
apps/frontend-vue/src/**/*.vue       # Vue migration target
apps/frontend-vue/src/**/*.ts        # Vue composables/services
apps/frontend/src/**/*.tsx           # React source reference (read-only)
apps/frontend/src/**/*.ts            # React hooks/services (read-only)
```

**Important:** The React files are **source reference only** — do not modify them. Use them as the gold standard for business logic comparison.

## Pre-flight: Identify React Source File

Before scanning, identify the corresponding React source file for the Vue file being checked:

| Vue 文件 | React 源文件 |
|----------|-------------|
| `LoginPage.vue` | `pages/Login.tsx` |
| `RegisterPage.vue` | `pages/Register.tsx` |
| `ResetPasswordPage.vue` | `pages/ForgotPassword.tsx` |
| `VerifyEmailPage.vue` | `pages/EmailVerification.tsx` |
| `VerifyPhonePage.vue` | `pages/PhoneVerification.tsx` |
| `DashboardPage.vue` | `pages/Dashboard.tsx` |
| `CadEditorPage.vue` | `pages/CADEditorDirect.tsx` |
| `ProfilePage.vue` | `pages/Profile.tsx` |
| `UserManagementPage.vue` | `pages/UserManagement.tsx` |
| `RoleManagementPage.vue` | `pages/RoleManagement.tsx` |
| `LibraryPage.vue` | `pages/LibraryManager.tsx` |
| `FontLibraryPage.vue` | `pages/FontLibrary.tsx` |
| `AuditLogPage.vue` | `pages/AuditLogPage.tsx` |
| `SystemMonitorPage.vue` | `pages/SystemMonitorPage.tsx` |
| `RuntimeConfigPage.vue` | `pages/RuntimeConfigPage.tsx` |
| `ProjectsPage.vue` | `pages/FileSystemManager.tsx` |
| `PersonalSpacePage.vue` | `pages/FileSystemManager.tsx` |

For composables, look in `hooks/` or `contexts/` directories of the React source.

## 检查项（Check Items）

### 检查项 1: 表单字段名、初始值、校验规则是否一致

**检查方法：**
1. 找到 React 源文件中的表单定义（useState/initializer + validation rules）
2. 找到 Vue 文件中的表单定义（ref/reactive + vee-validate rules）
3. 逐字段对比：
   - 字段名是否一致（如 `email` vs `Email`）
   - 初始值是否一致（如 `''` vs `null`）
   - 必填规则是否一致
   - 格式校验规则是否一致（email format、min length、pattern 等）

**典型问题：**
- Vue 中字段名与 React 中不一致
- 初始值从 `null` 变成了 `''`
- 某条校验规则被遗漏
- 正则表达式与 React 版不一致

### 检查项 2: 每个 if/else 分支是否都搬过来了

**检查方法：**
1. 在 React 源文件中找出所有条件分支（if/else、ternary、&&、||）
2. 在 Vue 文件中找到对应的逻辑
3. 确认每个分支都存在且条件相同

**重点检查：**
- 错误状态判断 (`if (error) { ... }`)
- 加载状态判断 (`if (loading) { ... }`)
- 空状态判断 (`if (!data) { ... }`)
- 权限判断 (`if (hasPermission) { ... }`)
- 边界条件判断 (`if (count === 0) { ... }`)

**典型问题：**
- else 分支被省略
- ternary 变成单向 if
- `&&` 短路逻辑被遗漏
- 嵌套条件只搬了外层

### 检查项 3: API 调用顺序和参数是否一致

**检查方法：**
1. 在 React 源文件中找出所有 API 调用（api.*、fetch、axios）
2. 在 Vue 文件中找到对应的 API 调用
3. 对比：
   - API 方法名是否一致
   - 参数顺序是否一致
   - 参数值是否一致（尤其是动态值）
   - 调用顺序是否一致

**典型问题：**
- API 方法名拼写错误
- 参数顺序颠倒
- 某可选参数被遗漏
- 调用顺序不一致导致竞态

### 检查项 4: 错误处理分支是否都搬过来了

**检查方法：**
1. 在 React 源文件中找出所有 try/catch、.catch()、错误回调
2. 在 Vue 文件中找到对应的错误处理
3. 确认：
   - 每个可能出错的地方都有 try/catch 或错误回调
   - 错误信息处理逻辑一致
   - 错误状态更新逻辑一致
   - 用户提示信息一致

**典型问题：**
- API 错误被吞掉（没有 .catch()）
- 错误信息没有展示给用户
- 错误状态更新逻辑不一致
- 网络错误 vs 业务错误处理不一致

### 检查项 5: 是否有遗漏的边界条件处理

**检查方法：**
1. 在 React 源文件中找出所有边界条件处理
2. 在 Vue 文件中确认都有对应处理

**常见边界条件：**
- 空数组/对象处理 (`arr.length === 0`, `Object.keys(obj).length === 0`)
- null/undefined 检查
- 数组索引边界
- 字符串空串检查
- 数字 0 vs null 区分
- 超长数据截断
- 并发请求取消（AbortController）

**典型问题：**
- 空数据时页面崩溃
- 边界值没有特殊处理
- 超长数据没有截断

### 检查项 6: 是否有新增的业务逻辑

**检查方法：**
1. 在 Vue 文件中找出所有业务逻辑
2. 在 React 源文件中确认每条逻辑都有对应实现
3. 任何 React 版没有的 if 分支、新计算字段、新状态更新都应该标记为可疑

**典型问题：**
- 在 Vue 中添加了 React 版没有的判断
- 在 Vue 中添加了额外的 API 调用
- 在 Vue 中修改了业务计算公式
- 在 Vue 中添加了 React 版没有的副作用

### 检查项 7: 是否有省略的错误处理

**检查方法：**
1. 在 React 源文件中找出所有可能出错的操作
2. 在 Vue 文件中确认每处都有错误处理

**常见遗漏：**
- API 调用没有 try/catch
- 表单提交没有错误处理
- 文件操作没有错误处理
- 状态更新没有错误边界
- 第三方库调用没有错误处理

## 对照检查流程（Comparison Workflow）

1. **定位 React 源文件**：根据 Vue 文件找到对应的 React 源文件
2. **逐行对比业务逻辑**：
   - 使用两栏对比（React 左，Vue 右）
   - 标记每行业务逻辑的对应关系
   - 特别注意条件分支和错误处理
3. **检查 API 调用链**：
   - 追踪每个 API 调用的完整链路
   - 确认参数传递的一致性
   - 检查调用顺序
4. **检查条件分支完整性**：
   - if/else 是否完整
   - ternary 是否等价
   - && 和 || 逻辑是否等价
5. **检查副作用处理**：
   - useEffect/useEffect 的等价实现
   - 生命周期清理函数
   - 订阅取消
   - AbortController

## Report output

Write to `apps/frontend-vue/docs/sprint5-logic-check-{序号}.md`. To determine the number:

1. List existing files in `apps/frontend-vue/docs/` matching `sprint*-logic-check-*.md`
2. Parse the highest number, increment by 1
3. If no files exist, start at `sprint5-logic-check-1.md`

### Report template

```markdown
# 前端逻辑照搬审查报告

审查时间：{timestamp}
审查范围：{Vue文件路径} → {React源文件路径}
审查人：AI Architect

---

## 审查结果：{PASS or FAIL}

### 总体结论

- Vue 文件：{path/to/VueFile.vue}
- React 源文件：{path/to/ReactFile.tsx}
- 业务逻辑完整度：{X/Y} 项检查通过
- 发现问题数：{n} 项（P1: {p1} 项，P2: {p2} 项）

---

### 检查项结果汇总

| # | 检查项 | 状态 | 问题数 |
|---|--------|------|--------|
| 1 | 表单字段一致性 | ✅/❌ | {n} |
| 2 | 条件分支完整性 | ✅/❌ | {n} |
| 3 | API 调用一致性 | ✅/❌ | {n} |
| 4 | 错误处理完整性 | ✅/❌ | {n} |
| 5 | 边界条件处理 | ✅/❌ | {n} |
| 6 | 新增业务逻辑 | ✅/❌ | {n} |
| 7 | 省略错误处理 | ✅/❌ | {n} |

---

{If issues exist:}

### 问题详情

#### 问题 1：{问题名称} [P1/P2]

**检查项：** {检查项编号} - {检查项名称}
**严重程度：** {P1/P2}
- **Vue 代码位置：** `{vue_file}:{line}`
- **问题描述：** {描述}
- **React 源版逻辑：**
  ```tsx
  // {react_file}:{line}
  {react_code}
  ```
- **Vue 当前实现：**
  ```vue
  {vue_code}
  ```
- **建议修复：** {建议}

{Repeat for each issue}

---

### 具体对比分析

#### API 调用对比

| # | API 方法 | React 参数 | Vue 参数 | 状态 |
|---|----------|------------|----------|------|
| 1 | api.login | {email, password} | {email, password} | ✅ 一致 |
| 2 | api.fetchUser | {userId} | {user_id} | ❌ 参数名不一致 |

#### 条件分支对比

| # | 条件 | React 处理 | Vue 处理 | 状态 |
|---|------|------------|----------|------|
| 1 | if (!user) | showLoginPrompt() | showLoginPrompt() | ✅ 一致 |
| 2 | if (loading) | showSpinner() | - | ❌ 遗漏 |

#### 错误处理对比

| # | 错误类型 | React 处理 | Vue 处理 | 状态 |
|---|----------|------------|----------|------|
| 1 | Network Error | showError('网络错误') | showError('网络错误') | ✅ 一致 |
| 2 | Auth Error | redirectToLogin() | - | ❌ 遗漏 |

---

### 问题优先级说明

- **P1（关键问题）**：业务逻辑不一致，可能导致功能缺失、错误或安全风险。必须修复。
- **P2（次要问题）**：逻辑差异但不影响核心功能，建议修复以保持一致性。

---

{If PASS:}

## ✅ 逻辑照搬审查通过

Vue 实现 `{VueFile.vue}` 完整照搬了 React 源版 `{ReactFile.tsx}` 的所有业务逻辑，无遗漏、无新增、无修改。

---

{If FAIL:}

## ❌ 逻辑照搬审查未通过

发现 {n} 项问题，其中 P1 问题 {p1} 项，P2 问题 {p2} 项。
请修复上述问题后重新提交审查。

---

报告生成时间：{timestamp}
报告人：AI Architect
```

## Execution checklist

1. **Identify Vue file to check** — confirm which file was just migrated
2. **Identify React source file** — use the mapping table above
3. **Read React source file** — understand all business logic, API calls, conditionals, error handling
4. **Read Vue target file** — understand the migrated implementation
5. **Run through 7 check items** — document any discrepancies
6. **Classify each issue as P1 or P2**
7. **Write comparison details** — API calls, conditionals, error handling side by side
8. **Write report** — follow template, be specific about line numbers and code
9. **Report to user** — summarize findings and required fixes