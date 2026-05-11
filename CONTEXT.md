# CloudCAD

在线 CAD 协同编辑平台。

## Language

**图纸（Drawing）**:
用户编辑的核心业务实体，即一个 CAD 文件。图纸以 mxweb 格式存在——内存中、保存上传时、以及后端存储的都是 mxweb 二进制数据。
_避免_: 文档、file（在有歧义的上下文中）

**文件节点（FileNode）**:
图纸在文件树中的组织单元，包含父子关系、权限归属、存储路径等元数据。每个文件节点对应一张图纸。
_避免_: 文件夹（folder 是另一种节点类型）

**mxweb 文件**:
图纸的运行时格式。CAD 引擎（MxCADView）操作的是 mxweb 数据，保存时也是将 mxweb 二进制上传到后端。.dwg/.dxf 上传后由后端转换为 .mxweb。

## 关系

- 一张 **图纸** 存储为一个或多个 **文件节点**（版本管理）
- 一个 **文件节点** 引用一条 mxweb 文件路径
- CAD 引擎通过 mxweb URL 加载图纸数据

## 图纸归属

一张图纸有且仅有一种归属：

- **项目（Project）**：文件组织的基本单位。项目包含文件树、成员（按角色控制权限）、元数据。保存需检查 CAD\_SAVE 权限。
- **私人空间（Personal Space）**：一种特殊的项目。创建用户时自动创建，不可删除，没有项目成员（只有所有者一人）。其他行为与项目完全一致。
  - 保存时直接原位覆盖（因为是个人专属，不需要权限检查的兜底逻辑）
  - 路由和交互表现与项目相同
- **资源库（Library）**：公共图纸库（drawing）或图块库（block）。保存需库管理权限，无权限时弹出"另存为"。
  - 无版本管理（不提交 SVN）
  - 保存时直接覆盖 mxweb，不做 dwg/dxf 转换（转换仅在下载/导出时按需执行）
  - 资源库的所有写操作（save、save-as、CRUD）走 `LibraryController` 独立端点

**资源库分类（Library Categories）**：
资源库采用三级文件夹层级作为分类体系，每级对应文件系统中的一个文件夹层级。

- **一级分类 / 二级分类 / 三级分类**：对应文件树中从库根节点向下的三层文件夹。后端通过 PostgreSQL 递归 CTE（`getCategoryTree`）一次性加载全部三层，前端无需多次 API 调用。
- **分类路径（category path）**：用户选择的分类组合，形如 `['all', 'catA', 'all']` 或 `['catA', 'catB', 'all']`。`'all'` 表示该层级选择全部内容。
- **有效节点 ID 解析**：加载列表时，从分类路径右往左找第一个非 `'all'` 的节点作为加载目标。全 `'all'` 表示加载库根节点（所有图纸）。例如 `['all', 'catA', 'all']` → 加载 catA 及所有子分类的图纸。
- **级联过滤**：上位分类选中具体分类时，下位分类仅显示属于该父分类的子项（`CategoryItem.parentId` 匹配）。选中 `'all'` 时显示全部下级分类。

## 用户工作流

1. **打开编辑器**（首页始终是编辑器，不登录也能访问）
2. **打开图纸**（未登录→公共文件服务→哈希访问；已登录→上传/秒传→文件树节点→打开）
3. **编辑图纸**（由 mxcad-app CAD 引擎处理，前端不干预）
4. **保存图纸**（未登录不可保存；已登录判断归属→原位覆盖或另存为）
5. **导出图纸**（未登录不可导出；已登录选择格式→后端生成→下载）
6. **关闭/切换图纸**（检查未保存修改→提示→确认后操作）
7. **直达图纸**（URL 带 `?nodeId=xxx` 或 `?nodeId=xxx&library=drawing` 时跳过欢迎面板，初始化后直接打开指定文件。用于分享和导航）

## 架构分层

CloudCAD 和 mxcad-app 的关系：

```
┌─────────────────────────────────┐
│         CloudCAD（React SPA）    │  
│  ┌───────────────────────────┐  │
│  │  CAD 引擎（mxcad-app）      │  │  ← 作为 npm 依赖导入的黑盒
│  │  MxCADView, MxFun, MxCpp  │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

<br />

- **mxcad-app 是 npm 依赖包**，对外暴露了它内部使用的 vue/vuetify/pinia/axios 等库，CloudCAD 正常 import 即可（Vite 插件代理）。
- **CAD 引擎核心** 通过三个包暴露：
  | 包           | 用途                                                                                          |
  | ----------- | ------------------------------------------------------------------------------------------- |
  | `mxcad-app` | MxCADView 视图容器 + 引擎生命周期管理                                                                   |
  | `mxdraw`    | MxFun——注册 CAD 命令的核心系统。命令可通过用户在 mxcad-app 输入框内键入触发，也可通过 `MxFun.sendStringToExecute()` 代码调用触发 |
  | `mxcad`     | 操作图纸内部一切的低层 API（获取文件名、监听修改事件、等）                                                             |

<br />

## 上传协议（手动分片上传）

Tus 协议已完全移除，当前使用自实现的手动分片上传。

### API 端点（当前）

| 端点 | 用途 |
|------|------|
| `POST /api/v1/mxcad/files/fileisExist` | 秒传检查（文件是否已存在） |
| `POST /api/v1/mxcad/files/chunkisExist` | 检查分片是否已上传 |
| `POST /api/v1/mxcad/files/uploadFiles` | 上传分片 / 合并文件 |
| `POST /api/v1/mxcad/up_ext_reference_dwg/:nodeId` | 上传外部参照 DWG |
| `POST /api/v1/mxcad/up_ext_reference_image` | 上传外部参照图片 |

### 前端上传链路

`MxCadUploader` → `useMxCadUploadNative.selectFiles()` → `calculateFileHash()` → `uploadMxCadFile()` → `mxcadApi.checkFileExist/chunkisExist/uploadFiles` → `POST /api/mxcad/files/*`

冲突策略 `skip/overwrite/rename` 前后端一致，通过 `FormData` 字段传递。

### 后端上传处理

`MxCadController` → `MxCadService` → `ChunkUploadManagerService`（分片检查+触发合并）→ `FileMergeService.mergeConvertFile()`（合并+转换+节点创建+SVN）

### 已完成的清理

- ✅ `@tus/server` / `@tus/file-store` 依赖及 mock 已移除
- ✅ `@uppy/core` / `@uppy/tus` / `tus-js-client` 依赖已移除
- ✅ `MxCadUppyUploader` 组件已移除
- ✅ 前端所有 `uploadFileWithUppy` / `uploadBlobWithTus` / `uploadFilePublic` 调用已替换为 `uploadMxCadFile` 或 `uploadFileWithFormData`
- ✅ `node_modules/.vite/deps/@uppy_*` 构建缓存已清理

## 保存流程

平台只有 mxweb 是核心流通格式。dwg/dxf 仅在下载/导出时按需转换。

| 场景 | 后端路由 | 行为 |
|------|---------|------|
| 覆盖保存（个人/项目） | `POST /mxcad/savemxweb/:nodeId` | 写 mxweb → SVN 提交 → 生成 bin |
| 覆盖保存（资源库） | `POST /library/drawing/save/:nodeId` | 写 mxweb → 跳过 SVN → 跳过 bin |
| 另存为（个人/项目） | `POST /mxcad/save-as` (targetType=personal/project) | 创建节点 → 拷贝 mxweb → SVN 提交（不转换格式） |
| 另存为（资源库） | `POST /mxcad/save-as` (targetType=library) | 创建节点 → 拷贝 mxweb → 跳过 SVN（不转换格式） |

## Flagged ambiguities

- **"文档"（document）**：曾用来指 CAD 引擎内存中的数据，但这个概念不存在。引擎内存中的就是 mxweb 数据，保存后上传的也是 mxweb 二进制。此词应避免使用。
- **"文档标题"（document title）**：`useDocumentTitle` 这个 composable 名称有歧义。它可能不是指浏览器标签页标题，而是 CAD 编辑器内显示当前文件名的头部区域。待确认后重命名。

## 限界上下文（Bounded Contexts）

> 见 [docs/ddd/context-map.md](docs/ddd/context-map.md) — DDD 战略设计产出。

| 限界上下文 | 聚合根 | 包含模块 | 职责 |
|-----------|--------|---------|------|
| **图纸内容上下文** | DrawingSession | mxcad, storage, conversion | 图纸的编辑、格式转换、二进制存储 |
| **图纸组织上下文** | FileNode | file-system, version-control | 文件树结构、权限归属、版本历史 |

**通信方式（当前阶段）：** 直接服务调用（NestJS DI 注入）。后续重构为领域事件驱动。

**聚合关键不变:**
- Drawing 是 FileNode 聚合内的**值对象**，不独立存在
- 一个 FileNode 有且仅有一种归属（Project / Personal Space / Library）
- 非 CAD 文件（外部引用中的图片）属于外部引用专项，不纳入 FileNode 体系
- 支持的图纸格式：DWG、DXF、mxweb（后续可能扩展更多 CAD 格式，但不会是通用文档格式）

## 参考

- [DDD 限界上下文映射图](docs/ddd/context-map.md)
- [SDD 规格文档](docs/sdd/)
- [ADR 0001 - 转换引擎合并](docs/adr/0001-merge-conversion-engine-into-backend.md)
- [ADR 0002 - 解耦 file-operations 模块](docs/adr/0002-decouple-file-operations-module.md)
- [ADR 0003 - IPermissionStore 策略模式解耦权限检查](docs/adr/0003-permission-store-strategy-pattern.md)
- [ADR 0004 - 前端 CSS Z-Index 层级体系](docs/adr/0004-frontend-css-layer-system.md)
- [AI E2E 测试指南](packages/frontend/e2e/guide/AI_E2E_GUIDE.md) — AI 自动生成 Playwright E2E 测试的 prompt 指南，按业务域组织（身份权限/图纸内容/图纸组织/资源库/系统管理）

### 服务职责

| 服务 | 职责 | 所属层 |
|---|---|---|
| **AuthFacadeService** | 认证门面，对外暴露统一 API。**只做委托，不编排业务逻辑。** | 门面 |
| **IAuthProvider** (`AUTH_PROVIDER`) | 认证提供者接口 — 将认证方式抽象为可替换策略。 | 接口 |
| **LocalAuthProvider** | IAuthProvider 默认实现 — 封装所有本地认证：邮箱/密码登录、手机验证码登录/注册、微信登录、Token 刷新。 | Provider |
| **RegistrationService** | 邮箱注册流程 — Redis 暂存待验证信息 + 邮箱验证码激活。 | 子服务 |
| **LoginService** | 账号密码登录 — 邮箱/用户名/手机号三合一登录，含强制验证检查。 | 子服务 |
| **AuthTokenService** | JWT Token 全生命周期 — 签发、刷新、吊销、黑名单。 | 子服务 |
| **AccountBindingService** | 账号绑定 — 邮箱/手机号/微信的绑定、解绑、换绑。 | 子服务 |
| **PasswordService** | 密码管理 — 验证、忘记/重置密码流程。 | 子服务 |

### JWT Cookie

除 Authorization header 外，注册/登录/刷新/验证邮箱时同步设置 `auth_token` httpOnly Cookie，供 `<img>` 等无法携带 header 的请求使用。通过 `AuthController.setAuthCookie()` 私有方法统一设置。

### 配置约定

| 配置键 | 来源 | 用途 |
|---|---|---|
| `jwt.secret` | `JWT_SECRET` 环境变量 → `ConfigService.get('jwt.secret')` | JWT 签名密钥。**禁止**直接用 `'JWT_SECRET'` 作为 config key（代码中已全部统一为 `jwt.secret`）。 |
| `allowRegister` | RuntimeConfig | 全局注册开关 |
| `requireEmailVerification` | RuntimeConfig | 强制邮箱验证 |
| `requirePhoneVerification` | RuntimeConfig | 强制手机号验证 |
| `allowAutoRegisterOnPhoneLogin` | RuntimeConfig | 手机验证码登录时自动创建用户 |

### 架构约束

- `AuthFacadeService` 只做委托，不编排业务逻辑。业务逻辑归属 IAuthProvider 实现或子 Service。
- 类注入使用 Token（`USER_SERVICE`、`AUTH_PROVIDER`），不用具体类，以打破循环依赖。
- `forwardRef` 已在 AuthModule 中移除，模块依赖为单向：AuthModule → UsersModule, CommonModule。
- `session.controller.ts` 已移除 — 前后端均无调用方，功能由 JWT + Cookie 替代。


