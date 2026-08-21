
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 导出下载方向（mxweb → 其他格式）VIP 专属功能 — 运行时替换编辑器菜单图标。
 *
 * 不修改静态 ini json（myUiConfig.json / mySketchesAndNotesUiConfig.json），
 * 而是通过 MxPluginContext.getUiConfig() 获取 mxcad 的响应式 uiConfig 对象，
 * 将导出相关菜单项的 icon 字段替换为 VIP 版（命名约定：原 icon 名 + "_vip"，
 * 如 cloudcad-PDF → cloudcad-PDF_vip），mxcad 响应式渲染即时生效。
 *
 * 时机（mxcad-app 源码事实，index.umd.js）：
 * - fetchUiConfig 内部缓存全局 uiConfig（`if (uiConfig) return uiConfig`），
 *   加载完成后包装为 Vue reactive 并触发 `MxFun.callEvent("fetchUiConfigSuccess", uiConfig)`
 * - 草图/批注模式菜单（mMenuData，mySketchesAndNotesUiConfig.json）**不在主 uiConfig 中**，
 *   由 `getSketchAndAnnotationUiConfig()` 单独获取（同样缓存 + reactive，无独立事件）
 * - 因此：① 主配置与草图配置各立即获取一次（已缓存则直接改，未缓存则触发加载）；
 *   ② 订阅 fetchUiConfigSuccess 事件兜底（加载完成时再改一次，幂等）
 *
 * 图标资源由设计侧按约定提供；资源就绪前显示缺失不影响功能（后端仍有门控兜底）。
 *
 * VIP 命令清单（VIP_EXPORT_COMMANDS）与图标替换同源：
 * 命令前置门控（vipCommandGuard）直接复用此清单，保证"换 VIP 图标"与"命令拦截"始终一致。
 *
 * 运行时开关（freeExportDownloadEnabled）：当管理员开放「免费导出下载」时，
 * 免费用户/游客也能直接导出其他格式，此时不再替换 VIP 图标（显示普通图标即可）。
 */
import { queryClient } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';

export function applyVipExportIcons(): void {
  try {
    // 开放免费导出下载时无需替换 VIP 图标（免费用户/游客可直接导出其他格式）
    if (readFreeExportDownloadEnabled()) return;
    const ctx = globalThis.MxPluginContext as {
      getUiConfig?: () => Promise<Record<string, unknown>>;
      getSketchAndAnnotationUiConfig?: () => Promise<Record<string, unknown>>;
    };
    const safeWalk = (uiConfig: unknown): void => {
      walkVipIcons(uiConfig);
    };
    // ① 主配置（myUiConfig.json：mMenuBarData）——已缓存则命中同一 reactive 对象直接改
    ctx?.getUiConfig?.()
      .then(safeWalk)
      .catch((error) => {
        console.warn('[applyVipExportIcons] 获取 uiConfig 失败:', error);
      });
    // ② 草图/批注配置（mySketchesAndNotesUiConfig.json：mMenuData）——独立入口
    ctx?.getSketchAndAnnotationUiConfig?.()
      .then(safeWalk)
      .catch((error) => {
        console.warn('[applyVipExportIcons] 获取草图配置失败:', error);
      });

    // ③ 订阅加载完成事件（幂等兜底：确保配置就绪后图标一定被替换）
    const mxf = (globalThis as Record<string, unknown>).MxFun as
      | {
          on?: (event: string, callback: (uiConfig: unknown) => void) => void;
        }
      | undefined;
    mxf?.on?.('fetchUiConfigSuccess', safeWalk);
  } catch (error) {
    console.warn('[applyVipExportIcons] 初始化失败:', error);
  }
}

/** cmd → VIP 图标的映射（导出格式子项；图标命名约定：原 icon 名 + "_vip"） */
const VIP_CMD_TO_ICON: Record<string, string> = {
  Mx_ExportPDF: 'cloudcad-PDF_vip',
  Mx_ExportDWG: 'cloudcad-DWG_vip',
  Mx_ExportDXF: 'cloudcad-DXF_vip',
};

/**
 * 导出下载方向（mxweb → 其他格式）VIP 专属命令清单。
 *
 * 单一事实来源（single source of truth）：
 * - 此处列举的命令在编辑器中被替换为 VIP 图标（walkVipIcons 的 cmd 分支）
 * - vipCommandGuard 在命令执行前按同源清单做会员前置门控
 * - 后端 FileConversionService 对导出下载方向仍保留接口级门控兜底
 */
export const VIP_EXPORT_COMMANDS: readonly string[] = [
  ...Object.keys(VIP_CMD_TO_ICON),
  'showDWGCutDialog',
  'Mx_PrintDialog',
];

/**
 * 递归遍历 uiConfig（mMenuBarData / mMenuData 共用），按命令/菜单语义
 * 将导出下载方向的图标替换为 VIP 版（幂等：已是 _vip 的节点重复赋同值无害）：
 * - Mx_ExportPDF / Mx_ExportDWG / Mx_ExportDXF（导出格式子项）
 * - showDWGCutDialog（剪切DWG）
 * - 「导出」父项（cloudcad-daochu）、sketches「输出为」（baocun）与「输出」（lingcunweiDWG）
 * - 打印（dayin1，print_to_pdf 属导出下载范畴，与导出 PDF 同待遇）
 * 不触及：另存为/MXWEB（Mx_SaveAs）、保存到云图、打开方向全部。
 */
function walkVipIcons(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(walkVipIcons);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  const cmd = typeof n.cmd === 'string' ? n.cmd : '';
  const tab = typeof n.tab === 'string' ? n.tab : '';
  const icon = typeof n.icon === 'string' ? n.icon : '';

  const vipIcon = VIP_CMD_TO_ICON[cmd];
  if (vipIcon) n.icon = vipIcon;
  else if (cmd === 'showDWGCutDialog' && icon)
    n.icon = 'cloudcad-a-3jianqieDWG_vip';
  else if (tab === '导出' && icon === 'cloudcad-daochu')
    n.icon = 'cloudcad-daochu_vip';
  else if (tab === '输出为' && icon === 'baocun') n.icon = 'baocun_vip';
  else if (tab === '输出' && icon === 'lingcunweiDWG')
    n.icon = 'cloudcad-lingcunweiDWG_vip';
  else if (icon === 'dayin1') n.icon = 'cloudcad-dayin1_vip';

  for (const value of Object.values(n)) walkVipIcons(value);
}

/**
 * 读取运行时开关（freeExportDownloadEnabled）：
 * 复用 React 查询缓存（RuntimeConfigProvider 已预取缓存），与 vipCommandGuard 同构，
 * 未就绪时按未开放处理（保守默认，保持替换 VIP 图标）。
 */
function readFreeExportDownloadEnabled(): boolean {
  try {
    const config = queryClient.getQueryData<{
      freeExportDownloadEnabled?: boolean;
    }>(queryKeys.runtimeConfig.public);
    return config?.freeExportDownloadEnabled ?? false;
  } catch {
    return false;
  }
}
