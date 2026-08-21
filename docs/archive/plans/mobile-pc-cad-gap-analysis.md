# 移动端 CAD 编辑器 vs PC 端 CAD 编辑器 — 功能差距分析

> **范围**：PC 端 = `CADEditorDirect.tsx` + 协同侧边栏 + 编辑器内模态框；移动端 = `home/index.vue` + 弹窗体系  
> **排除**：PC 端侧边栏图纸文件浏览器（仅对比协同侧边栏）、引擎黑盒内部指令、计费/会员/管理后台等非编辑器功能  
> **日期**：2026-07-07

---

## 一、文件操作对比

| 功能 | PC 端 | 移动端 | 差距 |
|------|-------|--------|------|
| 新建文件 | ✅ Mx_NewFile | ✅ Mx_NewFile | 🟢 对齐 |
| 打开文件（含缓存） | ✅ openFile 命令 | ✅ OpenDwg | 🟢 对齐 |
| 无缓存打开 | ✅ openFile_noCache | ✅ OpenDwg_DoNotUseCache | 🟢 对齐 |
| 保存到云图 | ✅ Mx_SaveToCloud | ✅ Mx_SaveToCloud + commit message | 🟢 对齐 |
| 另存为到云图 | ✅ SaveAsModal（选目标+格式） | ✅ SaveAsSheet（选目标+格式） | 🟢 对齐 |
| 另存为本地 MXWEB | ✅ Mx_SaveAsMxWeb | ✅ Mx_SaveAsMxWeb | 🟢 对齐 |
| 导出 PDF | ✅ PdfExportModal（宽高+颜色） | ✅ PdfOptionsPopup（宽高+颜色） | 🟢 对齐 |
| 导出 DWG | ✅ DwgExportModal（版本选择） | ✅ DwgOptionsPopup（版本选择） | 🟢 对齐 |
| 导出 DXF | ✅ 同 DwgExportModal | ✅ 同 DwgOptionsPopup | 🟢 对齐 |
| 打印 | ✅ Mx_PrintDialog（服务端转换） | ❌ 无 | 🟡 缺失 |
| 剪切 DWG | ✅ showDWGCutDialog | ❌ 无 | 🟡 缺失 |
| 下载格式选择 | ✅ DownloadFormatModal | ✅ SaveAsSheet 内格式选择 | 🟢 对齐 |
| 外部参照上传 | ✅ ExternalReferenceModal | ✅ extRefService 检测+上传 | 🟢 对齐 |
| 文件拖拽打开 | ✅ useFileDropToOpen + DropIndicator | ❌ 不适用（移动端无拖拽） | N/A |
| 键盘快捷键 | ✅ Ctrl+S 拦截等 | ❌ 不适用（无物理键盘） | N/A |

---

## 二、绘图命令对比

| 命令 | PC 端 | 移动端 | 差距 |
|------|-------|--------|------|
| 直线 | ✅ Mx_Line | ✅ m_mx_line | 🟢 |
| 圆 | ✅ Mx_Circle | ✅ m_mx_circle | 🟢 |
| 圆弧 | ✅ Mx_Arc | ✅ m_mx_arc | 🟢 |
| 矩形 | ✅ Mx_Rectang | ✅ m_mx_rect | 🟢 |
| 椭圆 | ✅ Mx_Ellipse / Mx_EllipseArc | ✅ m_mx_elliptical | 🟢 |
| 多段线 | ✅ Mx_Pline | ✅ m_mx_polyline | 🟢 |
| 点 | ✅ Mx_Point | ✅ m_mx_point | 🟢 |
| 手绘线/铅笔 | ✅ MxET_Pencil | ✅ m_mx_et_pencil | 🟢 |
| 插入图片 | ✅ Mx_InsertImageWithUpload | ✅ m_mx_img | 🟢 |
| 多行文本 | ✅ MxPE_DrawMText | ✅ m_mx_text | 🟢 |
| **正多边形** | ✅ Mx_Polygon | ❌ 无 | 🟡 |
| **样条线** | ✅ Mx_Spline | ❌ 无 | 🟡 |
| **插入图块** | ✅ Mx_Insert | ❌ 无 | 🟡 |
| **创建块** | ✅ Mx_Block | ❌ 无 | 🟡 |
| **填充** | ✅ Mx_Hatch | ❌ 无（右侧浮动面板仅有图标） | 🟡 |
| **圆环** | ✅ _donut | ❌ 无 | 🟡 |
| **插入表格** | ✅ Mx_InsertTable | ❌ 无 | 🟡 |
| **单行文字** | ✅ _DrawText | ❌ 无独立命令 | 🟡 |

---

## 三、编辑命令对比

| 命令 | PC 端 | 移动端 | 差距 |
|------|-------|--------|------|
| 删除 | ✅ Mx_Erase | ✅ Mx_Erase | 🟢 |
| 复制 | ✅ Mx_Copy | ✅ m_mx_copy | 🟢 |
| 移动 | ✅ Mx_Move | ✅ m_mx_move | 🟢 |
| 旋转 | ✅ Mx_Rotate | ✅ m_mx_rotate | 🟢 |
| 镜像 | ✅ Mx_Mirror | ✅ m_mx_mirror | 🟢 |
| 偏移 | ✅ Mx_Offset | ✅ m_mx_offset | 🟢 |
| 倒角 | ✅ Mx_Chamfer | ✅ m_mx_chamfer | 🟢 |
| 圆角 | ✅ Mx_Fillet | ✅ m_mx_fillet | 🟢 |
| 修剪 | ✅ Mx_Trim | ✅ m_mx_trim | 🟢 |
| 延伸 | ✅ Mx_Extend | ✅ m_mx_extend | 🟢 |
| 对象颜色 | ✅ Mx_Color | ✅ Mx_SetObjectColor | 🟢 |
| **缩放** | ✅ Mx_Scale | ❌ 无 | 🟡 |
| **阵列** | ✅ Mx_Array | ❌ 无 | 🟡 |
| **拉伸** | ✅ _stretch | ❌ 无 | 🟡 |
| **分解** | ✅ Mx_Explode | ❌ 无 | 🟡 |
| **打断** | ✅ Mx_Break | ❌ 无 | 🟡 |
| **合并** | ✅ Mx_Join | ❌ 无 | 🟡 |
| **离散曲线** | ✅ _SampleCurve | ❌ 无 | 🟡 |
| **置前/后置** | ✅ Mx_DrawOrder×4 | ❌ 无 | 🟡 |

---

## 四、标注对比

| 命令 | PC 端 | 移动端 | 差距 |
|------|-------|--------|------|
| 线性标注 | ✅ _DrawRotatedDimension | ✅ m_mx_linear_marked | 🟢 |
| 对齐标注 | ✅ _DrawAlignedDimension | ✅ m_mx_aligned_marked | 🟢 |
| 角度标注 | ✅ _dimangular | ✅ m_mx_dimangular | 🟢 |
| 半径标注 | ✅ _DrawRadialDimension | ✅ m_mx_radial_dimension | 🟢 |
| 直径标注 | ✅ _DrawDiametricDimension | ✅ m_mx_diametric_dimension | 🟢 |
| **多重引线** | ✅ MxLeaderStyleManager | ❌ 无 | 🟡 |

---

## 五、测量对比

| 命令 | PC 端 | 移动端 | 差距 |
|------|-------|--------|------|
| 测距离 | ✅ _MEASUREGEOM | ✅ m_mx_measuring_length | 🟢 |
| 测面积 | ✅ _MEASUREGEOM AR | ✅ m_mx_measuring_area | 🟢 |
| 测坐标 | ✅ ID | ✅ m_mx_measuring_coordinate | 🟢 |
| 测弧长 | ✅ _MEASUREGEOM | ✅ m_mx_measuring_arc | 🟢 |
| 测角度 | ✅ _MEASUREGEOM A | ✅ m_mx_measuring_angle | 🟢 |
| 测半径 | ✅ _MEASUREGEOM R | ❌ 无独立命令 | 🟡 |

---

## 六、批注对比

| 命令 | PC 端 | 移动端 | 差距 |
|------|-------|--------|------|
| 云线批注 | ✅ _Revcloud | ✅ m_mx_revcloud | 🟢 |
| 箭头标注 | ✅ 批注菜单 | ✅ m_mx_arrow | 🟢 |
| 引线标注 | ✅ 批注菜单 | ✅ m_mx_lead_comment | 🟢 |
| 文字批注 | ✅ 文字命令 | ✅ m_mx_text | 🟢 |
| 图片插入 | ✅ Mx_InsertImageWithUpload | ✅ m_mx_img | 🟢 |
| **审图标注** | ✅ 批注菜单 | ❌ 无 | 🟡 |
| **保存/恢复批注** | ✅ 批注菜单 | ❌ 无 | 🟡 |
| **面积标注** | ✅ BR_AngleMeasure | ❌ 无 | 🟡 |
| **坐标标注** | ✅ 批注菜单 | ❌ 无 | 🟡 |

---

## 七、图层管理对比

| 功能 | PC 端 | 移动端 | 差距 |
|------|-------|--------|------|
| 图层管理器 | ✅ MxLayerManager（完整对话框） | ❌ 无独立管理器 | 🟡 |
| 新建图层 | ✅ 图层工具子菜单 | ✅ new_layer | 🟢 |
| 图层列表 | ✅ 图层管理器内 | ✅ layer_list（FloatingPanel） | 🟢 |
| 关闭图层 | ✅ _SelOffLayer | ✅ close_the_layer | 🟢 |
| 关闭其他 | ✅ 图层工具 | ✅ turn_off_other_layers | 🟢 |
| 全开 | ✅ _OpenAllLayer | ✅ fully_open_layers | 🟢 |
| 全关 | ✅ 图层工具 | ✅ layer_fully_closed | 🟢 |
| 置为当前 | ✅ _layer_putCurrent | ✅ set_current | 🟢 |
| 上一图层 | ✅ _layer_recovery | ✅ restores_the_previous_layer_current | 🟢 |
| **图层漫游** | ✅ showWalkThroughLayers | ❌ 无 | 🟡 |
| **图层锁定/解锁** | ✅ _layer_lock / _layer_unlock | ❌ 无 | 🟡 |
| **图层合并** | ✅ _layer_combined | ❌ 无 | 🟡 |
| **图层删除** | ✅ _layer_remove | ❌ 无 | 🟡 |
| **对象改层匹配** | ✅ _layer_matching | ❌ 无 | 🟡 |
| **对象复制到当前层** | ✅ _layer_setEntToCurrentLayer | ❌ 无 | 🟡 |

---

## 八、协同功能对比

| 功能 | PC 端 | 移动端 | 差距 |
|------|-------|--------|------|
| 创建协同 | ✅ CurrentFilePanel | ✅ CooperatePopup + collabStore | 🟢 |
| 加入协同 | ✅ WorkListPanel + CollabWorkCard | ✅ CooperatePopup + WorkCard | 🟢 |
| 退出协同 | ✅ CollabWorkCard | ✅ WorkCard | 🟢 |
| 分享链接+二维码 | ✅ CollabShareModal | ✅ CollabShareModal | 🟢 |
| 参与者头像展示 | ✅ CollabWorkCard | ✅ AvatarGroup | 🟢 |
| 自动加入（URL） | ✅ CollaborateSidebar | ✅ useCollabAutoJoin（30次重试） | 🟢 |
| 协同状态指示 | ✅ useCADEditorStore | ✅ drawName 计算属性 | 🟢 |
| 协同列表轮询 | ❌ 无（手动刷新） | ✅ 8s 自动轮询 | 🟢 移动端更优 |
| 分享文件打开 | ✅ shareToken 解析 | ✅ useShareFileLoad | 🟢 |
| **协同分享落地页** | ❌ 无独立页 | ✅ ShareLanding 引导页 | 🟢 移动端独有 |

---

## 九、属性/特性/工具对比

| 功能 | PC 端 | 移动端 | 差距 |
|------|-------|--------|------|
| **对象特性面板** | ✅ Mx_Properties（引擎抽屉） | ❌ 无 | 🔴 缺失 |
| **实体属性抽屉** | ✅ EntityAttribute（右侧抽屉） | ❌ 无 | 🔴 缺失 |
| 查找文字 | ✅ Mx_FindText | ✅ m_mx_find_text | 🟢 |
| **快速选择** | ✅ Mx_QuickSelect | ❌ 无 | 🟡 |
| **图纸比对** | ✅ Mx_CompareDWG | ❌ 无 | 🟡 |
| **图形识别** | ✅ Mx_PatternRec | ❌ 无 | 🟡 |
| **代码编辑器** | ✅ Mx_CodeEditor | ❌ 无 | 🟡 |
| **数据库展示** | ✅ Mx_DatabaseDisplay | ❌ 无 | 🟡 |
| **图块库面板** | ✅ BlockLibrary（左侧抽屉） | ❌ 无 | 🟡 |
| 撤销 | ✅ Mx_Undo | ✅ Mx_Undo | 🟢 |
| **重做** | ✅ Mx_Redo | ❌ 无 Redo 按钮 | 🟡 |
| 重绘 | ✅ Mx_Regen | ✅ Mx_Regen | 🟢 |
| 显示全部 | ✅ Mx_ZoomE | ✅ Mx_ZoomE | 🟢 |
| **全屏** | ✅ MxFullScreen | ❌ 无 | 🟡 |
| **视区平移/旋转** | ✅ Mx_Pan / Mx_Plan90CW | ❌ 无 | 🟡 |
| **视区背景色** | ✅ _ViewColor | ❌ 无 | 🟡 |
| **格式设置**（颜色/线型/文字样式/标注样式/点样式） | ✅ 格式菜单 6 项 | ❌ 无（仅颜色选择器） | 🟡 |
| **状态栏**（栅格/正交/极轴/捕捉/追踪/DYN/线宽） | ✅ footerRightBtnSwitchData | ❌ 无 | 🟡 |
| **命令行面板** | ✅ isShowCommandLinePanel | ❌ 无 | 🟡 |

---

## 十、移动端独有功能

| 功能 | 说明 |
|------|------|
| **仿真鼠标** | useSimulatedMouse 触摸仿真十字光标 |
| **命令操作按钮** | useRunCmdOperationBtnList（确认/取消/快捷键） |
| **右侧浮动属性面板** | 线宽/线型/填充图案视觉选择 |
| **历史按钮记忆** | 最近 6 个工具按钮 localStorage |
| **分享落地页** | ShareLanding 引导打开图纸 |
| **Safe Area 适配** | iOS 刘海/底部 bar |
| **布局列表** | Mx_layouts 切换 Model/Paper space |
| **协同自动轮询** | 8s 刷新 work 列表 |
| **Auto-Join 重试** | 30 次重试 + exitGuard 防撞 |
| **参数记忆** | 圆角半径/倒角距离 localStorage |

---

## 十一、差距分级总结

### 🔴 核心缺失（影响编辑能力闭环）

| # | 功能 | PC 端来源 | 移动端现状 |
|---|------|----------|-----------|
| 1 | **对象特性/属性面板** | Mx_Properties + EntityAttribute 抽屉 | ❌ 完全缺失 |
| 2 | **图块插入 + 创建块 + 图块库** | Mx_Insert / Mx_Block / BlockLibrary | ❌ 完全缺失 |
| 3 | **填充** | Mx_Hatch | ❌ 右侧面板仅有图标，无实际功能 |

### 🟡 中等差距（功能存在但简化或缺失）

| # | 功能 | 说明 |
|---|------|------|
| 1 | **图层高级管理** | 缺锁定/解锁/合并/漫游/删除/对象改层 |
| 2 | **编辑命令不完整** | 缺缩放/阵列/拉伸/分解/打断/合并/离散曲线 |
| 3 | **绘图命令不完整** | 缺正多边形/样条线/单行文字/圆环/表格 |
| 4 | **格式设置** | 缺线型/文字样式/标注样式/点样式管理器 |
| 5 | **批注不完整** | 缺审图标注/保存恢复批注/面积标注/坐标标注 |
| 6 | **Redo 重做** | 移动端仅有 Undo 按钮 |
| 7 | **状态栏开关** | 缺栅格/正交/极轴/捕捉/追踪/DYN/线宽 |
| 8 | **打印** | 移动端无打印入口 |
| 9 | **DWG 剪切** | 服务端裁剪功能缺失 |
| 10 | **快速选择** | Mx_QuickSelect 缺失 |
| 11 | **图纸比对** | Mx_CompareDWG 缺失 |
| 12 | **视区控制** | 缺平移/旋转/背景色 |

### 🟢 已对齐（核心编辑体验完整）

- **文件操作**：打开/保存/导出/另存为/外部参照
- **基础绘图**：直线/圆/弧/矩形/椭圆/多段线/点/手绘线/图片/文字
- **基础编辑**：删除/复制/移动/旋转/镜像/偏移/倒角/圆角/修剪/延伸/对象颜色
- **测量**：距离/面积/坐标/弧长/角度
- **标注**：线性/对齐/角度/半径/直径
- **批注**：云线/箭头/引线/文字/图片
- **图层基础**：新建/列表/开关/全开/全关/置为当前/上一图层
- **协同**：创建/加入/退出/分享/自动加入/轮询/分享文件打开
- **其他**：查找文字/版本历史/重绘/显示全部/颜色选择器

---

## 十二、优先级建议

### P0 — 必须补齐（编辑能力闭环）

| # | 功能 | 理由 |
|---|------|------|
| 1 | **对象属性面板** | 选中图元后查看/编辑属性是 CAD 刚需 |
| 2 | **图块插入 + 创建块** | 图块是 CAD 核心复用机制 |
| 3 | **填充** | 剖面线/图案填充是工程图必备 |

### P1 — 建议补齐（专业用户高频）

| # | 功能 | 理由 |
|---|------|------|
| 4 | **图层锁定/解锁/合并** | 复杂图纸管理必备 |
| 5 | **缩放/阵列/分解/打断/合并** | 常用编辑操作 |
| 6 | **Redo 重做** | 与 Undo 配对的基本操作 |
| 7 | **线型/线宽/文字样式设置** | 图纸规范化输出 |

### P2 — 可延后（体验完善）

| # | 功能 | 理由 |
|---|------|------|
| 8 | 打印 / DWG 剪切 / 图纸比对 / 快速选择 | 使用频率较低 |
| 9 | 状态栏开关（栅格/正交/极轴/捕捉） | 移动端触控场景价值有限 |
| 10 | 审图标注 / 保存恢复批注 | 审图多为 PC 场景 |
| 11 | 正多边形 / 样条线 / 圆环 / 表格 | 低频绘图需求 |

---

## 十三、关键文件索引

### PC 端 CAD 编辑器

| 文件 | 作用 |
|------|------|
| `packages/frontend/src/pages/CADEditorDirect.tsx` | 编辑器全局覆盖层，文件加载/保存/导出/打印/主题同步 |
| `packages/frontend/src/components/sidebar/SidebarContainer.tsx` | 侧边栏核心容器 |
| `packages/frontend/src/components/sidebar/SidebarTabBar.tsx` | 侧边栏 Tab 栏（图纸/协同/项目管理） |
| `packages/frontend/src/components/CollaborateSidebar.tsx` | 实时协同主面板 |
| `packages/frontend/src/components/CurrentFilePanel.tsx` | 当前图纸协同状态面板 |
| `packages/frontend/src/components/WorkListPanel.tsx` | 协同列表面板 |
| `packages/frontend/src/components/CollabWorkCard.tsx` | 单个协同会话卡片 |
| `packages/frontend/src/components/CollabShareModal.tsx` | 协同分享弹窗 |
| `packages/frontend/src/components/modals/SaveAsModal.tsx` | 另存为弹窗 |
| `packages/frontend/src/components/modals/PdfExportModal.tsx` | PDF 导出弹窗 |
| `packages/frontend/src/components/modals/DwgExportModal.tsx` | DWG/DXF 导出弹窗 |
| `packages/frontend/src/components/modals/ExternalReferenceModal.tsx` | 外部参照上传弹窗 |
| `packages/frontend/src/services/mxcadManager/index.ts` | 引擎组装层，命令注册/文件上传/保存/导出 |
| `packages/frontend/public/ini/myUiConfig.json` | 引擎 UI 配置（菜单/工具栏/侧边栏/状态栏/抽屉） |

### 移动端 CAD 编辑器

| 文件 | 作用 |
|------|------|
| `packages/frontend_mobile/src/pages/home/index.vue` | 主编辑器页面，顶部工具栏/颜色选择器/命令操作按钮 |
| `packages/frontend_mobile/src/pages/home/components/CooperatePopup.vue` | 协同弹窗 |
| `packages/frontend_mobile/src/pages/home/components/SaveAsSheet.vue` | 另存为底部弹窗 |
| `packages/frontend_mobile/src/pages/home/components/DwgOptionsPopup.vue` | DWG/DXF 导出选项 |
| `packages/frontend_mobile/src/pages/home/components/PdfOptionsPopup.vue` | PDF 导出选项 |
| `packages/frontend_mobile/src/pages/home/components/VersionHistoryPopup.vue` | 版本历史弹窗 |
| `packages/frontend_mobile/src/pages/home/components/CommitMessageDialog.vue` | 保存 commit message |
| `packages/frontend_mobile/src/pages/home/components/LoginPromptPopup.vue` | 登录提示弹窗 |
| `packages/frontend_mobile/src/pages/home/hooks/useMenu.ts` | 顶部菜单 |
| `packages/frontend_mobile/src/pages/home/hooks/useFooterToolbar.ts` | 底部工具栏 |
| `packages/frontend_mobile/src/pages/home/hooks/useEditObjectToolbar.ts` | 图元编辑工具栏 |
| `packages/frontend_mobile/src/pages/home/hooks/useFloatingRightBtnList.ts` | 右侧浮动按钮（线宽/线型/填充） |
| `packages/frontend_mobile/src/pages/home/hooks/useRunCmdOperationBtnList.ts` | 命令操作按钮 |
| `packages/frontend_mobile/src/pages/home/hooks/useSimulatedMouse.ts` | 仿真鼠标 |
| `packages/frontend_mobile/src/composables/useCooperate.ts` | 协同 SDK 封装 |
| `packages/frontend_mobile/src/composables/useCollabAutoJoin.ts` | 自动加入协同 |
| `packages/frontend_mobile/src/composables/useSave.ts` | 保存逻辑 |
| `packages/frontend_mobile/src/composables/useSaveAs.ts` | 另存为逻辑 |
| `packages/frontend_mobile/src/composables/useVersionHistory.ts` | 版本历史 |
| `packages/frontend_mobile/src/composables/useFileLoader.ts` | 文件加载 |
| `packages/frontend_mobile/src/composables/useShareFileLoad.ts` | 分享文件加载 |
| `packages/frontend_mobile/src/composables/useNativeFilePicker.ts` | 原生文件选择器 |
| `packages/frontend_mobile/src/command/index.ts` | 命令注册入口 |
| `packages/frontend_mobile/src/stores/editor.ts` | 编辑器状态 |
| `packages/frontend_mobile/src/stores/collab.ts` | 协同状态 |
| `packages/frontend_mobile/src/components/FloatingPopup.vue` | 底部抽屉弹窗基类 |
| `packages/frontend_mobile/src/components/WorkCard.vue` | 协同会话卡片 |
| `packages/frontend_mobile/src/components/AvatarGroup.vue` | 头像组 |
| `packages/frontend_mobile/src/components/CollabShareModal.vue` | 协同分享弹窗 |
| `packages/frontend_mobile/src/components/MxToolbar.vue` | 工具栏组件 |
| `packages/frontend_mobile/public/mxUIConfig.json` | 引擎 UI 配置 |
