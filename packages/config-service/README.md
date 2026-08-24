# @cloudcad/config-service

CloudCAD 部署配置中心 — 零外部依赖的纯 Node.js HTTP 服务。

运行在端口 **3002**，提供配置管理后端与 SPA 管理界面。

## 技术栈

| 技术 | 说明 |
|------|------|
| Node.js 原生 http 模块 | 无 Express/NestJS 等框架依赖 |
| better-sqlite3 / PostgreSQL | 配置持久化 |
| 原生 JS SPA | 前端管理界面（无框架） |

## 目录结构

```
packages/config-service/
├── server.js              # 入口：路由 + 认证 + CRUD
├── lib/                   # 工具模块
│   ├── constants.js       # 常量（端口、路径等）
│   ├── env.js             # 环境变量加载
│   ├── session.js         # 内存会话管理
│   ├── utils.js           # 通用工具函数
│   ├── db-backup.js       # 数据库备份
│   ├── network.js         # 网络工具
│   └── pm2.js             # PM2 进程管理
├── routes/                # 路由处理器
│   ├── auth.js            # 管理员登录/登出
│   ├── system-config.js   # 系统级配置 CRUD
│   ├── brand-config.js    # 品牌配置 CRUD
│   ├── ui-config.js       # UI 配置 CRUD
│   ├── runtime-config.js  # 运行时配置 CRUD
│   ├── database.js        # 数据库连接测试
│   └── service.js         # 服务状态监控
├── public/                # 前端 SPA 管理界面
│   └── index.html         # 单页应用（内联 CSS+JS）
├── config/                # 配置文件目录
├── logo/                  # 品牌 Logo 资源
├── AGENTS.md
├── CONTEXT.md
└── package.json
```

## API 路由

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 管理员登录 |
| POST | `/api/auth/logout` | 管理员登出 |
| GET | `/api/auth/check` | 会话检查 |
| GET/POST | `/api/config/system` | 系统配置 |
| GET/POST | `/api/config/brand` | 品牌配置 |
| GET/POST | `/api/config/ui` | UI 配置 |
| GET/POST | `/api/config/runtime` | 运行时配置 |
| POST | `/api/test/database` | 测试数据库连接 |
| POST | `/api/test/redis` | 测试 Redis 连接 |
| GET | `/api/service/status` | 服务状态 |
| GET | `/health` | 健康检查 |

## 配置模块

| 模块 | 文件名 | 用途 |
|------|--------|------|
| ui-config | `myUiConfig.json` | UI 配置（工具栏、菜单栏、右键菜单） |
| system-config | `mySystemConfig.json` | 系统级配置 |
| brand-config | — | 品牌配置（标题、Logo、主题色） |
| runtime-config | — | 运行时配置（WASM 路径、AI 端点、上传限制） |

## 快速开始

```bash
# 启动服务
pnpm start

# 服务默认运行在 http://localhost:3002
# 访问 http://localhost:3002 打开管理界面
```

认证：使用 `INITIAL_ADMIN_PASSWORD` 环境变量设置管理员密码。

## 日志

零依赖 JSON 单行日志（ADR-0055 §1 对齐）：stdout + 文件落盘 `data/logs/config-service/app-YYYY-MM-DD.log`，按天轮转，请求级 `X-Request-Id` 透传。

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `LOG_DIR` | `data/logs` | 日志根目录（相对路径基于包根解析） |
| `LOG_RETENTION_DAYS` | `180` | 日志保留天数（过期自动清理） |

## 注意事项

- **非 NestJS 服务** — 不使用 DI、Controller、Guard 等概念
- **内存会话** — 服务器重启后会话丢失
- **Cache-Control: no-store** — 所有静态文件，生产环境需优化

## 许可证

本软件采用自定义开源许可证。详见项目根目录 LICENSE 文件。
