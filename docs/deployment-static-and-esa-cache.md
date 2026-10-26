# 线上静态资源与 ESA 缓存配置（Linux nginx + 阿里云 ESA）

> **适用场景**：宝塔 + nginx 以静态资源目录托管单应用前端打包产物，前置阿里云 ESA（边缘安全加速）
> **线上环境**：`cad.mxdraw3d.com`，`root /www/sites/cad.mxdraw3d.com/index`
> **来源**：线上踩坑记录（2026-10-26）。本文是**该线上环境的唯一权威配置口径**。

## TL;DR：三条铁律

1. 前端**只保留一个** `location /`（SPA 回退），**不要给 wasm 建独立 location**（包括 `/mxcad-app/` 和 `~* \.wasm$`）。
2. `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` 必须出现在**顶层文档**（`index.html`）的响应上，并且**与 `Cache-Control` 写在同一个 location 块里**。
3. wasm 不带 hash → 只能**协商缓存**（`Cache-Control: no-cache`），**不要给 wasm 单开 ESA 缓存规则**，让它跟随源站。

## 完整可用配置

宝塔 → 网站 → 设置 → 配置文件（或 `/www/server/panel/vhost/nginx/<domain>.conf`）：

```nginx
server {
    listen 80;
    server_name cad.mxdraw3d.com;

    root /www/sites/cad.mxdraw3d.com/index;
    index index.html;

    # gzip：gzip_static 优先下发打包时预生成的 <file>.gz（零 CPU）
    gzip on;
    gzip_static on;
    gzip_vary on;
    gzip_types text/plain text/css text/xml application/javascript application/json
               application/wasm font/ttf font/otf image/svg+xml;

    # ---------- 唯一的静态 location ----------
    location / {
        # SPA 回退：真实文件命中则直接下发，否则回退 index.html（前端 history 路由刷新不 404）
        try_files $uri $uri/ /index.html;

        # wasm 不带 hash，必须协商缓存
        add_header Cache-Control "no-cache";

        # ⚠️ 一旦本块出现 add_header，就【不再继承】server 级 add_header，
        #   故 COOP/COEP 必须在此重列（详见「问题二」）
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Embedder-Policy "require-corp" always;
    }
}
```

`Cache-Control` 已足够，不需要再配 `expires`——现代缓存实现一律以 `Cache-Control` 为准。

---

## 问题一：单应用打包 → 只留一个 `location /`，别给 wasm 单独开 location

打包产物是**单应用**：`index.html` + `/assets/*`（前端构建产物，文件名带内容 hash）+ `/mxcad-app/*`（CAD 引擎运行时，**不带 hash**）全部平铺在同一个 root 下，路径解析依赖同一个 `root`。

`try_files $uri $uri/ /index.html;` 一行同时解决两件事：

- 真实存在的文件（含 wasm）→ 直接按 `root` 解析下发；
- 前端 history 模式路由（如 `/project/123`）→ 回退 `index.html`，刷新不 404。

**不要**为 wasm 加任何独立 location，两种常见写法都会坏：

```nginx
location /mxcad-app/ { ... }      # ❌
location ~* \.wasm$ { ... }       # ❌
```

坏在哪：nginx location 优先级是 `= 精确` > `^~ 前缀` > `正则` > `最长前缀` > `/`。一旦 wasm 请求命中独立块，就**绕开了 `location /` 里的 `try_files` 与 `root` 解析**，静态资源路径解析断裂——表现就是「原本 root 下的静态资源不生效」，wasm 要么 404，要么下载到错误内容（例如被 SPA 回退当成 `index.html` 下发，随后模块脚本 MIME 校验失败直接白屏）。

> **补充注意**：如果确实要给某个子路径单独配置，要分清 `root` 与 `alias` 在子 location 下的语义差异——
> `location /mxcad-app/ { root /a/b/index; }` 解析到 `/a/b/index/mxcad-app/xxx.wasm`（**正确**）；
> `alias /a/b/index` 解析到 `/a/b/index/xxx.wasm`（丢了 `mxcad-app` 段，**错误**）。
> 宝塔面板里加子目录规则时容易写成后者。这也是「只留一个 `location /`」最省事的理由。

## 问题二：wasm 多线程要求 COOP/COEP，且必须重列在 `location /` 里

wasm 使用多线程（`SharedArrayBuffer`）的前提是页面处于**跨源隔离**状态，需要两个响应头：

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

两个关键事实：

1. **浏览器只在顶层文档（`index.html`）的响应上读这两个头**。只加在 `.wasm` 文件响应上完全无效。本环境的顶层文档走 `location /`，所以它们必须挂在 `location /`。
2. ⚠️ **nginx `add_header` 继承陷阱**：`add_header` **只有当当前层级完全没有定义任何 `add_header` 时**，才从上一级继承。一旦 `location /` 里写了 `add_header Cache-Control "no-cache"`，server 级的 COOP/COEP 就**整体不再继承**。

因此正确做法不是「server 级写 COOP/COEP + `location /` 写 Cache-Control」，而是**三行写在同一个块里**。这个坑的迷惑性在于：引擎在 SAB 不可用时**静默回退单线程（ST）变体，不报错**，页面照样能用，只是 CAD 视图卡顿、大图明显变慢——极易被当成机器配置问题排查。

## 问题三：ESA 缓存 —— wasm 走协商缓存，不要单开规则

ESA 的缓存规则高度自定义，**默认行为是跟随源站的缓存策略**（`Cache-Control`）。本环境按这个默认走，只做例外规则：

| 路径 | ESA 动作 | 原因 |
|---|---|---|
| `/api/*`（缩略图除外） | **不缓存** | 接口响应有状态、含用户数据 |
| `/api/*` 缩略图 | **缓存 + 协商缓存** | 体积大、内容稳定但会随图纸变更而变，靠 ETag/Last-Modified 校验 |
| `/assets/*`（带 hash） | 跟随源站（可强缓存） | 文件名含内容 hash，内容不变，可安全 `immutable` |
| `/mxcad-app/*`、`*.wasm` | **跟随源站**（源站 = `no-cache`） | 不带 hash，必须每次回源校验 |
| `/`（`index.html`） | 不缓存 / 极短 TTL | 顶层文档是入口，必须最新 |

**为什么 wasm 不能强缓存、也不能单开 ESA 规则**：

- wasm 文件名不带 hash，**同名文件的内容会随引擎包更新而变化**。若给 wasm 配了固定 TTL 或 `public, immutable`，已访问过页面的用户会**永久拿到旧 wasm**，而入口 JS 已经是新的——两边版本不匹配，引擎加载失败或行为错乱。
- 一旦 ESA 上给 wasm 建了独立规则，缓存 TTL 与校验行为就由那条规则决定，**与源站的 `no-cache` 脱钩**，又回到「缓存到旧 wasm」的问题。所以：不要给 wasm 单开规则，让它跟随源站，源站说 `no-cache` 它就每次都回源校验。

**`no-cache` 不等于「不缓存」**，三者的区别必须分清：

| 取值 | 含义 |
|---|---|
| `no-cache` | 可以缓存，但**每次使用前必须回源校验**（配合 ETag/Last-Modified 走 304）。这就是「协商缓存」 |
| `no-store` | **完全不缓存**，每个请求都全量回源。安全但慢 |
| `public, immutable` | 强缓存且**禁止回源校验**。只适合带 hash、内容永不变的资源 |

`no-cache` 依赖源站发出 ETag 或 `Last-Modified`；nginx 静态文件默认都会发。若源站两者都没有，`no-cache` 会退化为「每次都全量回源」——仍然正确，只是慢。

> **一个已知的取舍**：`location /` 里的 `no-cache` 会同时覆盖 `/assets/*` 这些带 hash 的前端产物，使它们也走回源校验，牺牲了一部分强缓存收益。这是**故意选的**——换来「全工程只有一个 location」，即铁律一。单站点这个代价可以忽略；若将来带宽成为瓶颈，`/assets/` 是唯一可以安全拆分出去的 location（**且必须重列全部 `add_header`**），但不要在 wasm 上做这件事。

---

## 验证方法

改完配置/ESA 规则后，用响应头确认（**要穿透 ESA 看出口结果**）：

```bash
# 1) 顶层文档：COOP/COEP 必须都在
curl -sI https://cad.mxdraw3d.com/ | grep -iE "cross-origin|cache-control"
# 期望:
#   cross-origin-opener-policy: same-origin
#   cross-origin-embedder-policy: require-corp
#   cache-control: no-cache

# 2) wasm 文件：同样的头，且带 ETag/Last-Modified（协商缓存的前提）
curl -sI https://cad.mxdraw3d.com/mxcad-app/mxdrawassembly.wasm \
  | grep -iE "cross-origin|cache-control|etag|last-modified|content-type"
# content-type 必须是 application/wasm（若是 text/html 说明被 SPA 回退误命中）
```

- **诊断法：间隔两次 curl 对比响应头**。ESA 边缘规则更新有传播延迟，改完立刻 curl 可能看到的还是旧规则的结果。
- **确认引擎加载的是哪个变体**：DevTools → Network 里找 wasm 请求。多线程变体与单线程（ST）变体文件名不同，ST 变体名中带 `st` 标记；若实际加载的是 ST 变体，说明 COOP/COEP 没生效或 SAB 不可用。

### 故障速查

| 症状 | 原因 | 修复 |
|---|---|---|
| wasm 404 或下载到错误内容 | 给 wasm 建了独立 location，绕开 `location /` 的 root/try_files | 删除独立 location（铁律一） |
| 页面白屏，控制台报模块脚本 MIME 校验失败 | SPA 回退把 `index.html` 当 JS/wasm 下发 | 确认 `try_files $uri $uri/ /index.html` 在 `location /` 内 |
| CAD 引擎变慢、大图卡顿，但功能正常 | 顶层文档缺 COOP/COEP，引擎已静默回退单线程 | 在 `location /` 内重列两行 COOP/COEP（`add_header` 继承陷阱） |
| 更新引擎包后部分用户仍用旧 wasm | wasm 被强缓存（ESA 规则或 `immutable`） | wasm 改协商缓存 `no-cache`，删除 wasm 的 ESA 独立规则 |
| 改了 ESA 规则不生效 | 边缘传播延迟，或命中了优先级更高的其他规则 | 间隔两次 curl 对比响应头；检查 ESA 规则优先级 |

---

## 与仓库内 nginx 配置的关系

仓库内的 nginx 配置是**自托管/容器部署**（部署包、Docker）用的，与本线上环境有意不同：

| 文件 | `/mxcad-app/` 处理 | wasm 缓存 |
|---|---|---|
| `docker/nginx/nginx.conf`、`docker/nginx/nginx-tls.conf` | 独立 `^~` location，内含 `try_files` 并重列安全头/COOP/COEP | `no-cache` |
| `docker/nginx/nginx-app.conf.template` | 同上（另有一个 `~* \.wasm$` 块，因 `^~` 优先级而不会被真实 wasm 命中） | `no-cache` |
| `deploy/nginx-cache.conf` | 无独立块，wasm 落到 `location /` | `no-store` |
| **本线上环境（本文档）** | **无独立块** | **`no-cache`** |

**不要拿仓库配置直接覆盖线上，也不要因为线上这么配就把仓库配置改回来**：容器/裸机部署包的模型是「覆盖服务器 `mxcad-app/` 目录即热更新」，独立 `^~` location 在那些场景是正确的；本线上环境选择单一 `location /` 是为了配合宝塔 + ESA 的规则模型。

两套配置共享的同一条原则是：**任何 location 内只要出现 `add_header`，就必须在该块内重列全部需要的响应头**（COOP/COEP、`Cache-Control`、安全头），否则会被 `add_header` 的「有则全不继承」规则清空。
