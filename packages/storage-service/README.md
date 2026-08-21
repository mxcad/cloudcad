# @cloudcad/storage-service

CloudCAD 存储服务 — 文件存储与 图纸版本控制。

独立 HTTP 服务，运行在端口 **3200**（`STORAGE_SERVICE_PORT`），统一管理所有 `data/` 目录（`files/`、`uploads/`、`exports/`、`conversion/`）并提供文件读取、写入、SVN 版本控制等功能。

## 技术栈

| 技术 | 说明 |
|------|------|
| Node.js 原生 http 模块 | 无框架 HTTP 服务 |
| MX 版本控制工具 | SVN 式文件版本管理（@cloudcad/mx-version-tool） |
| LRU 内存缓存 | 热门文件缓存（<10MB） |

## 目录结构

```
packages/storage-service/
├── server.js                 # 入口：HTTP 路由 + 服务启动
├── lib/
│   ├── constants.js          # 常量配置（路径、端口）
│   └── utils.js              # 通用工具函数
├── routes/
│   ├── files.js              # 文件 CRUD 路由
│   ├── svn.js                # SVN 版本控制路由
│   └── cache.js              # 缓存管理路由
├── services/
│   ├── file-handler.js       # 文件读写处理
│   ├── lru-cache.js          # LRU 缓存实现
│   ├── router.js             # 多节点路由表
│   ├── svn-agent.js          # SVN 操作代理
│   └── token.js              # 预签名 Token 验证器
└── package.json
```

## API 路由

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/v1/files/{path}` | 读取文件 |
| PUT | `/v1/files/{path}` | 写入文件 |
| DELETE | `/v1/files/{path}` | 删除文件 |
| POST | `/v1/files/upload` | 预签名 Token 上传 |
| POST | `/v1/svn/commit` | SVN 提交 |
| GET | `/v1/svn/history` | SVN 历史 |
| GET | `/v1/svn/cat` | 指定版本文件内容 |
| GET | `/v1/cache/stats` | 缓存统计 |
| DELETE | `/v1/cache/clear` | 清空缓存 |
| GET | `/health` | 健康检查 |

## 架构设计

### 上传流程

```
客户端 → Backend(校验认证+配额+创建节点) → 签发 JWT Token
  → 客户端 PUT → Storage Service(校验 Token) → 写入磁盘 → SVN 提交
```

Token 是自包含的（JWT，含 `userId`、`nodeId`、`path`、过期时间），Storage Service 无需查数据库即可验证。

### 缓存策略

**URL 突变即缓存失效** — 所有文件 URL 携带 `?t=updatedAt&v=version`：

- **L1（浏览器）**: `Cache-Control: private, max-age=3600`
- **L2（Nginx/CDN）**: URL 作为缓存 key
- **L3（服务端 LRU）**: 仅缓存 <10MB 的热门文件

### 多节点路由

通过目录组（`YYYYMM`、`YYYYMM_N`）映射到节点。每个节点拥有独立的 SVN 工作副本和仓库。

## 部署模式

| 模式 | 说明 | 配置 |
|------|------|------|
| **Embedded** | 单节点，无路由表，所有文件落在 `FILES_DATA_PATH` | 不设置 `STORAGE_ROUTING_TABLE`（默认 `config/storage-routing.json` 不存在即单节点） |
| **Standalone** | 多节点独立部署 | 设置 `STORAGE_ROUTING_TABLE` 指向路由表 JSON（目录组 → 节点 basePath 映射） |

## 快速开始

```bash
# 启动服务
pnpm start

# 服务默认运行在 http://localhost:3200
```

## 配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `STORAGE_SERVICE_PORT` | `3200` | 服务端口 |
| `FILES_DATA_PATH` | `~/filesData` | 文件存储根路径 |
| `STORAGE_CACHE_MAX_SIZE` | `100` | LRU 缓存最大条目数 |
| `STORAGE_CACHE_MAX_FILE_SIZE` | `10485760` | 单文件缓存上限（字节，默认 10MB） |
| `STORAGE_CACHE_TTL_MS` | `300000` | 缓存 TTL（毫秒） |
| `STORAGE_ROUTING_TABLE` | `config/storage-routing.json` | 多节点路由表路径 |
| `MX_VERSION_TOOL_PATH` | `packages/mxVersionTool/mxcmd.js` | MX 版本控制 CLI 路径 |
| `BACKEND_JWT_SECRET` | — | 上传令牌共享密钥（与后端一致） |

## 许可证

本软件采用自定义开源许可证。详见项目根目录 LICENSE 文件。
