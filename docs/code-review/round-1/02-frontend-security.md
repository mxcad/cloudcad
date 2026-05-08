# 前端安全审查报告 — Round 1

> **审查日期**: 2026-05-08  
> **审查范围**: `packages/frontend/src/` 全部代码  
> **技术栈**: React 19 + Vite + TypeScript + Zustand + Radix UI + Tailwind CSS v4  
> **审查人**: Claude Code 安全审查专家  

---

## 1. XSS 攻击向量

### 1.1 【严重】innerHTML 直接写入未转义的用户数据 ✅ 已修复 (8103f90b)

**文件**: `src/services/mxcadManager/mxcadCheck.ts`  
**行号**: 85 (`.innerHTML = `), 141 (`${filename}`)  
**严重程度**: 🔴 严重

**修复状态**: ✅ 已修复 — commit `8103f90b`: fix XSS in mxcadCheck.ts

**问题描述**:
`showDuplicateFileDialog()` 函数使用 `dialog.innerHTML = ...` 直接写入 HTML 模板字符串，其中第 141 行的 `${filename}` 来自函数参数，未经任何 HTML 转义直接插入 DOM。如果文件名包含 `<script>alert(1)</script>` 等恶意代码，将触发存储型 XSS。

```typescript
// mxcadCheck.ts:85
dialog.innerHTML = `
  ...
  <p style="...">${filename}</p>  // 第 141 行 — filename 未转义
  ...
`;
```

**修复建议**:
1. 使用 `textContent` 替代 `innerHTML` 来设置纯文本内容
2. 或引入 DOMPurify 库对 `${filename}` 进行 HTML 清洗
3. 或复用已有的 `escapeHtml()` 函数（MxCadUppyUploader.tsx:42）对 filename 进行转义

**是否需要用户确认**: 是（涉及修改 CAD 引擎相关代码，需确认不影响 mxcad-app 兼容性）

---

### 1.2 【严重】innerHTML 模板字符串 — 未保存更改对话框

**文件**: `src/services/mxcadManager/index.ts`  
**行号**: 196 (`.innerHTML = `)  
**严重程度**: 🔴 严重

**问题描述**:
`showUnsavedChangesDialog()` 函数使用 `innerHTML` 构建整个对话框 UI。虽然没有直接插入用户输入数据，但大量使用模板字符串拼接带内联事件处理器（`onmouseover`, `onmouseout`）的 HTML，这是一种不安全的编码模式。如果将来需要在此对话框中显示用户数据，缺乏防护。

**修复建议**:
1. 将对话框迁移为 React 组件（使用 Radix UI Dialog）
2. 至少使用 `textContent` 设置文本内容，用 `addEventListener` 替代内联事件处理器

**是否需要用户确认**: 否（仅涉及编码模式改进）

---

### 1.3 【严重】innerHTML 模板字符串 — 保存文件对话框

**文件**: `src/services/mxcadManager/mxcadSave.ts`  
**行号**: 103 (`.innerHTML = `)  
**严重程度**: 🔴 严重

**问题描述**:
`showSaveDialog()` 函数与上述模式相同，使用 `innerHTML` 构建保存文件对话框，包含 `onmouseover`/`onmouseout`/`onfocus`/`onblur` 等内联事件处理器。这些内联事件处理器本身是 XSS 的一个子类——如果 CSS 变量值被污染，可能被利用执行恶意代码。

```typescript
// mxcadSave.ts:128 — 内联事件处理器
onmouseover="this.style.color='...'"
onmouseout="this.style.color='...'"
onfocus="this.style.borderColor='...'"  // 第 158 行
```

**修复建议**:
1. 迁移为 React 组件，使用 Radix UI Dialog
2. 使用 CSS 类名 + `:hover`/`:focus` 伪类替代内联事件处理器
3. 立即修复：将 `onmouseover`/`onfocus` 等内联事件替换为 CSS `:hover`/`:focus` 选择器

**是否需要用户确认**: 是（涉及保存流程用户体验，建议保留现有行为再优化）

---

### 1.4 【中】内联事件处理器污染风险

**文件**: 
- `src/services/mxcadManager/index.ts`: 252, 266, 280
- `src/services/mxcadManager/mxcadSave.ts`: 128, 158, 185, 199  
**严重程度**: 🟡 中等

**问题描述**:
上述文件中多处使用内联事件处理器（`onmouseover`、`onmouseout`、`onfocus`、`onblur`）。虽然当前这些处理器仅操作样式属性，但如果 `isDark` 变量来自用户可控制的数据源，可能被注入恶意 JavaScript。

**修复建议**:
统一用 CSS `:hover`、`:focus` 伪类和 CSS 变量替代内联事件处理器。

**是否需要用户确认**: 否

---

### 1.5 【良】XSS 防护措施已到位

**正面发现**: 
- `src/components/MxCadUppyUploader.tsx:42` — 存在 `escapeHtml()` 函数，对 `& < > " '` 五个字符进行了转义
- `src/hooks/file-system/useFileSystemNavigation.ts:29-39` — `sanitizeFileName()` 函数过滤了路径穿越字符和非法字符
- `src/utils/fileUtils.ts:214` — 存在另一个 `sanitizeFileName()` 实现
- **未发现** `eval()`、`new Function()`、`setTimeout(string)`、`document.write()` 等高危 API 的使用

---

## 2. 敏感信息暴露

### 2.1 【严重】accessToken + refreshToken 明文存储在 localStorage

**文件**: 
- `src/contexts/AuthContext.tsx`: 172-174, 210-212, 260-262, 285-287, 309-311, 389-391
- `src/utils/tokenUtils.ts`: 6-7, 16-17, 26-27, 30-31
- `src/config/clientSetup.ts`: 110, 128-130
- `src/services/mxcadManager/index.ts`: 2116, 2174, 2310, 2382
**严重程度**: 🔴 严重

**问题描述**:
JWT access token 和 refresh token 直接以明文形式存储在 `localStorage` 中。`localStorage` 对所有同源 JavaScript 开放读取权限，如果存在 XSS 漏洞，攻击者可直接窃取 token。此外，持久化存储使 token 在浏览器关闭后仍然可用，增加了 token 泄露后的风险窗口。

**修复建议**:
1. **短期方案**: 将 accessToken 存储在 `sessionStorage`（会话级别，关闭标签页即失效）
2. **中期方案**: 使用 `httpOnly` + `Secure` cookie 存储 token，前端代码无法通过 JavaScript 读取
3. **长期方案**: 实现 BFF（Backend For Frontend）模式，前端完全不接触 token
4. 至少为 refreshToken 使用 `httpOnly` cookie

**是否需要用户确认**: 是（涉及认证架构变更，需要后端配合）

---

### 2.2 【严重】用户对象（含角色/权限信息）存储在 localStorage

**文件**: 
- `src/contexts/AuthContext.tsx`: 111, 174, 212, 262, 287, 311, 369, 391
- `src/utils/authCheck.ts`: 29, 42, 57
- `src/services/mxcadManager/index.ts`: 1423, 2117
**严重程度**: 🔴 严重

**问题描述**:
完整的用户对象（可能包含用户名、邮箱、角色、权限数组等）通过 `JSON.stringify()` 存储在 `localStorage.setItem('user', JSON.stringify(userData))`。攻击者通过 XSS 可获取用户的完整身份信息和权限结构。

**修复建议**:
1. 仅在内存（Zustand store / React context）中维护用户信息
2. 如必须持久化，仅缓存用户 ID 和显示名称，不要缓存权限信息
3. 权限检查应始终从后端 API 获取最新数据

**是否需要用户确认**: 是

---

### 2.3 【严重】GEMINI_API_KEY 通过 Vite define 编译进前端 Bundle ✅ 已修复 (1471a79e)

**文件**: `vite.config.ts`  
**行号**: 83-84  
**严重程度**: 🔴 严重

**修复状态**: ✅ 已修复 — commit `1471a79e`: remove GEMINI_API_KEY hardcoded in frontend bundle (P0 security)

**问题描述**:
```typescript
// vite.config.ts:83-84
define: {
  'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
  'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
},
```

`GEMINI_API_KEY` 通过 Vite 的 `define` 配置被编译进前端 JavaScript 打包产物中。任何用户通过浏览器开发者工具查看打包后的 JS 文件即可直接获取该 API Key，这相当于将 API 密钥公开暴露给所有用户。

**修复建议**:
1. **立即移除** `define` 中的 `GEMINI_API_KEY` 和 `API_KEY`
2. 所有涉及外部 API 的调用应通过后端代理，API Key 仅存储在后端环境变量中
3. 如必须前端调用 Google Gemini API，使用短期令牌机制：前端向后端请求一次性令牌，后端用 API Key 签名后返回

**是否需要用户确认**: 否（这是明确的安全漏洞，必须修复）

---

### 2.4 【中】wechatTempToken 使用 sessionStorage

**文件**: 
- `src/utils/tokenUtils.ts`: 40, 44, 48
- `src/contexts/AuthContext.tsx`: 395, 398, 401
**严重程度**: 🟡 中等

**问题描述**:
微信登录的临时 token 存储在 `sessionStorage`，虽然是会话级别存储，但仍然对 JavaScript 开放读取。任何 XSS 攻击可窃取此临时 token。

**修复建议**:
微信临时 token 建议使用 `sessionStorage` 存储仅作为窗口间通信的桥接（如 AuthContext.tsx:376 "监听弹窗通过 localStorage 传递的登录结果"），收到后应立即从 `sessionStorage` 移除。当前代码在读取后未及时清理。

**是否需要用户确认**: 否

---

### 2.5 【低】默认 API 地址硬编码

**文件**: `src/config/apiConfig.ts`  
**行号**: 40  
**严重程度**: 🟢 低

**问题描述**:
`return 'http://localhost:3001/api'` 作为 API 地址的 fallback 值硬编码。虽然这是本地开发地址，但如果在生产环境中错误加载此默认值，所有 API 请求将发往 localhost。

**修复建议**:
将 fallback 改为更明确的错误处理，或使用相对路径 `/api` 作为默认值（与 `constants/appConfig.ts:63` 保持一致）。

**是否需要用户确认**: 否

---

## 3. CSP / 安全头配置

### 3.1 【严重】index.html 缺少 Content-Security-Policy ✅ 已修复 (fd4d5de0)

**文件**: `packages/frontend/index.html`  
**行号**: 整个文件  
**严重程度**: 🔴 严重

**修复状态**: ✅ 已修复 — commit `fd4d5de0`: 添加 index.html CSP meta 标签（P1 安全加固）

**问题描述**:
`index.html` 中没有设置 Content-Security-Policy（CSP）meta 标签，也没有设置其他安全相关的响应头。缺少 CSP 意味着：
- 没有限制脚本来源
- 没有限制内联脚本执行
- 没有限制样式来源
- XSS 漏洞一旦存在，攻击者可自由执行任意 JavaScript

此外，`<script type="importmap">` 引用了外部 CDN（`aistudiocdn.com`），如果没有 CSP 限制，攻击者可通过中间人攻击或 CDN 被入侵来注入恶意代码。

**修复建议**:
1. 添加 CSP meta 标签：
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' https://aistudiocdn.com;
               style-src 'self' 'unsafe-inline';
               img-src 'self' data: blob:;
               connect-src 'self' http://localhost:*;" />
```
2. 或通过后端响应头配置（推荐，因为后端可统一管理）
3. 同时建议添加 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY` 等安全头

**是否需要用户确认**: 是（CSP 策略需根据实际业务需求定制，配置过严可能影响功能）

---

### 3.2 【中】Import Map 使用第三方 CDN — 供应链风险 ✅ 已修复 (8103f90b)

**文件**: `packages/frontend/index.html`  
**行号**: 26-37  
**严重程度**: 🟡 中等

**修复状态**: ✅ 已修复 — commit `8103f90b`: remove CDN importmap

**问题描述**:
`<script type="importmap">` 将 `react`、`react-dom`、`lucide-react`、`react-router-dom`、`recharts` 等核心依赖映射到 `https://aistudiocdn.com/` 外部 CDN。这意味着：
1. 如果 CDN 被入侵或劫持，攻击者可在所有用户页面执行恶意代码
2. 如果 CDN 服务中断，整个应用将不可用
3. `aistudiocdn.com` 并非官方 CDN（如 unpkg / jsdelivr / esm.sh），可信度需评估

**修复建议**:
1. 将依赖打包到本地 bundle 中（当前 Vite 配置已有 vendor chunk 分割）
2. 如必须使用 CDN，添加 Subresource Integrity (SRI) 哈希：
```html
<script src="https://cdn.example.com/react@19.2.1/index.js" 
        integrity="sha384-..." 
        crossorigin="anonymous"></script>
```
3. 但 importmap 不支持 SRI，建议评估是否可完全移除 importmap

**是否需要用户确认**: 是

---

## 4. 跨域请求 / CSRF

### 4.1 【中】CSRF Token 实现不规范

**文件**: `src/config/clientSetup.ts`  
**行号**: 42, 169  
**严重程度**: 🟡 中等

**问题描述**:
```typescript
request.headers.set('X-CSRF-Token', token);
```
当前使用 JWT access token 作为 `X-CSRF-Token` 请求头。这不是标准的 CSRF 防护机制——CSRF token 应该是随机生成的一次性令牌，而非认证 token 的复用。如果 API 端不做 CSRF 验证，该头字段形同虚设。

**修复建议**:
1. 后端需实现真正的 CSRF token 机制（如双重提交 Cookie 模式）
2. 或确认后端已使用 `SameSite=Strict` Cookie + `Origin`/`Referer` 头校验来防护 CSRF
3. 如后端完全不使用 Cookie 认证（仅使用 `Authorization: Bearer` 头），则无需 CSRF 防护，可移除此头字段

**是否需要用户确认**: 是（需要确认后端的 CSRF 防护策略）

---

### 4.2 【低】window.open 未使用 noopener

**文件**: 
- `src/contexts/AuthContext.tsx`: 436
- 其他多处 `window.open(..., '_blank')`  
**严重程度**: 🟢 低

**问题描述**:
`window.open()` 打开的新窗口默认可通过 `window.opener` 访问父窗口对象（Tabnabbing 攻击）。虽然 React Router 的内部页面跳转不受影响，但 AuthContext 中的微信授权弹窗属于外部页面。

**修复建议**:
```javascript
const newWindow = window.open(authUrl, 'wechat-auth', '...');
if (newWindow) newWindow.opener = null;
```

**是否需要用户确认**: 否

---

## 5. 依赖库安全审计

### 5.1 依赖版本概览

审查对象：`packages/frontend/package.json`

| 依赖 | 版本 | 评估 |
|------|------|------|
| react / react-dom | 19.2.1 | ✅ 最新稳定版 |
| react-router-dom | 7.10.1 | ✅ 较新 |
| axios | 1.13.2 | ✅ 较新 |
| vite | 6.2.0 | ✅ 较新 |
| typescript | 5.9.3 | ✅ 最新 |
| zustand | 5.0.10 | ✅ 较新 |
| @radix-ui/* | 各版本 | ✅ 维护活跃 |
| eslint | 8.57.0 | ⚠️ 旧版本（ESLint 9 已发布） |
| @typescript-eslint/* | 7.0.0 | ⚠️ 可升级到 8.x |
| mxcad-app | ^1.0.63 | ⚠️ 内部包，需确认最小版本策略 |
| spark-md5 | 3.0.2 | ✅ 纯 JS 无安全风险 |
| webuploader | 0.1.8 | ⚠️ 较老版本，需关注 |

### 5.2 【中】未发现 XSS 防护专用依赖

**严重程度**: 🟡 中等

**问题描述**:
项目未安装 `dompurify`、`sanitize-html`、`xss` 等 HTML 清洗库。结合第 1 节发现的 `innerHTML` 使用，缺少专业的 XSS 防护工具。

**修复建议**:
```bash
pnpm add dompurify
pnpm add -D @types/dompurify
```

**是否需要用户确认**: 否

---

## 6. 其他安全问题

### 6.1 【低】console.log 输出敏感调试信息

**文件**: 
- `src/contexts/AuthContext.tsx`: 149, 155, 179, 214, 442
- `src/services/mxcadManager/index.ts`: 2106, 2139
**严重程度**: 🟢 低

**问题描述**:
`console.log` 输出包含 token 存储确认信息（"Token 已存储到 localStorage"）、登录账号等敏感信息。生产环境中这些日志可能泄露信息。

**修复建议**:
使用条件日志（仅 `import.meta.env.DEV` 时输出），或使用专门的 logger 模块在生产环境禁用调试日志。

**是否需要用户确认**: 否

---

### 6.2 【低】window.opener 跨窗口引用

**文件**: `src/services/mxcadManager/index.ts`  
**行号**: 526  
**严重程度**: 🟢 低

**问题描述**:
`if (currentFileInfo?.fromPlatform && window.opener)` 检查了 `window.opener`，但这意味着父窗口和新窗口之间有引用关系。如果父窗口被导航到恶意页面，新窗口的 `window.opener` 可能会被污染。

**修复建议**:
如果不需要双向通信，打开窗口后设置 `win.opener = null`。

**是否需要用户确认**: 否

---

## 7. 正面发现汇总

以下安全实践值得肯定：

1. ✅ **未发现 `eval()` / `new Function()`**: 全代码库未使用字符串执行
2. ✅ **未发现 `document.write()`**: 全代码库未使用此高危 API
3. ✅ **sanitizeFileName 过滤**: 多处文件名校验，防止路径穿越
4. ✅ **escapeHtml 函数**: `MxCadUppyUploader.tsx` 有 HTML 转义实现
5. ✅ **Token 刷新机制**: `clientSetup.ts` 有 401 拦截 + 静默刷新逻辑
6. ✅ **退出登录清理**: `clearAuthAndRedirect()` 正确清理所有存储
7. ✅ **Vite 代理屏蔽**: 开发环境通过 proxy 配置，前端不直连后端端口
8. ✅ **TypeScript strict**: 使用 TypeScript 严格模式，减少类型相关的注入风险

---

## 8. 总结

### 按严重程度统计

| 严重程度 | 数量 | 说明 |
|----------|------|------|
| 🔴 严重 | 7 | innerHTML XSS (3) + localStorage 明文 token (2) + GEMINI_API_KEY 泄漏 (1) + 缺少 CSP (1) |
| 🟡 中等 | 6 | 内联事件处理器、sessionStorage token、importmap CDN 风险、CSRF Token 不规范、缺少 DOMPurify、wechatTempToken |
| 🟢 低 | 4 | 默认 localhost API、console.log 敏感信息、window.opener、window.open noopener |

**总计: 17 个问题**

### 优先级修复建议

| 优先级 | 问题 | 影响 |
|--------|------|------|
| P0 — 立即修复 | GEMINI_API_KEY 泄漏（vite.config.ts:83-84） | API Key 公开暴露，可能导致滥用和账单攻击 |
| P0 — 立即修复 | 添加 Content-Security-Policy | 当前无任何 XSS 缓解机制，一旦出现 XSS 漏洞影响极大 |
| P1 — 本周内 | innerHTML 中 filename 未转义（mxcadCheck.ts:141） | 可通过文件名触发存储型 XSS |
| P1 — 本周内 | accessToken/refreshToken 改用 httpOnly Cookie | Token 暴露在 localStorage 中，XSS 可直接窃取 |
| P2 — 本月内 | mxcadManager 三个 innerHTML 对话框迁移为 React 组件 | 消除内联事件处理器，提升可维护性 |
| P2 — 本月内 | 用户对象存储优化 | 减少 localStorage 中的敏感数据暴露面 |
| P3 — 迭代改进 | 安装 DOMPurify、升级 ESLint、CDN SRI 等 | 加固防线 |

### 是否需要用户确认汇总

- **无需确认**: 8 个问题（低风险、正面改进）
- **需要确认**: 6 个问题（涉及架构变更、后端配合或 CAD 引擎兼容性）
- **立即修复（无需确认）**: GEMINI_API_KEY 泄漏、缺少 DOMPurify、console.log 清理
