# E2E 测试数据准备指南

> 面向测试工程师：本文档列出运行 CloudCAD E2E 测试前必须准备好的种子数据及其用途。
> **注意：本文档不包含任何真实凭据、密码或 API Key。**

---

## 系统角色用户（storageState）

系统角色决定用户在全局层面的权限。每种角色至少需要一个预建用户并为其生成 `storageState` 文件。

### ADMIN（系统管理员）

| 属性 | 说明 |
|------|------|
| **storageState 文件** | `admin.json` |
| **系统权限** | 所有系统级权限：SYSTEM_USER_READ、SYSTEM_USER_MANAGE、SYSTEM_ROLE_READ、SYSTEM_ROLE_MANAGE、SYSTEM_ADMIN、SYSTEM_MONITOR、SYSTEM_CONFIG_READ、SYSTEM_CONFIG_MANAGE、LIBRARY_DRAWING_MANAGE、LIBRARY_BLOCK_MANAGE、SYSTEM_FONT_READ、SYSTEM_FONT_MANAGE |
| **可使用页面** | `/users`、`/roles`、`/audit-logs`、`/system-monitor`、`/runtime-config`、`/font-library`、`/library` |
| **测试用途** | 验证系统管理全功能（用户 CRUD、角色 CRUD、审计日志、系统监控、运行时配置、资源库管理、字体库管理）。作为"全能用户"的基线对照 |

### USER_MANAGER（用户管理员）

| 属性 | 说明 |
|------|------|
| **storageState 文件** | `user-manager.json` |
| **系统权限** | SYSTEM_USER_READ、SYSTEM_USER_MANAGE、SYSTEM_ROLE_READ、SYSTEM_ROLE_MANAGE |
| **可使用页面** | `/users`、`/roles` |
| **不可使用页面** | `/audit-logs`（NoPermissionPage）、`/system-monitor`（NoPermissionPage）、`/runtime-config`（NoPermissionPage）、`/font-library`（NoPermissionPage）、`/library`（NoPermissionPage） |
| **测试用途** | 验证用户管理和角色管理的完整 CRUD；验证侧边栏菜单正确隐藏无权限入口；验证 NoPermissionPage 正确拦截 |

### FONT_MANAGER（字体管理员）

| 属性 | 说明 |
|------|------|
| **storageState 文件** | `font-manager.json` |
| **系统权限** | SYSTEM_FONT_READ、SYSTEM_FONT_MANAGE |
| **可使用页面** | `/font-library`、`/library` |
| **不可使用页面** | `/users`（NoPermissionPage）、`/roles`（NoPermissionPage）、`/audit-logs`（NoPermissionPage）、`/system-monitor`（NoPermissionPage）、`/runtime-config`（NoPermissionPage） |
| **测试用途** | 验证字体库的字体上传/下载/删除；验证侧边栏菜单仅显示"字体库"和"资源库"入口 |

### USER（普通用户）

| 属性 | 说明 |
|------|------|
| **storageState 文件** | `user.json` |
| **系统权限** | 无系统管理员权限 |
| **可使用页面** | `/dashboard`、`/projects`、`/personal-space`、`/library`、`/cad-editor` |
| **不可使用页面** | 所有系统管理页面（`/users`、`/roles`、`/audit-logs`、`/system-monitor`、`/runtime-config`、`/font-library` 均不可见） |
| **测试用途** | 验证普通用户不能访问管理页面；作为权限基线对照；测试项目内角色行为 |

---

## 项目角色用户（storageState）

项目角色决定用户在特定项目内的操作权限。每种角色至少需要一个预建用户，作为预建项目的成员，并生成对应的 `storageState` 文件。

### OWNER（项目所有者）

| 属性 | 说明 |
|------|------|
| **storageState 文件** | `project-owner.json` |
| **项目内可做** | 创建/删除/编辑项目，创建/上传/删除/移动/复制文件，管理回收站，管理成员（添加/移除/修改角色），转让所有权，管理项目角色 |
| **项目内不可做** | 无（拥有项目内全部权限） |
| **测试用途** | 验证所有者全部按钮可见性和操作权限；验证所有权转让流程 |

### ADMIN（项目管理员）

| 属性 | 说明 |
|------|------|
| **storageState 文件** | `project-admin.json` |
| **项目内可做** | 编辑项目，创建/上传/删除/移动/复制文件，管理回收站，管理成员（添加/移除/修改角色） |
| **项目内不可做** | 删除项目，转让所有权，管理项目角色 |
| **测试用途** | 验证项目管理员可管理成员但不能转让所有权；验证"项目设置"和"成员管理"按钮可见 |

### MEMBER（项目成员）

| 属性 | 说明 |
|------|------|
| **storageState 文件** | `project-member.json` |
| **项目内可做** | 创建文件/文件夹，上传文件，删除/移动/复制文件 |
| **项目内不可做** | 编辑/删除项目，管理回收站，管理成员，管理项目角色 |
| **测试用途** | 验证成员可进行文件操作但不能管理项目和成员；验证"项目设置"和"成员管理"按钮隐藏 |

### EDITOR（项目编辑者）

| 属性 | 说明 |
|------|------|
| **storageState 文件** | `project-editor.json` |
| **项目内可做** | 上传文件，删除/移动/复制文件，编辑后保存 |
| **项目内不可做** | 创建文件/文件夹，管理回收站，管理成员，管理项目角色 |
| **测试用途** | 验证编辑者可以编辑保存但不能新建；验证"新建"按钮隐藏但"上传"按钮显示 |

### VIEWER（项目查看者）

| 属性 | 说明 |
|------|------|
| **storageState 文件** | `project-viewer.json` |
| **项目内可做** | 查看文件，查看版本历史，打开图纸（只读），导出 DWG/DXF |
| **项目内不可做** | 创建/上传/删除/移动/复制文件，编辑后保存，管理回收站，管理成员 |
| **测试用途** | 验证查看者仅有只读权限；验证除"导出"外的所有写操作按钮隐藏；验证编辑保存被拒绝 |

---

## 预建项目

以下是运行 E2E 测试前需要预建的项目，每个项目有明确的用途。

### 完整文件树项目

| 属性 | 说明 |
|------|------|
| **项目名称** | `e2e-full-file-tree`（名称可配置） |
| **存储位置** | 项目列表可见，Dashboard 可见 |
| **文件结构** | 包含多级文件夹嵌套（至少 3 层），每层包含 mxweb 文件和 DWG 文件，以及空文件夹 |
| **示例结构** | `根目录/文件夹A/子文件夹A1/file.mxweb`、`根目录/文件夹B/file.dwg`、`根目录/空文件夹/` |
| **成员配置** | 包含所有 5 种项目角色（OWNER/ADMIN/MEMBER/EDITOR/VIEWER）的用户作为成员 |
| **测试用途** | 文件树展开/折叠、面包屑导航、右键菜单（打开/重命名/移动/复制/删除/版本历史/属性）、批量操作（多选→移动/复制/删除）、拖拽移动、版本历史查看、版本对比、版本恢复、外部参照、回收站恢复/永久删除 |

### 空项目

| 属性 | 说明 |
|------|------|
| **项目名称** | `e2e-empty-project`（名称可配置） |
| **文件结构** | 仅默认根文件夹，无任何文件 |
| **成员配置** | 至少包含 OWNER 角色用户 |
| **测试用途** | 验证空状态引导提示；验证空文件夹提示文案；验证创建第一个文件/文件夹后的列表刷新 |

### 配额满项目

| 属性 | 说明 |
|------|------|
| **项目名称** | `e2e-quota-full-project`（名称可配置） |
| **存储配额** | 项目存储配额设置为极小值（如 1MB），且已用空间接近或等于配额上限 |
| **成员配置** | 至少包含 OWNER 角色用户 |
| **测试用途** | 验证上传文件时配额满被拒绝；验证保存图纸时配额满提示；验证配额进度条显示为已满状态 |

### 多角色成员项目

| 属性 | 说明 |
|------|------|
| **项目名称** | `e2e-multi-role-project`（名称可配置） |
| **文件结构** | 包含少量 mxweb 文件和文件夹 |
| **成员配置** | 所有 5 种项目角色各至少 1 人（OWNER/ADMIN/MEMBER/EDITOR/VIEWER） |
| **测试用途** | 验证 UI 按钮按角色正确显隐（使用不同 storageState 登录验证）；验证操作权限按角色正确拒绝/允许；验证成员管理弹窗（添加/移除/角色修改/所有权转让） |

---

## 资源库种子数据

### 图纸库

| 属性 | 说明 |
|------|------|
| **数据量** | 30+ 个 mxweb 文件 |
| **分页设置** | 每页 20 条，因此至少需要 21 条才能覆盖 2 页以上 |
| **文件分布** | 包含不同名称、大小、创建时间的文件，部分放入子文件夹中 |
| **测试用途** | 验证分页加载（首页/上一页/跳转/下一页/末页）；验证向下滚动预加载（距底部 500px 阈值触发）；验证向上翻页滚动位置恢复（heightDiff 补偿）；验证搜索筛选；验证面包屑导航 |

### 图块库

| 属性 | 说明 |
|------|------|
| **数据量** | 若干文件（5-10 个） |
| **测试用途** | 验证图块库与图纸库页面切换；验证上传/下载/删除操作（LIBRARY_BLOCK_MANAGE 权限）；验证库类型 Tab 切换时数据隔离 |

### 字体库

| 属性 | 说明 |
|------|------|
| **数据量** | 若干 ttf/otf 字体文件（3-5 个） |
| **测试用途** | 验证字体列表展示（名称/格式/大小）；验证字体上传（格式验证）；验证字体预览渲染；验证字体下载/删除；验证 FONT_MANAGER 角色权限 |

---

## storageState 文件列表

以下为 E2E 测试需要预先生成的所有 `storageState` 文件，建议放在 `e2e/.auth/` 目录下。

| 文件名 | 角色 | 类型 | 说明 |
|--------|------|------|------|
| `admin.json` | ADMIN | 系统角色 | 系统管理员，拥有全部系统权限，可访问所有管理页面 |
| `user-manager.json` | USER_MANAGER | 系统角色 | 用户管理员，可管理用户和角色，不可访问审计日志/系统监控 |
| `font-manager.json` | FONT_MANAGER | 系统角色 | 字体管理员，可管理字体库，不可访问系统管理页面 |
| `user.json` | USER | 系统角色 | 普通用户，无系统管理权限，侧边栏仅显示项目相关入口 |
| `project-owner.json` | OWNER | 项目角色 | 预建项目所有者，拥有项目内全部权限 |
| `project-admin.json` | ADMIN | 项目角色 | 预建项目管理员，可管理成员和回收站，不可转让所有权 |
| `project-member.json` | MEMBER | 项目角色 | 预建项目成员，可创建/上传文件但不可管理项目和成员 |
| `project-editor.json` | EDITOR | 项目角色 | 预建项目编辑者，可上传和编辑但不可新建文件/文件夹 |
| `project-viewer.json` | VIEWER | 项目角色 | 预建项目查看者，仅可查看和导出，无写权限 |

**生成方式**：使用 Playwright 的 `setup` 项目，通过 API 或 UI 登录后保存 `storageState`。每个 `storageState` 文件对应一个独立用户账号。

---

## 测试文件

E2E 测试需要以下真实文件用于上传/导入操作，建议放在 `e2e/fixtures/` 目录下。

### 图纸文件

| 文件名 | 类型 | 大小限制 | 用途 |
|--------|------|----------|------|
| `sample.dwg` | DWG 图纸 | ≤ 50MB | 上传转换测试（上传 → 后端转换 mxweb → 文件树刷新） |
| `sample.dxf` | DXF 图纸 | ≤ 50MB | 上传转换测试（DXF 格式上传） |
| `sample-large.dwg` | DWG 图纸 | > 50MB | 超大文件上传拒绝测试 |
| `sample-unsupported.xyz` | 不支持格式 | 任意 | 不支持格式拒绝测试 |
| `xref-main.dwg` | DWG 图纸（含外部参照） | ≤ 50MB | 外部参照检测测试：主文件依赖外部参照 |
| `xref-ref.dwg` | DWG 图纸（外部参照文件） | ≤ 50MB | 外部参照替换测试：作为被依赖的参照文件 |
| `sample.mxweb` | mxweb 文件 | 任意 | 直接从文件树打开图纸测试（跳过上传转换步骤） |

### 字体文件

| 文件名 | 类型 | 用途 |
|--------|------|------|
| `sample.ttf` | TrueType 字体 | 字体上传测试、字体预览测试 |
| `sample.otf` | OpenType 字体 | 字体上传测试（格式兼容性验证） |
| `sample-large.ttf` | TrueType 字体 | 字体上传大小限制测试（超过限制应拒绝） |

---

## 其他种子数据

### 用户管理数据

| 数据 | 说明 |
|------|------|
| **30+ 预建用户** | 用于用户管理页面的分页测试和搜索测试。用户应分布在不同状态（活跃/已注销），具有不同的系统角色 |
| **预建自定义角色** | 用于角色删减检查（有用户关联的角色不可删除提示） |

### 审计日志数据

| 数据 | 说明 |
|------|------|
| **预置审计日志** | 若干条操作记录，覆盖多种操作类型（创建/编辑/删除/登录），用于审计日志页面的浏览、筛选、搜索和分页测试 |

### 运行时配置数据

| 数据 | 说明 |
|------|------|
| **预置运行时配置项** | 若干条配置键值（string/number/boolean/json 类型），覆盖不同分组，包含敏感配置（password/api_key 类，脱敏显示）和非敏感配置 |

---

## 环境要求

运行 E2E 测试前，以下服务必须已启动并可正常访问。

| 服务 | 版本要求 | 说明 |
|------|----------|------|
| **PostgreSQL** | 15+ | 主数据库，存储用户、项目、文件元数据、权限等所有业务数据 |
| **Redis** | 7+ | 缓存服务，用于会话存储、缓存加速、配额状态缓存 |
| **SVN 服务** | 任意 | 版本控制后端，图纸保存和版本管理依赖 SVN。CI 环境需预装 SVN 服务并确保后端可连接 |
| **后端服务** | NestJS (port 3001) | CloudCAD API 服务，前端所有操作的服务端 |
| **前端服务** | Vite Dev Server (port 5173) | CloudCAD 前端应用 |
| **WebGL 支持** | — | CAD 编辑器渲染需要 WebGL 上下文。本地测试使用 `--headed` 模式（有显示器）；CI 环境使用 `xvfb-run`（虚拟帧缓冲）或 `--headed` 模式 |
| **邮件服务（可选）** | — | 注册、忘记密码、邮箱验证等流程依赖邮件发送。若无可使用 mock 或跳过对应测试 |

### CI 环境额外要求

```bash
# 安装依赖
apt-get install -y xvfb subversion

# 启动虚拟显示（无头环境运行 headed 测试）
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99
```

---

## 数据准备顺序建议

1. **启动基础设施**：PostgreSQL → Redis → SVN 服务
2. **运行数据库迁移**：`pnpm prisma migrate deploy`
3. **导入种子数据**：系统角色用户 → 项目角色用户 → 预建项目 → 资源库数据 → 审计日志 → 运行时配置
4. **生成 storageState 文件**：通过 Playwright setup 项目，依次以每个用户身份登录并保存 `storageState`
5. **放置测试文件**：将图纸文件和字体文件放入 `e2e/fixtures/` 目录
6. **启动前后端服务**：确保 `pnpm dev` 正常运行
7. **运行 E2E 测试**：`pnpm exec playwright test`

---

## 相关文档

- [身份权限域测试策略](./domains/identity-auth.md)
- [图纸组织域测试策略](./domains/drawing-organization.md)
- [图纸内容域测试策略](./domains/drawing-content.md)
- [资源库域测试策略](./domains/library.md)
- [系统管理域测试策略](./domains/system-admin.md)
