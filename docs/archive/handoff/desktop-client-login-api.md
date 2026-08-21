# CloudCAD 桌面客户端 — 登录 API 使用文档

本文档面向 C++ 桌面端开发人员，说明如何接入 CloudCAD 后端登录认证系统。

---

## 基础信息

- **Base URL**: `https://api.cloudcad.com`（生产）/ `http://localhost:3001`（开发）
- **所有 `/auth/*` 端点前缀**: `/api/v1/auth`
- **认证方式**: JWT Bearer Token（除登录/注册/公开端点外，所有请求需在 Header 携带 `Authorization: Bearer <accessToken>`）
- **Token 存储**: Access Token 有效期 1 小时，Refresh Token 有效期 7 天。C++ 端需持久化存储

---

## 一、账号密码登录

### 1.1 登录

**C++ 调用时机**: 用户在登录界面输入账号密码后点击「登录」。

```
POST /api/v1/auth/login
Content-Type: application/json

{
  "account": "user@example.com",   // 邮箱 / 用户名 / 手机号（三选一）
  "password": "Password123!"
}
```

**成功响应 (200)**:

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "username",
    "phone": "138xxxx1234",
    "nickname": "昵称",
    "avatar": "https://...",
    "role": { "id": "role-uuid", "name": "USER" },
    "phoneVerified": true,
    "wechatBound": false
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "tokenType": "Bearer"
}
```

**C++ 处理**:
- 解析 `accessToken` → 存入系统凭据管理器（Windows Credential / macOS Keychain）
- 解析 `refreshToken` → 同上
- 解析 `user` → 内存缓存当前用户信息
- 后续所有请求 Header: `Authorization: Bearer <accessToken>`

**错误响应**:
- `401` — 账号或密码错误（`message` 字段含原因）
- `400` — 参数格式错误

---

### 1.2 Token 刷新

**C++ 调用时机**: 收到 API 返回 `401` 时；或定时在 Token 即将过期时主动刷新。

```
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**成功响应 (200)**:

```json
{
  "user": { "..." },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",   // 新 Token（有效期重置为 1 小时）
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",   // 新 Refresh Token（双 token 同时刷新）
  "tokenType": "Bearer"
}
```

**C++ 处理**:
- 用新的 `accessToken` 替换旧的（更新内存和系统凭据）
- 用新的 `refreshToken` 替换旧的
- 使用新 Token 重试之前失败的请求

**错误响应**:
- `401` — Refresh Token 无效或已过期 → 需用户重新登录

---

### 1.3 登出

**C++ 调用时机**: 用户点击「退出登录」或清除本地凭据时。

```
POST /api/v1/auth/logout
Authorization: Bearer <accessToken>
```

**成功响应 (200)**:

```json
{ "message": "登出成功" }
```

**C++ 处理**:
- 无论后端是否成功，都应清除本地存储的 Token
- 清除内存中的用户信息
- 显示登录界面

---

## 二、手机号验证码登录

### 2.1 发送验证码

**C++ 调用时机**: 用户在登录界面输入手机号后点击「获取验证码」。

```
POST /api/v1/auth/send-sms-code
Content-Type: application/json

{
  "phone": "138xxxx1234"
}
```

**成功响应 (200)**:

```json
{ "success": true, "message": "验证码已发送" }
```

**C++ 处理**:
- 显示倒计时（60 秒后可重发）
- 弹出验证码输入框

**错误响应**:
- `400` — 手机号格式错误 / 发送过于频繁

**限制规则**:
- 同一手机号 60 秒内只能发送一次
- 每手机号每天最多 10 次
- 每 IP 每小时最多 20 次

---

### 2.2 手机号验证码登录

**C++ 调用时机**: 用户输入验证码后点击「登录」。

```
POST /api/v1/auth/login-phone
Content-Type: application/json

{
  "phone": "138xxxx1234",
  "code": "123456"
}
```

**成功响应 (200)**:
```json
{
  "user": { "..." },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "tokenType": "Bearer"
}
```
→ 处理同 [1.1](#11-登录)

**错误响应**:
- `400` — 验证码错误 / 手机号格式错误
- `412` — 手机号未注册，如需注册请引导用户跳转 Web 注册页（见 [附录 B](#附录-b-需要引导到-web-页面的场景)）

---

## 三、微信扫码登录（事务轮询方式）

桌面端微信登录使用 **事务轮询** 模式，不使用 HTTP 弹窗/重定向。流程：创建事务 → 展示二维码 → 用户扫码 → 轮询获取结果。

### 3.1 创建登录事务 & 获取授权 URL

**C++ 调用时机**: 用户点击「微信登录」时。

```
GET /api/v1/auth/wechat/login?client=desktop&isPopup=false&purpose=login&origin=https://cloudcad.com&txn=
```

**Query 参数**:

| 参数 | 值 | 说明 |
|------|-----|------|
| `client` | `desktop` | 标识桌面端 |
| `isPopup` | `false` | 桌面端不使用弹窗 |
| `purpose` | `login` | 登录用途（固定值） |
| `origin` | 登录页 URL | 无需修改 |
| `txn` | 空字符串 | 后端自动创建事务 |

**成功响应 (200)**:

```json
{
  "authUrl": "https://open.weixin.qq.com/connect/qrconnect?appid=wx...&redirect_uri=https%3A%2F%2Fapi.cloudcad.com%2Fapi%2Fv1%2Fauth%2Fwechat%2Fcallback%3Ftxn%3Dtxn_abc123&response_type=code&scope=snsapi_login&state=eyJjc3JmIjoiLi4ufQ%3D%3D#wechat_redirect",
  "state": "eyJjc3JmIjoiLi4ufQ==",
  "transactionId": "txn_a1b2c3d4e5f678901234567890"
}
```

**C++ 处理**:
1. 解析 `authUrl`（微信授权 URL）
2. 使用 libqrencode 将 `authUrl` 编码为二维码图片
3. 在对话框/面板中显示二维码
4. 解析 `transactionId`（后续轮询用）
5. 启动定时器，开始轮询（见 3.2）

---

### 3.2 轮询登录结果

**C++ 调用时机**: 展示二维码后，每 2 秒轮询一次。

```
GET /api/v1/auth/wechat/poll-transaction?txn=txn_a1b2c3d4e5f678901234567890
```

**响应 A — 等待扫码 (200)**:

```json
{ "status": "pending" }
```
**C++ 处理**: 继续轮询，更新倒计时 UI。

**响应 B — 登录成功 (200)**:

```json
{
  "status": "completed",
  "action": "login",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "username",
    "nickname": "昵称",
    ...
  },
  "error": null,
  "tempToken": null
}
```

**C++ 处理**:
- 保存 `accessToken` + `refreshToken` 到系统凭据管理器
- 缓存 `user` 信息
- 关闭二维码对话框
- 进入主界面

**响应 C — 需要注册/绑定 (200)**:

```json
{
  "status": "completed",
  "action": "need_register",       // 或 "bind_email" / "bind_phone"
  "accessToken": null,
  "refreshToken": null,
  "user": null,
  "error": null,
  "tempToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**C++ 处理**: 见 [附录 B](#附录-b-需要引导到-web-页面的场景)。桌面端无法展示注册表单，应通过系统浏览器打开 Web 登录页完成。

**响应 D — 过期 (200)**:

```json
{ "status": "expired" }
```

**C++ 处理**:
- 停止轮询
- 提示用户「二维码已过期，请刷新」
- 用户点击刷新时，重新执行 3.1 获取新的二维码

**响应 E — 限流 (200)**:

```json
{ "status": "rate_limited" }
```

**C++ 处理**:
- 暂停轮询 2 秒
- 恢复后继续（限制：同一 IP 每秒最多 3 次）

**响应 F — 登录失败 (200)**:

```json
{
  "status": "completed",
  "action": "error",
  "error": "微信授权失败：用户拒绝"
}
```

**C++ 处理**:
- 停止轮询
- 在对话框中显示 `error` 信息
- 提供「重试」按钮

---

## 四、用户信息获取

### 4.1 获取当前用户信息

**C++ 调用时机**: 应用启动时（本地已有 Token）或 Token 刷新后验证。

```
GET /api/v1/auth/profile
Authorization: Bearer <accessToken>
```

**成功响应 (200)**:
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "username": "username",
  "nickname": "昵称",
  "avatar": "https://...",
  "phone": "138xxxx1234",
  "phoneVerified": true,
  "role": { "id": "role-uuid", "name": "USER" },
  "wechatBound": true
}
```

**C++ 处理**:
- 返回 200 → Token 有效，刷新用户信息显示
- 返回 401 → Token 无效，尝试 Refresh（见 1.2）；Refresh 失败则显示登录界面

---

## 五、桌面端完整流程图

### 5.1 应用启动 → Token 验证

```
应用启动
  │
  ├── 本地有 accessToken？
  │     ├── 是 → GET /auth/profile
  │     │         ├── 200 → 进入主界面（Token 有效）
  │     │         └── 401 → 尝试 refreshToken
  │     │                   ├── 200 → 更新本地 Token → 进入主界面
  │     │                   └── 401 → 清除本地凭据 → 显示登录界面
  │     └── 否 → 显示登录界面
  │
  └── Token 将在 55 分钟后主动刷新（在过期前 5 分钟）
```

### 5.2 账号密码登录

```
用户输入账号密码 → POST /auth/login
                     ├── 200 → 保存 Token → 进入主界面
                     └── 401 → 显示错误消息
```

### 5.3 手机号登录

```
用户输入手机号 → POST /auth/send-sms-code → 显示倒计时
用户输入验证码 → POST /auth/login-phone
                     ├── 200 → 保存 Token → 进入主界面
                     ├── 401 → 显示验证码错误
                     └── 412 → 手机号未注册 → 引导到 Web 注册页（附录 B）
```

### 5.4 微信扫码登录

```
用户点击「微信登录」
  │
  ├── GET /auth/wechat/login?client=desktop → 获得 authUrl + transactionId
  │     │
  │     ▼
  │   用 libqrencode 将 authUrl 生成二维码 → 显示在对话框
  │     │
  │     ▼
  │   每 2 秒 GET /auth/wechat/poll-transaction?txn=xxx
  │     │
  │     ├── pending → 继续轮询
  │     ├── expired → 提示用户刷新二维码 → 重新调用 3.1
  │     ├── completed + action=login → 保存 Token → 进入主界面
  │     ├── completed + action=need_register/bind_email/bind_phone
  │     │     → 获取登录 URL → 系统浏览器打开让用户完成（附录 B）
  │     ├── completed + action=error → 显示错误消息
  │     └── rate_limited → 暂停 2 秒后继续
  │
  └── 用户关闭对话框 → 停止轮询
```

---

## 附录 A：HTTP Client 建议

- Windows: WinHTTP / libcurl
- macOS: NSURLSession / libcurl
- Linux: libcurl
- 需要处理 HTTPS（证书校验）
- 全局 Header: `Accept-Language: zh-CN`（或 `en`）

## 附录 B：需要引导到 Web 页面的场景

桌面端无法展示 Web 注册/绑定表单，当以下场景发生时，需通过系统浏览器打开对应 URL：

| 触发条件 | URL | 说明 |
|----------|-----|------|
| 手机登录未注册 | `https://cloudcad.com/login` | 用户注册后返回重新扫码 |
| 微信登录 action=need_register | `https://cloudcad.com/login` | 同上 |
| 微信登录 action=bind_email | `https://cloudcad.com/login` | 绑定完成后再扫码登录 |
| 微信登录 action=bind_phone | `https://cloudcad.com/login` | 同上 |

**打开系统浏览器方式**:
- Windows: `ShellExecute(NULL, "open", url, NULL, NULL, SW_SHOWNORMAL)`
- macOS: `[[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:url]]`
- Linux: `xdg-open <url>`

## 附录 C：错误码速查

| HTTP 状态 | 场景 | C++ 处理 |
|-----------|------|----------|
| `200` | 成功 | 正常解析响应 |
| `400` | 参数错误 / 验证码错误 | 显示 `message` 给用户 |
| `401` | Token 无效 / 密码错误 | 尝试 Refresh → 失败则重新登录 |
| `403` | 权限不足 | 提示无权限 |
| `412` | 手机号未注册 | 引导到 Web 页面 |
| `429` | 请求过于频繁 | 等待后重试 |
| `500` | 服务端错误 | 提示用户稍后重试 |

## 附录 D：Token 定时刷新策略

- Access Token 有效期 1 小时（JWT `exp` 字段）
- 建议在过期前 **5 分钟** 主动刷新
- 实现方式：解析 JWT payload 获得 `exp` 时间戳 → 设置定时器 → 到期前调用 `/auth/refresh`
- 无需解析 JWT 的严格时间：可每 **55 分钟** 固定刷新一次
