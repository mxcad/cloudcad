# @cloudcad/frontend-mobile

CloudCAD 移动端 H5 应用 — 基于 Vue 3 + Vite 4 + vant 的 CAD 移动版。

提供图纸查看、CAD 编辑、项目管理等移动端功能。

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | 3.x | 前端框架 |
| Vite | 4.x | 构建工具 |
| vant | 4.x | 移动端 UI 组件库 |
| TypeScript | - | 类型系统 |
| Pinia | - | 状态管理 |
| VoerkaI18n | - | 国际化方案 |
| vi-infinite-loading | - | 无限滚动加载 |

## 目录结构

```
packages/frontend_mobile/
├── src/
│   ├── assets/            # 静态资源
│   ├── components/        # 通用 UI 组件
│   ├── command/           # CAD 命令
│   ├── stores/            # Pinia 状态管理
│   ├── api/               # API 客户端
│   ├── router/            # 路由
│   ├── languages/         # 国际化配置
│   ├── utils/             # 工具函数
│   └── main.ts            # 入口
├── public/                # 公共资源
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 开发

```bash
# 启动开发服务器（端口 7001）
pnpm dev

# 生产构建
pnpm build

# 类型检查
pnpm type-check

# 测试
pnpm test
```

## 国际化

支持 4 种语言：zh-CN（默认）、en-US、zh-TW、ko-KR。

```bash
# 完整 i18n 流水线
pnpm i18n
```

详见 AGENTS.md 中国际化章节。

## 核心功能

- **图纸查看** — DWG/DXF 移动端查看与基本操作
- **CAD 编辑** — 基础绘图命令
- **项目管理** — 项目文件浏览与共享
- **版本控制** — SVN 集成

## 许可证

本软件采用自定义开源许可证。详见项目根目录 LICENSE 文件。
