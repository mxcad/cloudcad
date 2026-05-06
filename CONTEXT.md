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

