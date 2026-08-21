# Editor

CAD 编辑器的前端 UI，有 PC（React 19）和移动端 H5（Vue 3）两种实现，共享同一 API SDK 和 V3 协同协议。

## Language

**CADEditorDirect**:
编辑器页面的编排组件。协调文件加载、导出（PDF/DWG/DXF）、外部参照上传、协同分享、拖放打开、主题/i18n 同步——通过 hooks 委派各职责。全局单例，在 `<Routes>` 之外渲染，通过 visibility + z-index 跨路由保持 WebGL 上下文。
_Avoid_: 编辑器组件、editor overlay

**mxcadManager**:
CAD 引擎的装配层/门面。统一管理 mxcad-app npm 包的生命周期、命令注册（通过 CommandRegistry）、文件操作、导出、协同退出、导航和 WebGL 上下文保持。React 通过它操作引擎，不直接接触 mxcad-app。内部以命令模式组织（每个命令实现 Command 接口），index.ts 仅做重新导出和桥接注册。
_Avoid_: CAD 引擎、mxcad、适配器（它是门面，不是适配器）

**CollaborateSidebar**:
实时协同面板，展示参与者列表、work 会话、分享入口。
_Avoid_: 协同面板、协作面板

**Tour**:
可组合的用户引导系统，含条件分支、权限门控步骤、跨页面跳转。配置在 `config/tours/` 下。
_Avoid_: 向导、新手指引

**FloatingPopup**:
移动端底部抽屉式弹窗的基类组件。CooperatePopup、SaveAsSheet、VersionHistoryPopup 均继承自它。PC 端使用 Modal 组件替代。
_Avoid_: BottomSheet、Drawer

**useCollabAutoJoin**:
移动端独有的协同自动加入逻辑——URL 携带 collabWorkId 时，在引擎初始化后自动重试加入（最多 30 次），退出后 3s 保护间隔防止误重连。
_Avoid_: auto-join 逻辑

**滚动分页控制器（useScrollPagination）**:
前端滚动分页统一逻辑（ADR-0050）。四场景共用：我的图纸、项目管理、公开资源库（FileListGrid → FileSystemContent）、CAD 编辑器侧边栏图纸库/图块库（ResourceList）。统一承载：预加载边界触发（`max(300, clientHeight×0.6)`）、页码指示 visiblePage、滚动位置恢复（prev 前插锚定 / jump 跳页居中 / pageSize 回顶）、内容不足视口自动填充、加载指示派生（showBottomLoader/showTopLoader/isLastPage）。数据合并走 `mergeNodesByMode` 纯函数（useAccumulatedPagination 管理页面 + useLibraryLoader 侧边栏共用）。
_Avoid_: 无限滚动、滚动加载、loadDirection（外部方向状态已废除）

**sourceType**:
文件的协同来源归属，取值 'my' | 'project' | 'library' | 'local' | 'share'。前后端共享 V3 协议，移动端与 PC 端编码解码逻辑完全一致。
_Avoid_: 来源类型
