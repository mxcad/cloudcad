# CAD 引擎初始化详细流程

> 代码参考：`packages/frontend/src/pages/CADEditorDirect.tsx`, `packages/frontend/src/services/mxcadManager/index.ts`

## 完整初始化链

```
┌─────────────────────────────────────────────────────┐
│ CADEditorDirect.tsx                                  │
│                                                     │
│ 1. loadMxCADDependencies()                           │
│    → 动态导入 mxcadManager                          │
│                                                     │
│ 2. initMxCADConfig(file)                             │
│    → mxcadApp.initConfig({                          │
│        uiConfig, sketchesUiConfig,                   │
│        serverConfig, quickCommandConfig,             │
│        themeConfig                                   │
│      })                                              │
│    → initPrintConfig()         // PDF 打印回调       │
│    → initCutConfig()           // DWG 裁剪回调       │
│    → initCustomUploadConfig()  // 自定义上传回调      │
│                                                     │
│ 3. mxcadManager.initializeMxCADView(fileUrl)         │
│    → buildViewOptions(openFile?)                     │
│    → new MxCADView(viewOptions)                     │
│    → setupInitializationListener()                   │
│    → mxcadView.create()                             │
│                                                     │
│ 4. initThemeSync()                                   │
│    → 拦截 vuetify.theme.change()                     │
│    → 派发 'mxcad-theme-changed' CustomEvent          │
│                                                     │
│ 5. waitForCanvas()                                   │
│    → 等待 2 个 requestAnimationFrame                 │
│    → 确保 canvas 已渲染                              │
│    → 隐藏全局 loading                                │
└─────────────────────────────────────────────────────┘
```

## ViewOptions 构建

```typescript
buildViewOptions(openFile?: string) => {
  rootContainer: document.getElementById('mxcad-global-container'),
  requestHeaders: { Authorization: `Bearer ${token}` },
  extReferenceUrlResolver: async (extRefInfo) => {
    // 根据 extRefInfo.path 构造 URL
    return `${API_BASE}/api/v1/mxcad/filesData/${extRefInfo.path}?v=${version}`;
  },
}
```

## 初始化事件监听

`mxcadApplicationCreatedMxCADObject` 事件触发时：

1. 设置 `isInitialized = true`
2. 挂载 `openFileComplete` 事件监听 → 缩略图生成 + 缓存清理
3. 挂载 `databaseModify` 事件监听 → store `isDirty = true`
4. 2s 后覆盖 `Mx_NewFile` 命令

## 文件打开流程

```typescript
// CADEditorDirect.tsx (fileId 变化时)
1. 解析文件信息（API）
2. 构造 mxweb URL（含 ?t=timestamp 缓存破坏）
3. 外部参照检查 → doOpenMxFile()
4. mxcadManager.initializeMxCADView(fileUrl)
```

底层通过 `MxFun.sendStringToExecute('__openWebFile__', ...)` 实现：

```typescript
MxFun.sendStringToExecute('__openWebFile__', [
  url,          // 文件 URL
  undefined,    // callback (可选)
  true,         // 是否需要鉴权
  authHeaders,  // { Authorization }
  flags,        // FetchAttributes 位掩码 (控制缓存)
]);
```

**超时/重试**：
- 监听 `openFileComplete` 事件
- 60 秒超时 → 失败
- 最多重试 3 次，间隔 1 秒

## 文件保存流程

```typescript
// mxcadManager 命令注册: Mx_Save
MxCpp.App.getCurrentMxCAD()
  .saveFile(fileName, (data: Uint8Array) => {
    // data 包含 .buffer 属性
    // POST /api/v1/mxcad/savemxweb/{nodeId}
    // body: data.buffer
    // headers: { Content-Type: 'application/octet-stream' }
  }, false, false, undefined);
```

## 关于 isDirty

- `databaseModify` 事件 → store 设 `isDirty = true`
- 新建文件时 → store 设 `isDirty = true`
- 保存成功后 → store 设 `isDirty = false`
- 路由离开前检查 isDirty → 确认弹窗

## 配置加载

`initMxCADConfig` 加载前端配置：

```typescript
mxcadApp.initConfig({
  uiConfig: `${configUrl}/ini/myUiConfig.json`,
  sketchesUiConfig: `${configUrl}/ini/mySketchesAndNotesUiConfig.json`,
  serverConfig: `${configUrl}/ini/myServerConfig.json`,
  quickCommandConfig: `${configUrl}/ini/myQuickCommand.json`,
  themeConfig: `${configUrl}/ini/myVuetifyThemeConfig.json`,
});
```

其中 `configUrl` 来自 `packages/frontend/src/config/serverConfig.ts`（从 `GET /public/mxServerConfig.json` 懒加载）。
