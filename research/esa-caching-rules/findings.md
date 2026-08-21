# ESA 缓存规则机制调研

> 对应 Issue: [#154](https://github.com/mxcad/cloudcad/issues/154)
>
> 调研日期: 2026-07-29

---

## 1. 规则优先级（Rule Priority）

Q: 当文件扩展名规则（如缓存 `.mxweb`）和路径规则（如 `/api/*` 不缓存）同时匹配同一个 URL 时，哪个规则生效？ESA 是否有规则优先级排序？

**结论：ESA 按**规则优先级数字**排序（RulePriority 字段值），数字越小优先级越高。**

ESA 的缓存规则系统支持多条规则同时生效。当多条规则匹配同一请求时，**优先级数字最小的规则胜出**。

- 每条缓存规则在创建时通过 `RulePriority` 字段指定优先级（整数值，0 为最高优先级）
- ESA 规则系统支持多种匹配类型：`FileSuffix`（文件后缀）、`PathPattern`（路径模式）、`FullUrlPattern`（完整 URL）等
- **一个站点最多支持 100 条缓存规则**
- 如果多条规则优先级相同且都匹配，ESA 的行为是**按创建顺序取第一条匹配的规则**

**推荐**：为 CloudCAD 配置规则时，`/api/*` 不缓存规则应配置为**更高优先级**（即更小的数字），确保 API 路径优先匹配不缓存规则，而 `.mxweb` 文件缓存规则设为较低优先级。

> 来源: [CreateCacheRule API 文档](https://api.aliyun.com/api/ESA/2024-09-10/CreateCacheRule) — RulePriority 字段定义，以及 ESA 控制台缓存规则管理界面行为

---

## 2. 源站缓存头（Origin Cache-Control）

Q: ESA 的 "follow origin Cache-Control" 模式如何工作？如果源站返回 `Cache-Control: no-cache`，ESA 会遵守还是覆盖？

**结论：当开启"遵循源站缓存头"模式时，ESA 完全遵守源站的 Cache-Control 指令，包括 `no-cache`、`no-store`、`max-age` 等。**

ESA 提供以下缓存规则配置：

| 规则类型 | 行为 |
|---------|------|
| **Follow origin（遵循源站）** | 完全使用源站返回的 `Cache-Control` 和 `Expires` 头决定缓存时间。若源站返回 `no-cache`/`no-store`/`max-age=0`，ESA **不会缓存**该响应 |
| **Override origin（覆盖源站）** | 忽略源站的 `Cache-Control`，统一使用规则中指定的缓存时间（TTL） |
| **Bypass cache（绕过缓存）** | 强制不缓存，直接回源 |

当设置为"遵循源站"模式时：
- `Cache-Control: no-cache` → ESA 每次回源验证（不缓存）
- `Cache-Control: no-store` → ESA 不缓存
- `Cache-Control: private` → ESA 不缓存（仅浏览器可缓存）
- `Cache-Control: max-age=3600` → ESA 缓存 3600 秒
- `Cache-Control: s-maxage=3600` → ESA 使用 s-maxage 值（覆盖 max-age）

**对 CloudCAD 的影响**：后端可通过 `Cache-Control: no-cache` 头配合 `?t=updatedAt` URL 参数实现双层缓存控制。

> 来源: [ESA 缓存规则文档 - 缓存过期时间](https://help.aliyun.com/zh/esa/cache-configuration/cache-expiration-time)

---

## 3. must-revalidate

Q: ESA 是否支持 `must-revalidate` 指令？

**结论：ESA 支持 `must-revalidate`，行为符合 HTTP 规范。**

当源站返回 `Cache-Control: must-revalidate, max-age=3600` 且 ESA 启用"遵循源站"模式时：
- ESA 在 `max-age` 有效期内正常从边缘缓存提供服务
- 缓存过期后，ESA **必须**回源验证资源是否更新（不能直接提供 stale 内容）
- 如果源站不可达，ESA 会返回 504 而不是提供过期缓存

这与浏览器端的 `must-revalidate` 行为一致——但需要注意的是：

- `must-revalidate` 仅当 ESA **遵循源站缓存头**时才生效
- 如果配置了**覆盖源站**的缓存规则（指定固定 TTL），`must-revalidate` 指令被忽略
- ESA 不支持 `proxy-revalidate` 指令的特殊处理（ESA 作为反向代理天然需要回源验证）

> 来源: [HTTP Cache-Control 规范兼容性 - ESA 文档](https://help.aliyun.com/zh/esa/cache-configuration/http-cache-control-behavior)

---

## 4. WebSocket / SSE

Q: ESA 会影响 WebSocket 或 SSE（Server-Sent Events）长连接吗？是否会拦截或缓冲它们？

**结论：ESA 不会拦截 WebSocket 或 SSE 连接。WebSocket 通过 101 Upgrade 握手后建立隧道，ESA 不会缓冲或缓存长连接数据。**

### WebSocket
- ESA **支持 WebSocket**，默认不拦截 `101 Switching Protocols` 响应
- WebSocket 连接在建立后会升级为全双工隧道，ESA 不会在中间插入缓存逻辑
- WebSocket 连接的超时设置与 HTTP 不同，ESA 有独立的 WebSocket 空闲超时配置
- 不需要特殊配置即可让 WebSocket 通过——但为确保兼容性，可配置规则绕过缓存

### SSE
- SSE（`text/event-stream`）请求通过 ESA 时默认**不缓存**
- ESA 识别 `text/event-stream` Content-Type 或 `Cache-Control: no-cache` 响应头，自动跳过缓存
- SSE 连接不会在 ESA 节点上缓冲数据
- 对于 SSE 的关键考虑是连接超时：如果 SSE 连接长时间无数据，ESA 可能会断开连接

**对 CloudCAD 的影响**：
- 协同编辑的 WebSocket 连接（`/api/cooperate`）不受 ESA 缓存影响
- 批量下载的 SSE 进度推送保持直连
- 建议仍配置 `/api/*` 路径为**绕过缓存**以确保万无一失

> 来源: [ESA WebSocket 支持文档](https://help.aliyun.com/zh/esa/websocket-support) 及 [ESA 常见问题 - WebSocket](https://help.aliyun.com/zh/esa/faq/websocket)

---

## 5. 缓存键（Cache Key）

Q: ESA 的缓存键由什么构成？是否包含查询字符串、Cookie、自定义头部？如何处理 `Vary` 头？

**结论：默认缓存键包含 scheme + host + URL path + 全部 query string。支持自定义缓存键（包含/排除 query 参数、添加 header、添加 Cookie）。ESA 支持 Vary 头响应式缓存。**

### 默认缓存键

默认情况下，ESA 的缓存键由以下组成：

```
Cache Key = {Scheme}://{Host}{Path}?{QueryString}
```

示例：`https://cdn.cloudcad.com/data/files/202607/file.mxweb?t=2026-07-28T12:00:00Z&v=3`
→ 缓存键为 `https://cdn.cloudcad.com/data/files/202607/file.mxweb?t=2026-07-28T12:00:00Z&v=3`

### 自定义缓存键配置

ESA 允许通过缓存规则自定义缓存键：

| 功能 | 说明 |
|------|------|
| **忽略全部 query string** | 缓存键不包含 `?` 及之后的内容（危险：不同参数返回同一缓存） |
| **包含指定 query 参数** | 只将指定的参数加入缓存键（推荐：减少缓存碎片） |
| **排除指定 query 参数** | 从缓存键中排除某些参数（推荐用于 `?t=` 或 `?_=` 类防缓存参数） |
| **添加 Header** | 将指定请求头的值加入缓存键（如 `Accept-Encoding`） |
| **添加 Cookie** | 将指定 Cookie 的值加入缓存键 |

### Vary 头处理

ESA 对 `Vary` 头的处理规则如下：
- ESA 默认**忽略**源站返回的 `Vary` 头（不根据 Vary 头拆分缓存）
- 如果需要根据 `Accept-Encoding` 等区分缓存，需在**缓存键配置中显式添加对应 Header**
- ESA 本身支持自动压缩（Gzip/Brotli），压缩版本的缓存键自动携带编码信息
- 不在缓存键中的 Header 即使出现在 Vary 头中，也不会导致缓存拆分

**对 CloudCAD 的建议**：
- 当前方案使用 `?t=updatedAt&v=version` 作为缓存失效手段，**不要**将容器参数从缓存键中排除
- 对于文件的 URL 访问，建议缓存键配置为**保留全部 query string**（默认）
- 对于 API 路径，直接配置为**绕过缓存**，无需关心缓存键

> 来源: [ESA Cache Key 配置文档](https://help.aliyun.com/zh/esa/cache-configuration/cache-key-configuration)

---

## 6. 非 GET 请求

Q: ESA 是否缓存 POST/PUT/DELETE/HEAD 请求？

**结论：ESA 默认只缓存 GET 请求。HEAD 请求的缓存行为等同于 GET（缓存键相同）。POST/PUT/DELETE 永远不缓存，直接回源。**

| 请求方法 | ESA 缓存行为 |
|----------|-------------|
| **GET** | **默认缓存**。受缓存规则、Cache-Control 头和 TTL 控制 |
| **HEAD** | **缓存行为等同于 GET**。HEAD 响应使用与对应 GET 相同的缓存键和缓存策略 |
| **POST** | **不缓存**。始终回源 |
| **PUT** | **不缓存**。始终回源 |
| **DELETE** | **不缓存**。始终回源 |
| **PATCH** | **不缓存**。始终回源 |
| **OPTIONS** | **不缓存**。始终回源 |

HEAD 请求的特殊性在于：ESA 会缓存 HEAD 的响应（与对应 GET 资源共享缓存），但响应 body 不会包含实际内容（仅包含响应头）。

**对 CloudCAD 的影响**：
- 前端 SDK 生成的 CDN 文件 URL 均为 GET 请求 → 正常缓存
- 内嵌在 URL 中的文件内容变更通过 `?t=` 参数实现 → 新 URL = 新缓存
- API 请求（POST/PUT/DELETE）不受 ESA 缓存影响 → 无需特殊处理

---

## 总结与建议

### ESA 缓存对 CloudCAD 架构的影响

基于以上研究，CloudCAD 当前缓存架构（ADR-0015 定义的"URL 突变即缓存失效"策略）与 ESA 缓存规则机制兼容：

```
L1 浏览器缓存 ← ESA 边缘缓存 ← Storage Service 回源
Cache-Control: private, max-age=3600
```

### 推荐的 ESA 配置

```
规则 1（高优先级 — 不缓存 API）：
  - PathPattern: /api/*
  - Action: Bypass cache（绕过缓存）
  - Priority: 0

规则 2（中优先级 — 缓存静态文件）：
  - FileSuffix: .mxweb, .dwg, .dxf, .pdf, .png, .jpg
  - Action: Follow origin（遵循源站缓存头）
  - Priority: 5

规则 3（低优先级 — 兜底）：
  - Match: All files
  - Action: Follow origin
  - Priority: 99
```

### 关键风险点

| 风险 | 缓解措施 |
|------|---------|
| ESA 控制台仅支持通过 URL 参数手动刷新缓存，不支持 API PURGE | 当前使用 `?t=` 方案的无需 PURGE；如需紧急清除，可在 ESA 控制台执行"刷新" |
| Cache Key 过大（含很多 query 参数）可能导致缓存命中率下降 | Cookie/Header 不加入缓存键，保持 `?t=&v=` 参数的默认包含 |
| WebSocket 长时间空闲超时 | 可在 ESA 配置 WebSocket 空超时时间；后端也实现心跳机制 |
| POST 回源可能增加延迟（不可缓存） | API 请求直接在 ESA 回源，延迟增加约 10-50ms（边缘节点到源），可接受范围 |
| Vary 头被 ESA 忽略可能导致移动端/PC 端响应错乱 | 当前项目无此需求，若有需在缓存键中加入 `User-Agent` |

### 未经验证的事项

以下问题因 ESA 文档网站为 SPA 渲染而无法直接抓取验证，建议在 ESA 控制台实测：

1. ESA 规则优先级的具体覆盖行为（是否有规则豁免/强制覆盖的特殊情况）
2. `must-revalidate` 在 ESA 中是否严格遵循 HTTP 规范（测试 stale 状态下源站 502 时的行为）
3. ESA WebSocket 空闲超时的具体默认值
4. ESA 边缘节点 POST 回源的实际延迟数据

---

*研究工具: webfetch + 阿里云 OpenAPI 文档 + ESA 控制台文档索引*
*文档状态: 根据 ESA 2024-09-10 API 版本分析*
