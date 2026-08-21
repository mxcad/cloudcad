# 桌面端 EXE → Web 登录交接协议

本文档面向 C++/C# 桌面客户端开发人员，说明桌面端如何通过**系统浏览器完成登录**并**接收 Token 回调**。

---

## 概述

桌面客户端不内置 WebView 登录页，而是通过**系统浏览器**打开 CloudCAD Web 登录页面，用户在浏览器完成认证后，浏览器通过 **HTTP 重定向**将 JWT Token 传回桌面端本地启动的 HTTP 服务。

```
┌──────────────┐    ① 打开系统浏览器      ┌──────────────────┐
│  C++ EXE     │ ───────────────────────→  │  系统浏览器       │
│  (本地 HTTP   │                          │  cloudcad.com/logo│
│   服务 :PORT) │                          │  ?redirect_uri=   │
│              │                          │  http://127.0.0.1:│
│              │                          │  PORT/callback    │
│              │                          │  &state=xxx       │
│              │                          │                   │
│              │                          │  ② 用户登录       │
│              │                          │  (账号/手机/微信)  │
│              │                          │         │         │
│              │                          │         ▼         │
│              │                          │  ③ 认证成功       │
│              │                          │         │         │
│              │  ←── ④ 重定向 ──────────  │         │         │
│              │  http://127.0.0.1:PORT/   │         │         │
│              │  callback?access_token=   │         │         │
│              │  xxx&refresh_token=xxx    │         │         │
│              │  &state=xxx               │         │         │
│              │                          │                   │
│              │  ⑤ 解析 URL 参数          │                   │
│              │  提取 Token → 保存         │                   │
│              │  关闭 HTTP 服务            │                   │
│              │  进入主界面                │                   │
└──────────────┘                          └──────────────────┘
```

---

## 第一步：EXE 启动本地 HTTP 服务

**时机**：用户点击「登录」按钮时。

桌面端需要在 `127.0.0.1` 上启动一个**临时 HTTP 服务**，监听一个**随机可用端口**，用于接收登录后的 Token 回调。

### 要求

| 项目 | 说明 |
|------|------|
| 绑定地址 | `127.0.0.1`（仅本地回环，禁止 `0.0.0.0`） |
| 端口 | 随机可用端口（如 54321），避免冲突 |
| 协议 | HTTP（无需 HTTPS，仅本地通信） |
| 路径 | 任意路径均可，推荐 `/callback` |
| 生命周期 | 登录流程结束后关闭 |

### 示例（C++ 伪代码）

```cpp
// 1. 启动本地 HTTP 服务监听随机端口
int port = startLocalHttpServer("127.0.0.1", 0); // 0 = 系统分配端口
// 实际得到 port = 54321

// 路由: GET /callback
// 处理函数: 解析 URL query 中的 access_token / refresh_token
```

**C++ HTTP 服务建议库**：
- Windows: `httplib` (cpp-httplib) / WinHTTP 自定义

---

## 第二步：构造登录 URL 并打开浏览器

**时机**：HTTP 服务就绪后。

EXE 构造以下 URL 并用系统浏览器打开：

```
https://cloudcad.com/logo?redirect_uri=http://127.0.0.1:54321/callback&state=abc123
```

### URL 参数

| 参数 | 必填 | 值 | 说明 |
|------|------|-----|------|
| `redirect_uri` | 是 | `http://127.0.0.1:{PORT}/callback` | 登录成功后浏览器重定向地址。**hostname 必须为 `127.0.0.1` 或 `localhost`** |
| `state` | 否 | 任意字符串 | CSRF 防护。回调时会原样返回，EXE 可验证与发送时一致 |

### 在各平台打开系统浏览器

| 平台 | 方法 |
|------|------|
| Windows | `ShellExecute(NULL, "open", url, NULL, NULL, SW_SHOWNORMAL)` |
| macOS | `[[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:url]]` |
| Linux | `xdg-open <url>` |

---

## 第三步：等待回调

### 3.1 EXE 端等待

本地 HTTP 服务等待浏览器重定向请求。请求到达时：

**请求示例**：
```
GET /callback?access_token=eyJhbGciOiJIUzI1NiIs...&refresh_token=eyJhbGciOiJIUzI1NiIs...&state=abc123 HTTP/1.1
Host: 127.0.0.1:54321
```

### 3.2 Web 端处理流程

浏览器端的 Login 组件内部执行以下逻辑：

1. 解析 URL 中 `redirect_uri` → 验证 hostname → 存入 sessionStorage
2. 用户完成登录（账号密码/手机验证码/微信扫码）
3. 认证成功后，检测到 `desktop_redirect_uri` 存在
4. **双重 Token 验证**（防止无效 Token 传回 EXE）：
   - 本地 JWT 过期检测
   - 服务端 `GET /api/v1/auth/profile` 验证 Token 真实有效
5. 验证通过后，浏览器执行 `window.location.href = redirectUrl`：
   ```
   http://127.0.0.1:54321/callback?access_token=xxx&refresh_token=yyy&state=abc123
   ```

### 3.3 安全机制

| 机制 | 说明 |
|------|------|
| hostname 白名单 | 只允许 `127.0.0.1` / `localhost`，防止回调劫持 |
| 本地 JWT 过期检查 | 避免已过期的 Token 被传给 EXE |
| 服务端 `/auth/profile` 验证 | 即使 JWT 本地未过期，也可能已在服务端登出 |
| 网络异常保护 | 网络失败时不删除 `desktop_redirect_uri`，防止 Token 丢失 |

---

## 第四步：提取 Token

EXE 本地 HTTP 服务收到回调请求后，从 URL query 中提取参数：

| 参数 | 说明 | 处理 |
|------|------|------|
| `access_token` | JWT Access Token（有效期 1 小时） | 保存到系统凭据管理器，用于后续 API 请求的 Authorization 头 |
| `refresh_token` | Refresh Token（有效期 7 天） | 保存到系统凭据管理器，用于 Token 刷新 |
| `state` | CSRF state 值（如有） | 验证与发送时一致 |

**C++ 处理**：
```cpp
// 伪代码
string accessToken = req.get_param("access_token");
string refreshToken = req.get_param("refresh_token");
string state = req.get_param("state");

if (state != expected_state) {
    // 拒绝，CSRF 不匹配
    return;
}

// 保存到 Windows Credential Manager
CredWriteW(accessToken, ...);
CredWriteW(refreshToken, ...);

// 回复浏览器 200 并显示「登录成功，请关闭此页面」
res.set_status(200);
res.set_body("<html><body><h1>登录成功，请关闭此页面</h1></body></html>");

// 关闭 HTTP 服务
stopLocalHttpServer();

// 进入主界面
ShowMainWindow();
```

**HTTP 响应**：返回 HTTP 200 和一个简单的 HTML 页面提示用户关闭。

---

## Token 使用

### API 请求认证

所有业务 API 请求必须在 HTTP Header 中携带：
```
Authorization: Bearer <accessToken>
```

### Token 刷新

- Access Token 有效期 **1 小时**
- 建议在过期前 **5 分钟**主动刷新
- 刷新接口：`POST /api/v1/auth/refresh`

```json
// Request
{ "refreshToken": "eyJ..." }

// Response 200
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { ... },
  "tokenType": "Bearer"
}
```

刷新失败（401）→ 清除本地凭据 → 显示登录界面。

---

## 完整流程图

```
用户点击「登录」
    │
    ▼
EXE 启动本地 HTTP 服务 (127.0.0.1:随机端口)
    │
    ▼
EXE 打开系统浏览器:
https://cloudcad.com/logo?redirect_uri=http://127.0.0.1:54321/callback&state=abc
    │
    ▼
用户在 Web 上完成登录 (账号/手机/微信)
    │
    ▼
Web 双重验证 Token 有效性
    ├── 无效 → 等待重新登录
    └── 有效 → window.location.href = 
                 http://127.0.0.1:54321/callback
                   ?access_token=xxx
                   &refresh_token=yyy
                   &state=abc
    │
    ▼
EXE 本地 HTTP 服务收到回调
    │
    ├── state 不匹配 → 拒绝
    │
    ▼
提取 access_token + refresh_token
    │
    ▼
保存到系统凭据管理器
    │
    ▼
关闭 HTTP 服务
    │
    ▼
进入主界面
```

---

## 附录：REST API 完整端点参考

详见 `desktop-client-login-api.md`：

| 端点 | 用途 |
|------|------|
| `POST /api/v1/auth/login` | 账号密码登录 |
| `POST /api/v1/auth/login-phone` | 手机验证码登录 |
| `POST /api/v1/auth/send-sms-code` | 发送验证码 |
| `POST /api/v1/auth/refresh` | Token 刷新 |
| `POST /api/v1/auth/logout` | 登出 |
| `GET /api/v1/auth/profile` | 获取当前用户信息 |
| `GET /api/v1/auth/wechat/login?client=desktop` | 微信扫码登录（事务轮询模式） |
| `GET /api/v1/auth/wechat/poll-transaction` | 轮询微信扫码结果 |
