# Config Service — packages/config-service

纯 Node.js HTTP 服务（0 外部依赖），运行在端口 3002，提供配置管理后端。

## 结构

```
packages/config-service/
├── server.js              # 入口文件：路由 + 认证 + CRUD（1960 行）
├── public/                # 前端静态文件（SPA 配置管理界面）
│   ├── index.html         # 单页应用（3002 行，内联 CSS+JS）
│   └── *.js               # 各配置模块的前端逻辑
├── config/                # 配置文件目录
├── logs/                  # 日志目录
├── package.json
└── AGENTS.md
```

## 技术选型

- **运行时**: Node.js 原生 HTTP 模块（无 Express/NestJS）
- **数据库**: 通过 `better-sqlite3` 或 PostgreSQL 原生驱动操作
- **认证**: 基于内存会话（`Map<token, session>`）+ 管理员密码
- **前端**: 原生 JS SPA，无框架依赖

## 路由

- `POST /api/auth/login` — 管理员登录（密码来自 .env 文件或默认回退）
- `GET/POST /api/config/<module>` — 各配置模块 CRUD
- `POST /api/test/database` — 测试数据库连接
- `POST /api/test/redis` — 测试 Redis 连接
- `GET /api/service/status` — 查看服务状态

## 配置模块

| 模块 | 文件 | 用途 |
|------|------|------|
| ui-config | `public/ui-config.js` | UI 配置（按钮、布局等） |
| system-config | `public/system-config.js` | 系统级配置 |
| sms-config | 已移除（死代码） | 短信配置（功能已迁移到运行时配置） |
| brand-config | `public/brand-config.js` | 品牌配置 |
| runtime-config | `public/runtime-config.js` | 运行时配置 |

## 注意事项

- **非 NestJS 服务** — 不使用 DI、Controller、Guard 等 NestJS 概念
- **服务器重启后会话丢失** — 内存会话未持久化
- **无日志轮转** — 使用 `console.log` 输出
- **所有静态文件 Cache-Control: no-store** — 开发便利，生产环境需优化
