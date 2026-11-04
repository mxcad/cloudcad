/**
 * 单节点多格式下载命令（评审候选 3 收敛点）。
 *
 * 此前「导出下载会员预检 → 购买引导 → 同步分发」分支散落在 4 个调用点
 * （useLibraryOperations / useDownloadFormatModal / BatchDownloadDialog ×2），
 * 其中 useLibraryOperations 还以一句「与编辑器侧 useDownloadFormatModal.ts:92-104 对齐」
 * 注释口头记录本该是一个函数的契约——四处手写使门控容易漂移。
 *
 * 收敛后：门控预检只有 `assertExportDownloadAllowed` 一处（所有调用点共用），
 * 同步直连下载（会员门控 → 分发 → blob → 浏览器下载 → 成功提示）只有
 * `downloadNodeWithFormat` 一处。异步转换队列（useBatchDownload 的
 * createSingleFormatTask / 批量 zip 打包）与意图链会员结算不在此列——
 * 那是另一机制（服务端并行转换规避反向代理 524 超时 / 挂起链续跑），
 * 保留在各自调用点，仅共用门控。
 */
import {
  downloadControllerDownloadNodeWithFormat,
  libraryControllerDownloadDrawingNode,
  libraryControllerDownloadBlockNode,
} from "@/api-sdk";
import { triggerBlobDownload } from "@/utils/download";
import { sanitizeFileName } from "@/utils/fileUtils";
import { getErrorMessage } from "@/utils/errorHandler";
import { t } from "@/languages";
import {
  canExportDownload,
  handleVipFeatureRequiredError,
} from "@/utils/vipFeatureGuide";
import type {
  DownloadFormat,
  PdfOptions,
  DwgOptions,
} from "@/types/download-format";
import type { ToastType } from "@/components/ui";

export interface DownloadNodeWithFormatOptions {
  nodeId: string;
  /** 展示用文件名（含原扩展名）；下载名由它去掉扩展名后拼 `format` */
  nodeName: string;
  format: DownloadFormat;
  /** 当前用户是否会员（调用方经 useMembership 取到） */
  isVip: boolean;
  /** 运行时开关 freeExportDownloadEnabled（调用方经 useRuntimeConfig 取到） */
  freeExportDownloadEnabled: boolean;
  /** mxweb 且提供库类型时走公开库端点（免登录语义），否则走 download-with-format */
  libraryType?: "drawing" | "block";
  pdfOptions?: PdfOptions;
  dwgOptions?: DwgOptions;
  /**
   * 成功/失败提示回调；不传则静默下载（编辑器侧下载弹窗自身有成功后关闭/提示语义，
   * 不需要「已下载」toast，避免行为变化）。type 必填与调用方 Toast 签名对齐。
   */
  showToast?: (message: string, type: ToastType) => void;
}

export type DownloadNodeResult =
  | { status: "downloaded"; fileName: string }
  | { status: "denied" }
  | { status: "failed"; error: unknown };

/**
 * 导出下载方向（mxweb → 其他格式）会员门控唯一出口。
 *
 * 预检失败（非 VIP 且运行时开关未开放）时统一弹购买/登录引导并返回 false，
 * 调用方应立即 return（不发请求）。后端仍有门控兜底。
 */
export async function assertExportDownloadAllowed(
  requiresExport: boolean,
  isVip: boolean,
  freeExportDownloadEnabled: boolean,
): Promise<boolean> {
  if (!requiresExport) return true;
  if (canExportDownload(isVip, freeExportDownloadEnabled)) return true;
  await handleVipFeatureRequiredError();
  return false;
}

/**
 * 单节点多格式下载（同步直连路径唯一出口）。
 *
 * 流程：会员门控 → 分发（mxweb 走公开库端点或 download-with-format，其余格式走
 * download-with-format）→ 触发浏览器下载 → 成功提示（可选）。返回类型化结果，
 * 调用方按 status 决定后续（关闭弹窗等）；失败不抛出（内部 toast + console.error）。
 *
 * 异步转换队列不走这里——见文件头说明。
 */
export async function downloadNodeWithFormat(
  options: DownloadNodeWithFormatOptions,
): Promise<DownloadNodeResult> {
  const {
    nodeId,
    nodeName,
    format,
    isVip,
    freeExportDownloadEnabled,
    libraryType,
    pdfOptions,
    dwgOptions,
    showToast,
  } = options;

  if (
    !(await assertExportDownloadAllowed(
      format !== "mxweb",
      isVip,
      freeExportDownloadEnabled,
    ))
  ) {
    return { status: "denied" };
  }

  try {
    const result =
      format === "mxweb" && libraryType === "drawing"
        ? await libraryControllerDownloadDrawingNode({
            path: { nodeId },
            parseAs: "blob",
          })
        : format === "mxweb" && libraryType === "block"
          ? await libraryControllerDownloadBlockNode({
              path: { nodeId },
              parseAs: "blob",
            })
          : await downloadControllerDownloadNodeWithFormat({
              path: { nodeId },
              query: { format, ...pdfOptions, ...dwgOptions },
              parseAs: "blob",
            });
    if (result.error) throw result.error;

    const blobData = result.data;
    const blob =
      blobData instanceof Blob
        ? blobData
        : new Blob([blobData as unknown as BlobPart]);
    const fileName =
      sanitizeFileName(nodeName).replace(/\.[^.]+$/, "") + `.${format}`;
    triggerBlobDownload(blob, fileName);
    showToast?.(t("已下载：{fileName}", { fileName }), "success");
    return { status: "downloaded", fileName };
  } catch (error) {
    console.error("下载失败:", error);
    showToast?.(getErrorMessage(error), "error");
    return { status: "failed", error };
  }
}
