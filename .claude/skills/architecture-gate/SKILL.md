---
name: architecture-gate
description: Architecture compliance checker for the frontend-vue codebase. Use whenever the user asks for 架构门禁审查, 检查代码合规性, 跑一遍门禁, 门禁检查, or any variation of checking whether frontend Vue/TypeScript code follows the project's 4 architecture rules and Vuetify priority principle. Also use proactively after completing significant frontend-vue changes — offer the user a gate check. This is the code review quality gate before merging.
---

# 架构门禁（Architecture Gate）

Scan all `.vue` and `.ts` files under `apps/frontend-vue/src/` and check each against the 4 architecture rules, plus the Vuetify priority principle. Report every violation with file path, line number, offending code, rule reference, and priority classification (P1/P2).

## Scan scope

```
apps/frontend-vue/src/**/*.vue
apps/frontend-vue/src/**/*.ts
```

Exclude `node_modules/`, `dist/`, `.git/`, `*.spec.ts`, `*.test.ts`.

## The 4 Rules + Vuetify 优先原则

### Rule 1: 域间隔离（Domain Isolation）

Composables must not import across business domains. Cross-domain coordination happens only at page level or through `useCadEvents` event bridge.

**What to look for:**
Scan every file under `apps/frontend-vue/src/composables/`. For each import statement, check: does this composable import another composable from a different business domain?

- ✅ `CadEditorPage.vue` imports both `useCadEngine` and `useFileTree` — the page orchestrates them
- ✅ `useCadCommands.ts` imports `useCadEngine` — same domain (both are cad domain)
- ❌ `useCadEngine.ts` imports `useFileTree` — engine domain must not depend on file-tree domain
- ❌ `useAuth.ts` imports `useCadEngine` — auth domain must not depend on cad domain

**Business domain boundaries:**
| Domain | Composables |
|--------|-------------|
| cad | useCadEngine, useCadCommands, useCadEvents |
| progress | useProgress |
| theme | useTheme |
| i18n | useI18n |
| auth | any auth-* composable |
| file-tree | any file-tree-* or file-* composable |

Cross-domain between cad ↔ progress/theme/i18n is **allowed** (these are infrastructure, not business domains).

### Rule 2: Store 只存状态（Store = State Only）

Pinia stores under `apps/frontend-vue/src/stores/` can only contain `ref()`, `reactive()`, and simple getters/computed properties. No API calls, no business logic, no async operations with side effects.

**What to look for:**
Open each file in `apps/frontend-vue/src/stores/`. Flag any function that:
- Calls `fetch()`, `axios`, `api.*`, or any HTTP client
- Contains `await` with side effects (awaiting a pure computation like `new Promise(r => setTimeout(r, 0))` is fine)
- Calls composable functions or other stores' actions that have side effects

- ✅ `const currentFileInfo = ref<CadFileInfo | null>(null)`
- ✅ `function setReady(ready: boolean) { isReady.value = ready }`
- ❌ `async function openFile(url: string) { const data = await api.download(url); }`
- ❌ `async function login(email, password) { const res = await axios.post('/login'); }`

### Rule 3: 页面只做组装（Pages = Assembly Only）

Page components (`.vue` files used as route targets) should only import composables, pass props, and render child components. They must not contain inline business logic.

**What to look for:**
Open each `.vue` file. If the page has a `<script setup>` or `<script>`, check for:
- Inline `async function` that calls APIs directly (not through a composable)
- Inline authentication/authorization checks (`if (isAuthenticated) { ... }`)
- Inline business logic like data transformation, file processing, validation
- Inline event handlers that contain more than one statement of orchestration

Event handlers that do simple orchestration (calling a composable method, updating a ref) are OK. The test is: *would this logic need to change if the backend API changed?* If yes, it belongs in a composable.

- ✅ `const { openFile, saveFile } = useCadEngine();`
- ✅ `function handleClick() { openFile(); }` — simple delegation
- ❌ `async function handleUpload() { if (isAuth) { const res = await api.post(...); } }`
- ❌ `if (file.size > MAX_SIZE) { showError('too large'); return; }` — validation logic belongs in a composable

**Known violations from sprint4:**
- `LoginPage.vue` — contains login form validation logic, API error handling
- `DashboardPage.vue` — contains dashboard data fetching and transformation logic

### Rule 4: mxcad-app 通信统一走 useCadEvents（Event Bridge）

All communication with `mxcad-app` via `dispatchEvent`/`addEventListener` must go through `useCadEvents()`. Direct use of `window.dispatchEvent`, `window.addEventListener`, `document.dispatchEvent`, or `document.addEventListener` with `mxcad-*` prefixed events is forbidden.

**What to look for:** Grep for these patterns:
- `window.dispatchEvent(new CustomEvent('mxcad-`
- `window.addEventListener('mxcad-`
- `document.dispatchEvent(new CustomEvent('mxcad-`
- `document.addEventListener('mxcad-`

- ✅ `const { emit, on } = useCadEvents(); emit('file-opened', { fileId })`
- ❌ `window.dispatchEvent(new CustomEvent('mxcad-save-required', { detail: {...} }))`
- ❌ `window.addEventListener('mxcad-theme-changed', handler)`

**Exception:** Listening for `mxcad-theme-changed` from `mxcad-app` in `useTheme.ts` is allowed because `mxcad-app` emits it, not us — this is receiving external events, not our own internal communication.

### Rule 5: Vuetify 优先原则（Vuetify-First Principle）

All UI components must use Vuetify built-in components. Hand-rolled div+CSS for standard UI elements is strictly forbidden.

**What to look for:**

**5.1 Hand-written DOM operations:**
Grep for these patterns in `composables/` and `components/`:
- `document.createElement`
- `element.innerHTML`
- `element.setAttribute` (on non-Vuetify elements)
- `document.querySelector`
- `document.getElementById`
- `document.getElementsByClassName`
- Manual DOM manipulation for dialogs, modals, tooltips

**Known violations from sprint4:**
- `useUppyUpload.ts` — may contain `document.createElement` or manual DOM manipulation for upload progress
- `useCadEngine.ts` — may contain manual DOM operations for CAD canvas manipulation

**5.2 Hand-written button/input/dialog:**
Grep for these anti-patterns:
- `<div class="btn"` or `<div class="button"` (should be `<v-btn>`)
- `<div class="dialog"` (should be `<v-dialog>`)
- `<div class="modal"` (should be `<v-dialog>`)
- `<div class="input"` or `<input type="text"` (should be `<v-text-field>`)
- `<div class="select"` (should be `<v-select>`)
- `<div class="checkbox"` (should be `<v-checkbox>`)
- `<div class="progress"` (should be `<v-progress-linear>` or `<v-progress-circular>`)
- `<div class="snackbar"` or custom toast (should be `<v-snackbar>`)
- `<div class="drawer"` or `<div class="sidebar"` (should be `<v-navigation-drawer>`)

**5.3 CSS class styling anti-patterns:**
- Files using Tailwind-like utility classes (`class="flex items-center justify-between p-4"`) for layout
- Files with `<style>` blocks defining custom CSS for buttons, inputs, dialogs
- Files with `styled-components` or CSS modules for standard UI elements

**Correct patterns:**
- ✅ `<v-btn color="primary" @click="handleSubmit">提交</v-btn>`
- ✅ `<v-text-field v-model="email" label="邮箱" :rules="[rules.required]" />`
- ✅ `<v-dialog v-model="showDialog" max-width="500">`
- ✅ `<v-progress-linear :value="progress" />`
- ✅ `<v-snackbar v-model="showSnackbar">{{ message }}</v-snackbar>`
- ❌ `<div class="btn btn-primary" @click="handleSubmit">提交</div>`
- ❌ `<div class="dialog-overlay"><div class="dialog-content">...</div></div>`

## Report output

Write to `apps/frontend-vue/docs/sprint5-architecture-gate-{序号}.md`. To determine the number:

1. List existing files in `apps/frontend-vue/docs/` matching `sprint*-architecture-gate-*.md` or `sprint*-code-review-*.md`
2. Parse the highest number, increment by 1
3. If no files exist, start at `sprint5-architecture-gate-1.md`

### Report template

```markdown
# 架构门禁审查报告

审查时间：{timestamp}
扫描范围：apps/frontend-vue/src/
分支：refactor/circular-deps

## 审查结果：{PASS or FAIL}

### 统计

| 规则 | 违规数 | P1 | P2 |
|------|--------|-----|-----|
| 规则一：域间隔离 | {n} | {p1} | {p2} |
| 规则二：Store 只存状态 | {n} | {p1} | {p2} |
| 规则三：页面只做组装 | {n} | {p1} | {p2} |
| 规则四：事件桥接 | {n} | {p1} | {p2} |
| 规则五：Vuetify 优先 | {n} | {p1} | {p2} |
| **合计** | **{total}** | **{p1_total}** | **{p2_total}** |

### 问题优先级说明

- **P1（必须修复）**：违反核心架构原则，会导致代码腐烂、可维护性下降、跨域依赖混乱等问题
- **P2（建议修复）**：违反编码规范，影响代码一致性和可读性，但不影响系统正确性

{If violations exist:}

### 违规详情

#### 规则一：域间隔离 [P1/P2]

| # | 文件 | 行号 | 违规代码 | 说明 | 优先级 |
|---|------|------|----------|------|--------|
| 1 | path/to/file.ts | 42 | `import { useX } from '@/composables/useY'` | useY 与 useX 属于不同业务域 | P1 |

#### 规则二：Store 只存状态 [P1/P2]

| # | 文件 | 行号 | 违规代码 | 说明 | 优先级 |
|---|------|------|----------|------|--------|
| 1 | path/to/store.ts | 38 | `await api.fetchUser()` | Store 中不允许调用 API | P1 |

#### 规则三：页面只做组装 [P1/P2]

| # | 文件 | 行号 | 违规代码 | 说明 | 优先级 |
|---|------|------|----------|------|--------|
| 1 | LoginPage.vue | 56 | `if (errors.email) { ... }` | 表单校验逻辑应放在 composable 中 | P1 |
| 2 | DashboardPage.vue | 89 | `const stats = await api.getStats()` | API 调用应放在 composable 中 | P1 |

#### 规则四：事件桥接 [P1/P2]

| # | 文件 | 行号 | 违规代码 | 说明 | 优先级 |
|---|------|------|----------|------|--------|
| 1 | path/to/composable.ts | 24 | `window.dispatchEvent(new CustomEvent('mxcad-...'))` | 必须通过 useCadEvents 统一处理 | P1 |

#### 规则五：Vuetify 优先 [P1/P2]

| # | 文件 | 行号 | 违规代码 | 说明 | 优先级 |
|---|------|------|----------|------|--------|
| 1 | useUppyUpload.ts | 102 | `document.createElement('div')` | 禁止手写 DOM 操作 | P1 |
| 2 | useCadEngine.ts | 156 | `element.innerHTML = '...'` | 禁止手写 DOM 操作 | P1 |
| 3 | SomeComponent.vue | 45 | `<div class="btn btn-primary">` | 必须使用 <v-btn> | P2 |
| 4 | SomeComponent.vue | 78 | `<div class="dialog">...</div>` | 必须使用 <v-dialog> | P2 |

### Sprint4 待修复问题追踪

以下问题在 sprint4 审计中发现，本轮审查需确认是否已修复：

| # | 问题 | 文件 | 优先级 | 状态 |
|---|------|------|--------|------|
| 1 | LoginPage.vue 包含业务逻辑 | LoginPage.vue | P1 | 待确认 |
| 2 | DashboardPage.vue 包含业务逻辑 | DashboardPage.vue | P1 | 待确认 |
| 3 | useUppyUpload.ts 手写 DOM 操作 | useUppyUpload.ts | P1 | 待确认 |
| 4 | useCadEngine.ts 手写 DOM 操作 | useCadEngine.ts | P1 | 待确认 |

{If zero violations:}

## ✅ 架构门禁通过

全部 {N} 个文件通过五条规则检查，无违规项。

---

报告生成时间：{timestamp}
报告人：AI Architect
```

## Execution checklist

1. **Glob** all `.vue` and `.ts` files under `apps/frontend-vue/src/`
2. For **Rule 1**: Read every file in `composables/`, check imports against domain boundaries
3. For **Rule 2**: Read every file in `stores/`, flag functions that call APIs or contain side-effect awaits
4. For **Rule 3**: Read every `.vue` file used as a route page, check for inline business logic. Specifically check:
   - `LoginPage.vue` — login form validation, error handling
   - `DashboardPage.vue` — data fetching, statistics computation
5. For **Rule 4**: Grep for `window.dispatchEvent` and `window.addEventListener` patterns with `mxcad-` prefix
6. For **Rule 5**:
   - Grep for `document.createElement`, `document.querySelector`, `innerHTML`, `setAttribute`
   - Grep for `<div class="btn`, `<div class="dialog`, `<div class="input`, `<div class="modal`
   - Check `useUppyUpload.ts` and `useCadEngine.ts` specifically for DOM manipulation
7. Classify each violation as P1 (must fix) or P2 (should fix)
8. Check sprint4 tracked issues for resolution status
9. Compile findings, write report, report to user