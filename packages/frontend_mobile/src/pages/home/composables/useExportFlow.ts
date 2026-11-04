import { ref, watch, computed, type ComputedRef, type Ref } from 'vue';

import { exportDialogTrigger } from '../hooks/useMenu';
import { exportDrawing } from '../../../services/exportService';
import { isExportDownloadAllowedFor } from '../../../services/permissionService';
import {
  beginIntent,
  exportChainDef,
  resumeIntent,
} from '../../../services/intentChain';
import type { DownloadFormatPayload } from '../../shell/components/DownloadFormatPopup.vue';

/**
 * 编辑器「导出」意图的移动端视图（评审候选 5：从 home/index.vue 巨缝抽出的
 * 单一 feature composable，对齐 useSaveAs / useFolderTree 的既有模式）。
 *
 * 职责收敛为三件事：导出闸门（exportAllowed）、格式弹窗开关（showExportFormat /
 * exportFormatLoading）、确认后派发导出（onExportFormatConfirm，含会员门控挂起意图链）。
 * 依赖经 options 注入（user / runtimeConfig / editorState），与页面解耦，
 * 便于单测隔离。
 */
export interface UseExportFlowOptions {
  /** 当前用户（membershipTierLevel / membershipExpiresAt 判 VIP），仅读 .value */
  user: { value: unknown };
  /** 公开运行时配置（freeExportDownloadEnabled 开关），仅读 .value */
  runtimeConfig: { value: { freeExportDownloadEnabled?: boolean } };
  /** 编辑器会话（图纸打开中不续跑挂起链），仅读 .state.loading */
  editorState: { state: { loading: boolean } };
}

export interface UseExportFlowReturn {
  /** 导出下载闸门（VIP 或开关开放才放行） */
  exportAllowed: ComputedRef<boolean>;
  /** 格式弹窗开关 */
  showExportFormat: Ref<boolean>;
  /** 下载进行中：弹窗保持打开、下载按钮转圈 */
  exportFormatLoading: Ref<boolean>;
  /** 确认导出（mxweb 源格式纯前端导出；其他格式先过会员门控） */
  onExportFormatConfirm: (payload: DownloadFormatPayload) => Promise<void>;
}

export function useExportFlow(
  options: UseExportFlowOptions,
): UseExportFlowReturn {
  const { user, runtimeConfig, editorState } = options;

  // 导出闸门翻转（充值成功 → useUser 刷新；管理员开放免费导出 → 配置刷新）
  // → 续跑挂起链。图纸打开中不续跑（document-loaded 锚点）。
  const exportAllowed = computed(() =>
    isExportDownloadAllowedFor(
      user.value,
      runtimeConfig.value.freeExportDownloadEnabled ?? false,
    ),
  );
  watch(exportAllowed, (allowed) => {
    if (!allowed) return;
    if (editorState.state.loading) return;
    resumeIntent();
  });

  // 导出（菜单「导出」→ DownloadFormatPopup，对齐 PC 的 DownloadFormatModal：
  // MXWEB/DWG/DXF/PDF 单选 + DWG 版本 / PDF 宽高与色彩）。
  const showExportFormat = ref(false);
  // 下载进行中：弹窗保持打开、下载按钮转圈（对齐 PC modal 的 loading）
  const exportFormatLoading = ref(false);
  watch(exportDialogTrigger, () => {
    showExportFormat.value = true;
  });

  async function onExportFormatConfirm(payload: DownloadFormatPayload) {
    // MXWEB 是源格式：纯前端导出、不做转换，不走会员门控（与 PC 一致）
    if (
      payload.format !== 'mxweb' &&
      !isExportDownloadAllowedFor(
        user.value,
        runtimeConfig.value.freeExportDownloadEnabled ?? false,
      )
    ) {
      // 闸门未过 → 挂起导出意图链：未登录走登录闸门，已登录走购买引导
      // （确认后跳会员中心，充值/开放免费导出后自动续跑重放本次导出）
      showExportFormat.value = false;
      void beginIntent(exportChainDef(payload));
      return;
    }
    exportFormatLoading.value = true;
    try {
      await exportDrawing(
        payload.format,
        undefined,
        payload.pdfOptions,
        payload.dwgOptions,
      );
    } finally {
      exportFormatLoading.value = false;
    }
    // 完成（成功或失败）后关弹窗：exportDrawing 内部已给出结果 toast
    showExportFormat.value = false;
  }

  return {
    exportAllowed,
    showExportFormat,
    exportFormatLoading,
    onExportFormatConfirm,
  };
}
