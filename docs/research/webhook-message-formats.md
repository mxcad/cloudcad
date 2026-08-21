# 通用 Webhook 入站消息格式调研（钉钉 / 企业微信 / 飞书 / Slack）

> 背景：CloudCAD 后端计划提供可选通用 Webhook 告警推送适配器（配置 `ALERT_WEBHOOK_URL` + body 模板后条件启用，不绑定具体 IM 平台）。本文调研四类主流 IM 平台自定义机器人/群机器人 webhook 的入站消息格式，供 body 模板设计决策使用。
>
> 调研日期：2026-08-10（各文档为官方当前在线版本，钉钉文档更新于 2025-06-24，企业微信文档更新于 2025-08-07）

## 1. 钉钉（DingTalk）自定义机器人

权威来源：
- 发送群消息（新版 API 文档）：https://open.dingtalk.com/document/orgapp/custom-robots-send-group-messages
- 消息类型与数据格式：https://open.dingtalk.com/document/orgapp/custom-bot-send-message-type （重定向至 https://open.dingtalk.com/document/development/robot-message-type）
- 安全设置（加签）：https://open.dingtalk.com/document/orgapp/customize-robot-security-settings

### 请求方式

- `POST https://oapi.dingtalk.com/robot/send?access_token=XXXXXX`
- 加签模式需在 URL query 追加 `timestamp` 与 `sign`：`https://oapi.dingtalk.com/robot/send?access_token=XXXXXX&timestamp=XXX&sign=XXX`
- `Content-Type: application/json`（官方 curl/HTTP 示例均为 JSON body）

### text 消息体

```json
{
  "msgtype": "text",
  "text": { "content": "这是一条文本消息内容" },
  "at": { "atMobiles": [], "atUserIds": [], "isAtAll": false }
}
```

### markdown 消息体

```json
{
  "msgtype": "markdown",
  "markdown": {
    "title": "Markdown消息标题",
    "text": "#### 这是Markdown消息内容 \n ![图片](https://example.com/image.png)"
  },
  "at": { "atUserIds": ["user123"], "isAtAll": false }
}
```

支持标题（1-6 级）、引用、加粗/斜体、链接、图片等 markdown 子集；`at.atMobiles`（手机号）与 `at.atUserIds`（userId）二选一，`isAtAll` 表示 @所有人。

### 签名要求（可选，安全设置三选一或组合）

1. **加签（sign）**：`stringToSign = timestamp + "\n" + secret` → `HmacSHA256(secret, stringToSign)` → Base64 → `urlEncode`（官方明确：**需要使用 UTF-8 字符集**）。`timestamp` 为毫秒级 Unix 时间戳，与调用时间误差不得超过 1 小时。签名值放 URL query。
2. **自定义关键词**：消息内容必须包含至少一个关键词，否则发送失败（错误码 19024）。
3. **IP 白名单（段）**：支持单 IP 与 CIDR（如 `1.1.1.0/24`），不支持 IPv6。

### 限制

- 频率：每机器人每分钟最多 20 条，超过 20 条限流 10 分钟。
- 官方建议大量告警场景用 markdown 摘要整合后再发送。
- 返回：`{ "errcode": 0, "errmsg": "ok" }`（errcode=0 成功）。
- 当前官方新版文档未在发送接口页写明 text 长度上限；经典旧版文档（社区广泛引用）曾规定 text `content` 最长约 5000 字符且须为 UTF-8 编码。实现时建议按 ≤5000 字符（含 UTF-8 中文按字节放宽）保守截断。

## 2. 企业微信（WeCom）群机器人 Webhook

权威来源：https://developer.work.weixin.qq.com/document/path/91770 （消息推送配置说明，更新于 2025-08-07）

### 请求方式

- `POST https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=<KEY>`
- `Content-Type: application/json`（官方 curl 示例显式声明）
- 官方强调：**content 必须是 UTF-8 编码**。

### text 消息体

```json
{
  "msgtype": "text",
  "text": {
    "content": "广州今日天气：29度，大部分多云",
    "mentioned_list": ["wangqing", "@all"],
    "mentioned_mobile_list": ["13800001111", "@all"]
  }
}
```

- `content`：最长 **2048 字节**（按字节计！中文 UTF-8 为 3 字节/字），必须 UTF-8。
- `mentioned_list`：userid 列表；`mentioned_mobile_list`：手机号列表；`"@all"` 表示 @所有人。

### markdown 消息体

```json
{
  "msgtype": "markdown",
  "markdown": {
    "content": "实时新增用户反馈<font color=\"warning\">132例</font>，请相关同事注意。\n>类型:<font color=\"comment\">用户反馈</font>"
  }
}
```

- `content`：最长 **4096 字节**，必须 UTF-8。
- markdown 子集：1-6 级标题（`#` 后须空格）、加粗、链接、行内代码、引用、3 种内置字体颜色 `<font color="info|comment|warning">`。
- 另有 `markdown_v2` 类型：支持表格/分割线/代码块/斜体，**不支持字体颜色与 @ 成员**，低版本客户端显示为纯文本（客户端 < 4.1.36）。

### 签名要求

**无签名机制**。安全性依赖 webhook key 保密（官方特别警告：勿把 webhook 地址公开到 GitHub/博客，否则会被滥发垃圾消息）。无自定义关键词、无 IP 白名单选项。

### 限制

- 频率：每个消息推送最多 **20 条/分钟**。
- 返回：`{ "errcode": 0, "errmsg": "ok" }`（errcode=0 成功）。

## 3. 飞书 / Lark 自定义机器人 Webhook

权威来源：
- 自定义机器人使用指南：https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot
- 自定义机器人发送消息的类型说明（英文文档）：https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot#supported-message-types（同一页）

### 请求方式

- `POST https://open.feishu.cn/open-apis/bot/v2/hook/<token>`
- `Content-Type: application/json`（官方 curl 示例显式声明）
- 请求体大小 **不能超过 20KB**。

### text 消息体

```json
{
  "msg_type": "text",
  "content": { "text": "request example" }
}
```

注意字段名为 `msg_type`（下划线），与钉钉/企微的 `msgtype` 不同；内容对象是 `content.text`。

### 富文本 post 消息体

```json
{
  "msg_type": "post",
  "content": {
    "post": {
      "zh_cn": {
        "title": "Project Update Notification",
        "content": [
          [{ "tag": "text", "text": "Item has been updated: " },
           { "tag": "a", "text": "Please check", "href": "http://www.example.com/" }]
        ]
      }
    }
  }
}
```

- `zh_cn` / `en_us` 语言配置至少一项；每个段落为 `[]` 节点数组，节点类型：`text`、`a`（超链接）、`at`（@人，user_id 填 open_id/user_id 或 `all`）、`img`（image_key）。

### 交互式消息卡片 interactive（可选）

```json
{
  "msg_type": "interactive",
  "card": { "schema": "2.0", "header": { "title": { "tag": "plain_text", "content": "..." }, "template": "blue" }, "body": { "elements": [{ "tag": "markdown", "content": "..." }] } }
}
```

卡片支持 `markdown` 元素（lark_md），自定义机器人仅支持 URL 跳转按钮、不支持 postback 交互。

### 签名要求（可选，三种安全设置之一或组合）

1. **签名验证（sign）**：`stringToSign = timestamp + "\n" + secret` → `HmacSHA256` → Base64。`timestamp` 为**秒级** Unix 时间戳，须在请求时刻前 1 小时（3600 秒）内。与钉钉不同，签名放在 **body 内**：
   ```json
   { "timestamp": "1599360473", "sign": "xxxx", "msg_type": "text", "content": { "text": "request example" } }
   ```
   验证失败返回 code 19021。
2. **自定义关键词**：消息中须包含至少一个关键词（仅匹配 `text`/`title` 等文本参数值，不匹配 href），失败返回 code 19024。
3. **IP 白名单**：支持单 IP 与 `123.12.1.*` / `123.1.1.1/24`，失败返回 code 19022。

### 限制

- 频率：单租户单机器人 **100 次/分钟、5 次/秒**；官方建议避免整点/半点发送（可能触发 11232 限流错误）。
- 请求体 ≤20KB。
- 返回：`{ "code": 0, "msg": "success", "data": {} }`（code=0 成功；格式错误 code 9499）。

## 4. Slack Incoming Webhook

权威来源：
- Incoming Webhooks 指南：https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks
- 请求签名验证（回调方向，非入站）：https://docs.slack.dev/authentication/verifying-requests-from-slack
- Block Kit 文档：https://api.slack.com/block-kit

### 请求方式

- `POST https://hooks.slack.com/services/<TEAM_ID>/<CHANNEL_ID>/<WEBHOOK_TOKEN>`（此格式仅为示例，禁止使用真实 webhook）
- `Content-type: application/json`（官方文档显式声明；body 为 JSON，Slack 侧按 UTF-8 解析）。
- webhook URL 本身即密钥（Slack 会主动扫描并吊销泄露到公开仓库的 URL）。

### 最简消息体（纯文本）

```json
{ "text": "Hello, world." }
```

顶层 `text` 字段即消息内容，支持 mrkdwn 格式化语法（`*bold*`、`<https://example.com|链接文本>` 等）。

### 高级消息体（text + blocks / attachments）

```json
{
  "text": "Danny Torrence left a 1 star review for your property.",
  "blocks": [
    { "type": "section", "text": { "type": "mrkdwn", "text": "..." } },
    { "type": "section", "block_id": "section567", "fields": [ { "type": "mrkdwn", "text": "*Average Rating*\n1.0" } ] }
  ]
}
```

- `attachments`：附加块数组，单条消息最多 100 个（超出报 `too_many_attachments`）。
- `blocks`：Block Kit 布局组件（section / divider / actions / context 等）。
- 不能覆盖默认 channel、用户名、头像（继承 app 配置）。

### 签名要求

- **入站（开发者 → Slack）方向无需签名验证**：Incoming Webhook 不要求 `X-Slack-Signature`，URL 令牌即认证。
- `X-Slack-Signature`（`v0=hmac_sha256(signing_secret, "v0:" + timestamp + ":" + raw_body)`，时间戳偏差限 5 分钟）是 **Slack → 开发者回调**方向（Events API / Slash Command）的验证机制，与本场景无关。

### 限制

- 无官方明文频率限制（有反滥用策略）；错误返回含明确 HTTP 状态码（400/403/404），成功返回 HTTP 200 + 纯文本 `ok`。
- 常见错误码：`invalid_payload`（JSON 结构错误或文本未正确转义）、`no_text`（缺 text 字段）、`action_prohibited`（管理员禁用）。

## 5. 结论归纳

### 5.1 四平台共性

| 维度 | 结论 |
|---|---|
| 传输方式 | 全部为 **HTTP POST**，请求体为 **JSON**，`Content-Type: application/json`（无一平台要求 `text/plain`） |
| 字符编码 | 全部按 **UTF-8** 处理 JSON body；企业微信明文要求 UTF-8 并按字节计数 |
| 消息结构 | 均为「**消息类型字段 + 内容对象**」：钉钉/企微 `msgtype`、飞书 `msg_type`、Slack 无类型字段（顶层 `text` 即内容） |
| 文本消息 | 四平台都有纯文本消息：钉钉 `text.content`、企微 `text.content`、飞书 `content.text`、Slack 顶层 `text` |
| 富文本/卡片 | 钉钉 `markdown.text`、企微 `markdown.content`、飞书 `post`（富文本）/ `interactive`（卡片）、Slack `blocks`（mrkdwn） |
| 成功响应 | 钉钉/企微 `errcode=0`；飞书 `code=0`；Slack HTTP 200 + `ok` |

### 5.2 四平台差异

| 维度 | 钉钉 | 企业微信 | 飞书 | Slack |
|---|---|---|---|---|
| 类型字段名 | `msgtype` | `msgtype` | `msg_type` | 无 |
| text 字段路径 | `text.content` | `text.content` | `content.text` | 顶层 `text` |
| markdown 字段 | `markdown.text`（含 title） | `markdown.content` | 无原生类型（用 post / card 内 lark_md） | 顶层 `text` 用 mrkdwn |
| 签名 | 可选加签，**URL query** 带 `timestamp`+`sign`（毫秒，1h 有效） | 无 | 可选加签，**body 内**带 `timestamp`+`sign`（秒，1h 有效） | 无（URL 即密钥） |
| 其他安全选项 | 关键词 / IP 白名单 | 仅 URL 保密 | 关键词 / IP 白名单 | URL 保密（官方自动扫描泄露） |
| 频率限制 | 20 条/分（超限封 10 分钟） | 20 条/分 | 100 次/分 + 5 次/秒 | 无官方明文 |
| 大小限制 | 未在当前文档写明（旧文档约 5000 字符） | text 2048 字节 / markdown 4096 字节（按 UTF-8 字节） | 请求体 ≤20KB | 无官方明文 |
| 签名算法 | HmacSHA256(`timestamp\nsecret`) → Base64 → **urlEncode** | — | HmacSHA256(`timestamp\nsecret`) → Base64 | —（回调方向才用 v0 签名） |

### 5.3 通用 body 模板设计建议

1. **适配器职责**：CloudCAD 只负责「渲染一个 body 模板 + POST 到 `ALERT_WEBHOOK_URL`」，不内置平台识别。模板占位符统一渲染后，由**部署方**在配置的模板里自行拼平台特定 wrapper（如 `msgtype`/`msg_type`/顶层 `text`）。

2. **占位符集**（覆盖四平台全部文本/富文本场景）：
   - `{{message}}` — 告警正文（核心；映射各平台 text 字段）
   - `{{level}}` — 告警级别（可做前缀 `[ERROR]` 或 markdown 颜色）
   - `{{source}}` — 告警来源（模块/服务名）
   - `{{timestamp}}` — 告警时间（建议模板内置 ISO8601 或毫秒时间戳；与平台签名用的 timestamp 无关）
   - `{{detail}}` — 详细上下文（堆栈/请求信息，可选）

3. **推荐默认 text 模板**（部署方可直接使用）：
   ```
   {"msgtype":"text","text":{"content":"[{{level}}] {{source}} {{timestamp}}\n{{message}}\n{{detail}}"}}
   ```
   该结构同时兼容钉钉与企微；飞书需将字段名改为 `msg_type`/`content.text`，Slack 直接 `{"text":"..."}`。

4. **markdown 模板注意**：钉钉 `markdown.text`（需 title）、企微 `markdown.content`（支持 3 色 font 标签）、飞书无原生 markdown（须用 `post` 或 `interactive` 卡片）、Slack 用 mrkdwn。**富文本无法一套模板通吃**，因此通用模板默认建议 `text` 类型，markdown 由部署方按平台自定义。

5. **中文 UTF-8 坑**：
   - 全程使用标准 JSON 序列化（默认 UTF-8）即可，**没有平台要求 GBK**；PowerShell/老 curl 环境注意别按 GBK 转码。
   - 唯一实质坑：**企业微信按 UTF-8 字节计数**（text 2048 字节、markdown 4096 字节），中文一字 3 字节；渲染后应按字节截断（而非字符数）。
   - 钉钉加签要求 UTF-8 字符集且 `sign` 需 URLEncode；飞书签名 body 内 `timestamp` 为秒级、钉钉为毫秒级，模板渲染与签名参数不要混用。

6. **可靠性建议**：适配器应做「模板渲染 → 字节长度检查/截断 → POST → 按平台成功语义判读（errcode/code/HTTP 200）→ 限流（至少 20 条/分，建议告警合并或降频）」；钉钉/飞书加签为可选配置（`ALERT_WEBHOOK_SECRET`），钉钉加签放 URL query、飞书加签放 body。
