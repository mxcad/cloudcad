import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Copy,
  Check,
  Trash2,
  Loader2,
  Plus,
  ArrowLeft,
  FileText,
  Download,
  Crop,
  Image,
  RotateCcw,
} from "lucide-react";
import { Modal, Button, Select } from "@/components/ui";

import { useNotification } from "../../contexts/NotificationContext";
import { useCopy } from "../../hooks/useCopy";
import { useCADEditorStore } from "../../stores/useCADEditorStore";
import { getErrorMessage } from "../../utils/errorHandler";
import {
  shareControllerCreateShare,
  shareControllerRevokeShare,
  shareControllerListShares,
  shareControllerGetFileShares,
} from "@/api-sdk";
import type { ShareListItemDto } from "@/api-sdk";
import { ConfirmRevokeModal } from "./ConfirmRevokeModal";
import { ExpirationPicker } from "./ExpirationPicker";
import { ShareLinkBar } from "@/components/common/ShareLinkBar";
import {
  ExpirationOption,
  SHARE_CUSTOM_DAYS_DEFAULT,
  SHARE_EXPIRATION_DEFAULT,
  computeExpiresIn,
  formatExpiryDate,
} from "@/constants/share";
import { t } from "@/languages";
import { shareUrl } from "@/utils/shareUrl";
import { API_BASE_URL } from "@/config/apiConfig";
import {
  SHARE_POSTER_DEFAULT_LAYOUT,
  appendShareRegionToUrl,
  type SharePosterLayout,
} from "@cloudcad/platform";
import {
  downloadSharePoster,
  composeSharePosterDataUrl,
} from "@/lib/sharePoster";
import type { ThumbnailRegion } from "../../services/mxcadManager/mxcadThumbnail";
import "./ShareManageDialog.css";

interface ShareListItem {
  token: string;
  url: string;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string;
}

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fileId?: string;
  fileName?: string;
  files?: Array<{ fileId: string; fileName: string }>;
  readOnly?: boolean;
  /** 分享管理页行内「预览分享图片」：打开弹窗后自动预览该分享（null=不自动预览） */
  initialShare?: ShareInfo | null;
}

export interface ShareInfo {
  token: string;
  url: string;
  expiresAt: string | null;
}

interface BatchShareResult {
  fileName: string;
  token: string;
  url: string;
  expiresAt: string | null;
  success: boolean;
  error?: string;
}

export const ShareDialog: React.FC<ShareDialogProps> = ({
  isOpen,
  onClose,
  fileId: propFileId,
  fileName,
  files: propFiles,
  readOnly = false,
  initialShare,
}) => {
  const { currentFileId } = useCADEditorStore();
  const { showToast } = useNotification();

  // 分享管理页通过 files 传入单个文件时没有 fileId/fileName prop，
  // 此时不能回退到编辑器的 currentFileId（管理页未打开图纸时为 null）
  const resolvedFileId =
    propFileId ||
    (propFiles && propFiles.length === 1 ? propFiles[0]?.fileId : undefined) ||
    currentFileId;
  const effectiveFileName =
    fileName ||
    (propFiles && propFiles.length === 1 ? propFiles[0]?.fileName : "") ||
    "";
  const effectiveFiles = useMemo(
    () =>
      propFiles && propFiles.length > 0
        ? propFiles
        : resolvedFileId
          ? [{ fileId: resolvedFileId, fileName: effectiveFileName }]
          : [],
    [propFiles, resolvedFileId, effectiveFileName],
  );
  const isBatch = effectiveFiles.length > 1;

  // 保留显式类型：选择器本身提供「立即过期」档位，状态类型宽于默认值类型
  const [expiration, setExpiration] = useState<ExpirationOption>(
    SHARE_EXPIRATION_DEFAULT,
  );
  const [customDays, setCustomDays] = useState(SHARE_CUSTOM_DAYS_DEFAULT);

  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [batchResults, setBatchResults] = useState<BatchShareResult[]>([]);
  const [loading, setLoading] = useState(false);
  const prevFileIdRef = useRef<string | null>(null);

  const [items, setItems] = useState<ShareListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // 列表行的复制反馈（toast + 行内标记）；主链接与批量结果由 ShareLinkBar 自管
  const {
    copiedMarker: copiedToken,
    copy: copyShareItem,
    reset: resetShareItemCopy,
  } = useCopy({
    successMessage: t("链接已复制"),
    failMessage: t("复制失败"),
  });

  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revoking, setRevoking] = useState(false);

  type ViewMode = "list" | "create" | "created";
  const [view, setView] = useState<ViewMode>("list");

  // 分享图片（海报）下载：布局选择 + 下载中状态
  const [posterLayout, setPosterLayout] = useState<SharePosterLayout>(
    SHARE_POSTER_DEFAULT_LAYOUT,
  );
  const [downloadingPoster, setDownloadingPoster] = useState(false);
  // 指定区域生成缩略图（方案 A：图纸上框选）。null = 整图包围盒（默认）。
  const [posterRegion, setPosterRegion] = useState<ThumbnailRegion | null>(
    null,
  );
  // 框选区域是否与图纸直角方形边框重合（决定海报是否省略圆角描边）。
  // 必须在「框选结束瞬间」算好缓存：viewCoordLong2Cad 读当前实时视图缩放，出图时
  // generatePosterImage 会把视口 zoomW 到区域改变缩放，再算就失真——故只在框选
  // 结束（pickThumbnailRegion 返回）那一刻检测一次，下载/预览一律复用此缓存值。
  const [posterHasBorder, setPosterHasBorder] = useState(false);
  // 海报选项（预览弹框内动态调整）：底部名称 + 二维码大小。
  // 底部名称 = 一个输入框（默认文件名称），**清空即不显示**（footerText=输入框内容或 null）。
  const [footerName, setFooterName] = useState("");
  // 二维码与「扫一扫看图纸」文字一体缩放（0.5~2.0，滑杆步进 0.1，默认 1）
  const [qrScale, setQrScale] = useState(1);
  // 最近一次 generatePosterImage 的高清图纸图 dataUrl：选项调整只重 canvas 合成
  // （composeSharePosterDataUrl），不重新引擎截图（zoomW+createCanvasImageData 很重）。
  const [posterThumbDataUrl, setPosterThumbDataUrl] = useState<string | null>(
    null,
  );
  // 当前预览的二维码内容（选项调整重合成用；列表行预览用该行原始 URL）
  const [previewShareUrl, setPreviewShareUrl] = useState("");
  // 预览：合成海报 dataURL + 加载态 + 框选进行中
  const [showPosterPreview, setShowPosterPreview] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pickingRegion, setPickingRegion] = useState(false);

  // 布局（尺寸/比例）选项：用户拍板「风格=布局尺寸」，默认手机竖版
  const POSTER_LAYOUT_OPTIONS = [
    { value: "phone", label: t("手机竖版") },
    { value: "square", label: t("正方形") },
    { value: "landscape", label: t("横版") },
  ];

  // 分享图片下载（路径 A：当前图纸在屏直接 canvas 生成；失败回落后端已有缩略图）。
  // 仅当分享的文件 = 编辑器当前打开文件时才能直接生成；否则走路径 B（见 ShareTable）。
  const isEditorContext = resolvedFileId === currentFileId;
  // 后端返回相对 path，展示/复制/二维码统一走 platform toShareUrl（两端同一规则）
  const fullUrl = shareUrl(shareInfo?.url);
  /**
   * 解析海报缩略图源：编辑器上下文（且当前文件 = 分享文件）直接出图（可用框选区域），
   * 否则复用后端已有缩略图。返回 thumbnail=null 表示无可用缩略图；hasBorder 决定海报
   * 是否省略圆角描边：编辑器上下文出图时取 generatePosterImage 的判定（默认框恒 true、
   * 框选按算法），后端缩略图/后台渲染回退时恒为整图（默认框）→ 恒 true（不描边）。
   */
  const resolvePosterThumbnail = useCallback(async (): Promise<{
    thumbnail: string | null;
    hasBorder: boolean;
  }> => {
    if (!resolvedFileId) return { thumbnail: null, hasBorder: false };
    let thumbnail: string | null = null;
    // 默认 true（不描边）：回退到后端缩略图/后台渲染时均为整图（默认框），按规则不描边；
    // 仅编辑器上下文出图成功时用 generatePosterImage 的判定覆盖（框选按算法）。
    let hasBorder = true;
    if (isEditorContext) {
      const { generatePosterImage } =
        await import("../../services/mxcadManager/mxcadThumbnail");
      // 海报图纸图用引擎高分辨率 BMP（指定区域只截该区域，整图截包围盒），清晰度远高于 200px 缩略图。
      // 缩略图上传（200px png，文件列表/后台渲染用）与海报截图解耦：由节点保存/另存为/后台渲染
      // 的独立机制上传（saveSequences/backgroundRender/mxcadInstanceManager），此处只出海报图。
      // hasBorder 用框选结束瞬间缓存的 posterHasBorder（实时 viewCoordLong2Cad 在出图
      // zoomW 后会失真，不能在此重算）。
      const posterResult = await generatePosterImage(
        posterRegion,
        posterHasBorder,
      );
      if (posterResult?.dataUrl) {
        thumbnail = posterResult.dataUrl;
        hasBorder = posterResult.hasBorder;
      }
    }
    if (!thumbnail) {
      const { checkThumbnail } =
        await import("../../services/mxcadManager/mxcadThumbnail");
      if (await checkThumbnail(resolvedFileId)) {
        thumbnail = `${API_BASE_URL}/v1/file-system/nodes/${resolvedFileId}/thumbnail`;
      } else {
        // 无缩略图：后台渲染出图（分享管理页路径 B 能力）——ShareDialog 被管理页
        // 行内「预览分享图片」复用时（非编辑器上下文）也能出图，不因「未打开图纸」失败。
        const { renderShareThumbnailInBackground } =
          await import("../../services/mxcadManager/backgroundRender");
        thumbnail = await renderShareThumbnailInBackground(resolvedFileId);
      }
    }
    return { thumbnail, hasBorder };
  }, [resolvedFileId, isEditorContext, posterRegion, posterHasBorder]);

  // 名称/滑杆最新值同步到 ref：rerenderPreview 的 setTimeout 读 ref，避免闭包捕获旧 state
  const posterOptsRef = useRef({
    footerText: undefined as string | null | undefined,
    qrScale: 1,
  });
  posterOptsRef.current = {
    footerText: footerName.trim() || null,
    qrScale,
  };

  /** 用缓存的图纸图 + 当前海报选项重合成预览（选项调整时调用；不重新引擎截图）。 */
  const recomposeSeqRef = useRef(0);
  const rerenderPreview = useCallback(async () => {
    if (!posterThumbDataUrl) return;
    const seq = ++recomposeSeqRef.current;
    try {
      const opts = posterOptsRef.current;
      const next = await composeSharePosterDataUrl({
        shareUrl: previewShareUrl,
        fileName: effectiveFileName,
        thumbnail: posterThumbDataUrl,
        layout: posterLayout,
        scanText: t("扫一扫看图纸"),
        footerText: opts.footerText,
        qrScale: opts.qrScale,
        thumbnailHasBorder: posterHasBorder,
      });
      // 只认最后一次（连续拖动/输入时旧结果晚到不覆盖新图）；保留旧图直到新图就绪，避免闪烁
      if (seq === recomposeSeqRef.current) setPreviewDataUrl(next);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  }, [
    posterThumbDataUrl,
    previewShareUrl,
    effectiveFileName,
    posterLayout,
    posterHasBorder,
    showToast,
    t,
  ]);

  // 名称/滑杆/版式改动 → 250ms 节流重合成（连续拖动只留最后一次，避免每帧引擎级重绘）
  const firstPosterOptsRender = useRef(true);
  useEffect(() => {
    if (firstPosterOptsRender.current) {
      firstPosterOptsRender.current = false;
      return;
    }
    const timer = window.setTimeout(rerenderPreview, 250);
    return () => window.clearTimeout(timer);
    // rerenderPreview 读 posterOptsRef 最新值，无需列入 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [footerName, qrScale, posterLayout]);

  const handleDownloadPoster = useCallback(async () => {
    if (!resolvedFileId || !shareInfo) return;
    setDownloadingPoster(true);
    try {
      const posterResult = await resolvePosterThumbnail();
      if (!posterResult.thumbnail) {
        showToast(t("缩略图生成失败，请先在编辑器中打开该图纸"), "error");
        return;
      }
      await downloadSharePoster(
        {
          // 二维码内容附框选区域：扫码打开后编辑器据此自动 zoom 到该区域
          shareUrl: appendShareRegionToUrl(
            fullUrl,
            posterRegion,
            window.location.origin,
          ),
          fileName: effectiveFileName,
          thumbnail: posterResult.thumbnail,
          layout: posterLayout,
          scanText: t("扫一扫看图纸"),
          footerText: posterOptsRef.current.footerText,
          qrScale: posterOptsRef.current.qrScale,
          thumbnailHasBorder: posterResult.hasBorder,
        },
        `${effectiveFileName || "分享"}-分享图.png`,
      );
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setDownloadingPoster(false);
    }
  }, [
    resolvedFileId,
    shareInfo,
    posterLayout,
    fullUrl,
    effectiveFileName,
    showToast,
    resolvePosterThumbnail,
  ]);

  /** 预览分享图片（合成海报 dataURL 展示，非下载）。share 可选：列表行预览时传入该行分享。 */
  const handlePreviewPoster = useCallback(
    async (share?: ShareInfo) => {
      const info = share ?? shareInfo;
      if (!info) return;
      if (share) setShareInfo(share);
      setShowPosterPreview(true);
      setPreviewLoading(true);
      try {
        const posterResult = await resolvePosterThumbnail();
        if (!posterResult.thumbnail) {
          showToast(t("缩略图生成失败，请先在编辑器中打开该图纸"), "error");
          setPreviewDataUrl(null);
          return;
        }
        // 缓存高清图纸图 + 当前预览的二维码内容：后续海报选项调整只重 canvas 合成
        // （rerenderPreview），不重新引擎截图。每次打开预览，底部名称默认回文件名称。
        setPosterThumbDataUrl(posterResult.thumbnail);
        setFooterName(effectiveFileName);
        const currentPreviewShareUrl = share
          ? shareUrl(info.url)
          : appendShareRegionToUrl(
              shareUrl(info.url),
              posterRegion,
              window.location.origin,
            );
        setPreviewShareUrl(currentPreviewShareUrl);
        setPreviewDataUrl(
          await composeSharePosterDataUrl({
            shareUrl: currentPreviewShareUrl,
            fileName: effectiveFileName,
            thumbnail: posterResult.thumbnail,
            layout: posterLayout,
            scanText: t("扫一扫看图纸"),
            // 刚重置为默认：显示文件名称（footerText 语义：string=自定义/显示）
            footerText: effectiveFileName,
            qrScale: posterOptsRef.current.qrScale,
            thumbnailHasBorder: posterResult.hasBorder,
          }),
        );
      } catch (error) {
        showToast(getErrorMessage(error), "error");
        setPreviewDataUrl(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    [
      shareInfo,
      resolvePosterThumbnail,
      effectiveFileName,
      posterLayout,
      posterRegion,
      showToast,
    ],
  );

  // 分享管理页行内「预览分享图片」：打开弹窗并自动预览指定分享（initialShare）。
  // 用 ref 防重（handlePreviewPoster 依赖变化会重触发 useEffect）；关闭弹窗时复位，
  // 下次再开可重新触发。handlePreviewPosterRef 存最新回调避免陈旧闭包。
  const initialPreviewHandledRef = useRef(false);
  const handlePreviewPosterRef = useRef(handlePreviewPoster);
  handlePreviewPosterRef.current = handlePreviewPoster;
  useEffect(() => {
    if (isOpen && initialShare && !initialPreviewHandledRef.current) {
      initialPreviewHandledRef.current = true;
      setView("created");
      void handlePreviewPosterRef.current(initialShare);
    }
    if (!isOpen) {
      initialPreviewHandledRef.current = false;
    }
    // handlePreviewPoster 经 ref 读取最新回调，无需列入 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialShare]);

  /** 交互式框选区域（方案 A）：getCorner 拖矩形 → 更新区域 → 重出缩略图 + 预览 */
  const handlePickRegion = useCallback(async () => {
    if (!resolvedFileId || !isEditorContext || pickingRegion) return;
    setPickingRegion(true);
    // 关闭预览弹窗让出画布：Modal 遮罩（absolute inset-0 + onPointerDown 关闭）会拦截
    // 画布鼠标事件，getCorner 永远收不到 mousedown。框选完成/取消后重新打开预览。
    setShowPosterPreview(false);
    try {
      const { pickThumbnailRegion } =
        await import("../../services/mxcadManager/mxcadThumbnail");
      const region = await pickThumbnailRegion(
        t("指定缩略图区域，请框选矩形范围"),
      );
      if (!region) return; // 用户 Esc 取消：保留原区域
      setPosterRegion(region);
      // 边框检测必须在「框选结束瞬间」执行并缓存：viewCoordLong2Cad 读当前实时视图缩放，
      // generatePosterImage 内部会把视口 zoomW 到区域改变缩放，再算 tol 就失真。
      // 之后下载/预览一律复用此缓存值（resolvePosterThumbnail），不再重算。
      const { generatePosterImage, detectRegionBorder } =
        await import("../../services/mxcadManager/mxcadThumbnail");
      const hasBorder = await detectRegionBorder(region);
      setPosterHasBorder(hasBorder);
      // 用新区域重出海报图并刷新预览（高清 BMP）；缩略图上传与海报截图解耦（由独立机制上传）
      setPreviewLoading(true);
      const posterResult = await generatePosterImage(region, hasBorder);
      if (posterResult?.dataUrl) {
        setPosterThumbDataUrl(posterResult.dataUrl);
        setPreviewShareUrl(
          appendShareRegionToUrl(fullUrl, region, window.location.origin),
        );
        setPreviewDataUrl(
          await composeSharePosterDataUrl({
            // 二维码内容附框选区域：扫码打开后编辑器据此自动 zoom 到该区域
            shareUrl: appendShareRegionToUrl(
              fullUrl,
              region,
              window.location.origin,
            ),
            fileName: effectiveFileName,
            thumbnail: posterResult.dataUrl,
            layout: posterLayout,
            scanText: t("扫一扫看图纸"),
            footerText: posterOptsRef.current.footerText,
            qrScale: posterOptsRef.current.qrScale,
            thumbnailHasBorder: posterResult.hasBorder,
          }),
        );
      } else {
        showToast(t("缩略图生成失败，请重试"), "error");
      }
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setPreviewLoading(false);
      setPickingRegion(false);
      setShowPosterPreview(true);
    }
  }, [
    resolvedFileId,
    isEditorContext,
    pickingRegion,
    fullUrl,
    effectiveFileName,
    posterLayout,
    showToast,
  ]);

  /**
   * 重置海报：恢复默认（整图内容包围盒、默认版式/二维码大小/底部名称），并用「原本的
   * 默认截图方式」重新截取一张。重置后无区域（默认整图框）→ 恒不描边（hasBorder=true），
   * 不走算法。非编辑器上下文回落后端缩略图/后台渲染（与 resolvePosterThumbnail 同路径，
   * 均为整图默认框 → 不描边）。
   */
  const handleResetPoster = useCallback(async () => {
    if (!resolvedFileId) return;
    setPreviewLoading(true);
    try {
      // 重置全部海报选项为默认
      setPosterRegion(null);
      setPosterLayout(SHARE_POSTER_DEFAULT_LAYOUT);
      setQrScale(1);
      setFooterName(effectiveFileName);
      let thumbnail: string | null = null;
      // 重置后为默认整图框 → 恒不描边；编辑器上下文出图成功时用其判定覆盖（同为 true）
      let hasBorder = true;
      if (isEditorContext) {
        const { generatePosterImage } =
          await import("../../services/mxcadManager/mxcadThumbnail");
        const posterResult = await generatePosterImage(null, undefined);
        if (posterResult?.dataUrl) {
          thumbnail = posterResult.dataUrl;
          hasBorder = posterResult.hasBorder;
        }
      }
      if (!thumbnail) {
        const { checkThumbnail } =
          await import("../../services/mxcadManager/mxcadThumbnail");
        if (await checkThumbnail(resolvedFileId)) {
          thumbnail = `${API_BASE_URL}/v1/file-system/nodes/${resolvedFileId}/thumbnail`;
        } else {
          const { renderShareThumbnailInBackground } =
            await import("../../services/mxcadManager/backgroundRender");
          thumbnail = await renderShareThumbnailInBackground(resolvedFileId);
        }
      }
      if (!thumbnail) {
        showToast(t("缩略图生成失败，请先在编辑器中打开该图纸"), "error");
        setPreviewDataUrl(null);
        return;
      }
      setPosterHasBorder(hasBorder);
      setPosterThumbDataUrl(thumbnail);
      // 重置后无区域：二维码内容不带区域（fullUrl = 基础分享链接）
      setPreviewShareUrl(fullUrl);
      setPreviewDataUrl(
        await composeSharePosterDataUrl({
          shareUrl: fullUrl,
          fileName: effectiveFileName,
          thumbnail,
          layout: SHARE_POSTER_DEFAULT_LAYOUT,
          scanText: t("扫一扫看图纸"),
          footerText: effectiveFileName,
          qrScale: 1,
          thumbnailHasBorder: hasBorder,
        }),
      );
    } catch (error) {
      showToast(getErrorMessage(error), "error");
      setPreviewDataUrl(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [
    resolvedFileId,
    isEditorContext,
    effectiveFileName,
    fullUrl,
    showToast,
    t,
  ]);

  const fetchShares = useCallback(async () => {
    if (!resolvedFileId) return;
    setListLoading(true);
    setListError(null);
    try {
      if (readOnly) {
        const response = await shareControllerGetFileShares({
          path: { fileId: resolvedFileId },
        });
        if (response.error) {
          setListError(
            getErrorMessage(response.error) || t("获取分享链接失败"),
          );
          return;
        }
        const fetched = (response.data as ShareListItem[]) ?? [];
        setItems(fetched);
      } else {
        const result = await shareControllerListShares({
          query: { fileId: resolvedFileId, page: 1, pageSize: 50 },
        });
        if (result.error) {
          setListError(getErrorMessage(result.error) || t("获取分享列表失败"));
          return;
        }
        const data = result.data as { items: ShareListItemDto[] } | undefined;
        const raw = data?.items ?? [];
        const mapped: ShareListItem[] = raw.map((item) => ({
          token: item.token,
          url: item.url,
          expiresAt: (item as Record<string, unknown>).expiresAt as
            string | null,
          createdAt: (item as Record<string, unknown>).createdAt as string,
          createdBy: "",
        }));
        setItems(mapped);
        if (mapped.length === 0 && view === "list") {
          setView("create");
        }
      }
    } catch (err) {
      setListError(getErrorMessage(err) || t("获取分享列表失败"));
    } finally {
      setListLoading(false);
    }
  }, [resolvedFileId, readOnly, view]);

  useEffect(() => {
    if (!isOpen) {
      setShareInfo(null);
      setBatchResults([]);
      prevFileIdRef.current = null;
      setExpiration(SHARE_EXPIRATION_DEFAULT);
      setCustomDays(SHARE_CUSTOM_DAYS_DEFAULT);
      setItems([]);
      setListError(null);
      resetShareItemCopy();
      setView("list");
      return;
    }

    if (!effectiveFiles.length) return;

    if (isBatch) {
      // 批量模式直接进入创建视图（列表视图在批量模式下无内容，缺此切换会白屏）
      if (view !== "create") {
        setView("create");
      }
      return;
    }

    if (resolvedFileId && prevFileIdRef.current !== resolvedFileId) {
      prevFileIdRef.current = resolvedFileId;
      setShareInfo(null);
      setView("list");
    }
    fetchShares();
  }, [
    isOpen,
    effectiveFiles,
    isBatch,
    resolvedFileId,
    fetchShares,
    view,
    resetShareItemCopy,
  ]);

  const createShare = useCallback(async () => {
    if (!resolvedFileId) {
      showToast(t("请先打开图纸"), "error");
      return;
    }

    // expiresIn（秒）统一由 @cloudcad/platform 算：custom 的上下界钳制、
    // 以及「立即过期」= 1 秒，都不在本文件重写一遍。
    const expiresIn = computeExpiresIn(expiration, customDays);

    setLoading(true);
    try {
      const result = await shareControllerCreateShare({
        body: {
          fileId: resolvedFileId,
          ...(expiresIn !== undefined ? { expiresIn } : {}),
        },
      });
      if (result.error) {
        showToast(getErrorMessage(result.error), "error");
        return;
      }
      const raw = result.data as Record<string, unknown> | undefined;
      if (!raw || typeof raw.token !== "string") {
        showToast(t("创建分享链接失败"), "error");
        return;
      }
      const data: ShareInfo = {
        token: raw.token,
        url: raw.url as string,
        expiresAt: raw.expiresAt
          ? typeof raw.expiresAt === "string"
            ? raw.expiresAt
            : new Date(raw.expiresAt as number | string).toISOString()
          : null,
      };
      setShareInfo(data);
      setView("created");
      fetchShares();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  }, [resolvedFileId, expiration, customDays, showToast, fetchShares]);

  const createBatchShares = useCallback(async () => {
    // expiresIn（秒）统一由 @cloudcad/platform 算：custom 的上下界钳制、
    // 以及「立即过期」= 1 秒，都不在本文件重写一遍。
    const expiresIn = computeExpiresIn(expiration, customDays);

    setLoading(true);
    const results: BatchShareResult[] = [];

    for (const file of effectiveFiles) {
      try {
        const result = await shareControllerCreateShare({
          body: {
            fileId: file.fileId,
            ...(expiresIn !== undefined ? { expiresIn } : {}),
          },
        });
        if (result.error) {
          results.push({
            fileName: file.fileName,
            token: "",
            url: "",
            expiresAt: null,
            success: false,
            error: getErrorMessage(result.error),
          });
        } else {
          const raw = result.data as Record<string, unknown> | undefined;
          if (raw && typeof raw.token === "string") {
            results.push({
              fileName: file.fileName,
              token: raw.token,
              url: raw.url as string,
              expiresAt: raw.expiresAt
                ? typeof raw.expiresAt === "string"
                  ? raw.expiresAt
                  : new Date(raw.expiresAt as number | string).toISOString()
                : null,
              success: true,
            });
          } else {
            results.push({
              fileName: file.fileName,
              token: "",
              url: "",
              expiresAt: null,
              success: false,
              error: t("创建分享链接失败"),
            });
          }
        }
      } catch (error) {
        results.push({
          fileName: file.fileName,
          token: "",
          url: "",
          expiresAt: null,
          success: false,
          error: getErrorMessage(error),
        });
      }
      // 实时进度：每完成一个文件更新一次，loading 视图显示 (done/total)
      setBatchResults([...results]);
    }

    setView("created");
    setLoading(false);

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    showToast(
      `${t("已生成 {count} 个分享链接", { count: String(successCount) })}${failCount > 0 ? `，${failCount} ${t("个失败")}` : ""}`,
      failCount > 0 ? "warning" : "success",
    );

    // 全部成功则自动关闭弹框（结果可在分享管理列表查看/复制）；
    // 部分失败时停留结果视图，供用户排查失败项
    if (failCount === 0) {
      onClose();
    }
  }, [effectiveFiles, expiration, customDays, showToast, onClose]);

  const confirmRevokeCurrent = () => {
    if (!shareInfo) return;
    setRevokeTarget(shareInfo.token);
    setShowRevokeConfirm(true);
  };

  const handleRevokeCurrent = async () => {
    if (!shareInfo) return;
    setRevoking(true);
    try {
      const result = await shareControllerRevokeShare({
        path: { token: shareInfo.token },
      });
      if (result.error) {
        showToast(getErrorMessage(result.error), "error");
        return;
      }
      setShareInfo(null);
      setView("list");
      fetchShares();
      showToast(t("分享已撤销"), "success");
      setShowRevokeConfirm(false);
      setRevokeTarget(null);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setRevoking(false);
    }
  };

  const confirmRevokeItem = (token: string) => {
    setRevokeTarget(token);
    setShowRevokeConfirm(true);
  };

  const handleRevokeItem = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const result = await shareControllerRevokeShare({
        path: { token: revokeTarget },
      });
      if (result.error) {
        showToast(getErrorMessage(result.error), "error");
        return;
      }
      setItems((prev) => prev.filter((i) => i.token !== revokeTarget));
      showToast(t("分享已撤销"), "success");
      setShowRevokeConfirm(false);
      setRevokeTarget(null);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setRevoking(false);
    }
  };

  const handleCopyItem = async (linkUrl: string, token?: string) => {
    await copyShareItem(shareUrl(linkUrl), token ?? linkUrl);
  };

  const renderListView = () => (
    <div className="share-dialog-body">
      {!readOnly && !isBatch && (
        <div className="share-dialog-toolbar">
          {effectiveFileName && (
            <span className="share-dialog-toolbar-filename">
              <FileText size={14} />
              {effectiveFileName}
            </span>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setExpiration(SHARE_EXPIRATION_DEFAULT);
              setCustomDays(SHARE_CUSTOM_DAYS_DEFAULT);
              setView("create");
            }}
          >
            <Plus size={14} />
            {t("添加分享")}
          </Button>
        </div>
      )}

      {items.length > 0 && !isBatch && (
        <p className="share-dialog-hint">
          {t("以下列表为该图纸已创建的分享链接")}
        </p>
      )}

      {listLoading ? (
        <div className="share-dialog-loading">
          <Loader2
            size={20}
            className="animate-spin"
            style={{ color: "var(--primary-500)" }}
          />
        </div>
      ) : listError ? (
        <div className="share-dialog-error">
          <p>{listError}</p>
          <Button variant="secondary" size="sm" onClick={fetchShares}>
            {t("重试")}
          </Button>
        </div>
      ) : items.length === 0 && !isBatch ? (
        <div className="share-dialog-empty">
          <p className="share-dialog-empty-title">
            {readOnly
              ? t("当前没有可复制的分享链接")
              : t("还没有分享过这个文件")}
          </p>
          {!readOnly && (
            <Button
              variant="primary"
              size="sm"
              style={{ marginTop: "12px" }}
              onClick={() => {
                setExpiration(SHARE_EXPIRATION_DEFAULT);
                setCustomDays(SHARE_CUSTOM_DAYS_DEFAULT);
                setView("create");
              }}
            >
              {t("添加分享")}
            </Button>
          )}
        </div>
      ) : items.length > 0 ? (
        <div className="share-dialog-table-container">
          <table className="share-dialog-table">
            <thead>
              <tr>
                <th>{t("链接")}</th>
                <th>{t("有效期")}</th>
                <th>{t("操作")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.token}>
                  <td>
                    <div className="share-dialog-link-cell">
                      <span
                        className="share-dialog-link-text"
                        title={shareUrl(item.url)}
                      >
                        {item.url}
                      </span>
                      <button
                        onClick={() => handleCopyItem(item.url, item.token)}
                        className="share-dialog-copy-btn"
                        title={t("复制链接")}
                      >
                        {copiedToken === item.token ? (
                          <Check size={12} />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="share-dialog-td-meta">
                    {formatExpiryDate(item.expiresAt)}
                  </td>
                  <td>
                    <div className="share-dialog-action-cell">
                      {!readOnly && (
                        <Button
                          variant="secondary"
                          size="xs"
                          icon={Image}
                          onClick={() =>
                            handlePreviewPoster({
                              token: item.token,
                              url: item.url,
                              expiresAt: item.expiresAt,
                            })
                          }
                          tooltip={t("预览分享图片")}
                        />
                      )}
                      {!readOnly && (
                        <Button
                          variant="secondary"
                          size="xs"
                          icon={Trash2}
                          onClick={() => confirmRevokeItem(item.token)}
                          tooltip={t("撤销分享")}
                          style={{ color: "var(--error)" }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );

  const renderCreateView = () => {
    if (isBatch) {
      return (
        <div className="share-dialog-create-body">
          <div
            style={{
              maxHeight: "180px",
              overflowY: "auto",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--text-tertiary)",
                marginBottom: "6px",
              }}
            >
              {t("已选择 {count} 个图纸文件", {
                count: String(effectiveFiles.length),
              })}
            </div>
            {effectiveFiles.map((f, i) => (
              <div
                key={f.fileId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 0",
                }}
              >
                <FileText
                  size={13}
                  style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
                />
                <span
                  style={{
                    fontSize: "var(--text-sm)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {i + 1}. {f.fileName}
                </span>
              </div>
            ))}
          </div>

          <div className="share-dialog-create-section">
            <span className="share-dialog-create-label">{t("有效期")}</span>
            <ExpirationPicker
              expiration={expiration}
              onExpirationChange={setExpiration}
              customDays={customDays}
              onCustomDaysChange={setCustomDays}
            />
          </div>

          <Button
            variant="primary"
            onClick={createBatchShares}
            className="share-dialog-action-btn"
          >
            <Plus size={14} />
            {t("批量生成分享链接")}
          </Button>
        </div>
      );
    }

    return (
      <div className="share-dialog-create-body">
        <div className="share-dialog-create-section">
          <span className="share-dialog-create-label">{t("有效期")}</span>
          <ExpirationPicker
            expiration={expiration}
            onExpirationChange={setExpiration}
            customDays={customDays}
            onCustomDaysChange={setCustomDays}
          />
        </div>

        <Button
          variant="primary"
          onClick={createShare}
          className="share-dialog-action-btn"
        >
          {t("生成分享链接")}
        </Button>

        {items.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => setView("list")}
            className="share-dialog-action-btn"
          >
            <ArrowLeft size={14} />
            {t("返回分享列表")}
          </Button>
        )}
      </div>
    );
  };

  const renderCreatedView = () => {
    if (isBatch) {
      return (
        <div className="share-dialog-created-body">
          <div
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              marginBottom: "12px",
              color: "var(--text-primary)",
            }}
          >
            {t("已生成 {count} 个分享链接", {
              count: String(batchResults.filter((r) => r.success).length),
            })}
          </div>

          <div
            style={{
              maxHeight: "360px",
              overflowY: "auto",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
            }}
          >
            {batchResults.map((result, index) => (
              <div
                key={index}
                style={{
                  borderBottom:
                    index < batchResults.length - 1
                      ? "1px solid var(--border-default)"
                      : "none",
                }}
              >
                {result.success ? (
                  <div style={{ padding: "10px 12px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "6px",
                      }}
                    >
                      <FileText
                        size={13}
                        style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
                      />
                      <span
                        style={{
                          fontSize: "var(--text-xs)",
                          fontWeight: 500,
                          color: "var(--text-primary)",
                        }}
                      >
                        {result.fileName}
                      </span>
                    </div>
                    <ShareLinkBar
                      url={shareUrl(result.url)}
                      label={t("复制分享链接")}
                      showHint={false}
                      copyOptions={{
                        successMessage: t("链接已复制"),
                        failMessage: t("复制失败"),
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ padding: "10px 12px", color: "var(--error)" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <FileText size={13} style={{ flexShrink: 0 }} />
                      <span
                        style={{ fontSize: "var(--text-xs)", fontWeight: 500 }}
                      >
                        {result.fileName}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "var(--text-xs)",
                        marginTop: "4px",
                        paddingLeft: "19px",
                      }}
                    >
                      {result.error || t("创建失败")}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div
            className="share-dialog-created-actions"
            style={{ marginTop: "12px" }}
          >
            <Button variant="primary" onClick={onClose} style={{ flex: 1 }}>
              {t("完成")}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="share-dialog-created-body">
        <div className="share-dialog-qr-container">
          <div className="share-dialog-qr-box">
            <QRCodeSVG
              value={fullUrl}
              size={160}
              level="M"
              bgColor="transparent"
              fgColor="var(--text-primary)"
            />
          </div>
        </div>

        <ShareLinkBar url={fullUrl} label={t("复制分享链接")} />

        {shareInfo!.expiresAt && (
          <span className="share-dialog-expiry-hint">
            {t("有效期至: {date}").replace(
              "{date}",
              formatExpiryDate(shareInfo!.expiresAt),
            )}
          </span>
        )}

        {/* 分享图片（海报）：只保留「预览分享图片」入口；版式选择/下载/海报选项在预览弹框内 */}
        <div className="share-dialog-poster-row">
          <Button
            variant="secondary"
            onClick={() => handlePreviewPoster()}
            style={{ flex: 1 }}
          >
            <Image size={14} />
            {t("预览分享图片")}
          </Button>
        </div>

        <div className="share-dialog-created-actions">
          <Button
            variant="secondary"
            onClick={confirmRevokeCurrent}
            disabled={revoking}
            style={{ flex: 1 }}
          >
            {revoking ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            {t("撤销分享")}
          </Button>
          <Button variant="primary" onClick={onClose} style={{ flex: 1 }}>
            {t("完成")}
          </Button>
        </div>
      </div>
    );
  };

  const renderLoadingView = () => {
    if (isBatch) {
      const doneCount = batchResults.length;
      const totalCount = effectiveFiles.length;
      return (
        <div className="share-dialog-loading-view">
          <Loader2
            size={24}
            className="animate-spin"
            style={{ color: "var(--primary-500)" }}
          />
          <span className="share-dialog-loading-text">
            {t("正在生成分享链接... ({current}/{total})", {
              current: String(doneCount),
              total: String(totalCount),
            })}
          </span>
        </div>
      );
    }
    return (
      <div className="share-dialog-loading-view">
        <Loader2
          size={24}
          className="animate-spin"
          style={{ color: "var(--primary-500)" }}
        />
        <span className="share-dialog-loading-text">
          {t("正在生成分享链接...")}
        </span>
      </div>
    );
  };

  return (
    <>
      <Modal
        isOpen={isOpen && !pickingRegion}
        onClose={onClose}
        title={
          readOnly
            ? t("复制分享链接")
            : isBatch
              ? t("批量分享图纸")
              : t("分享图纸")
        }
        size={isBatch ? "md" : readOnly ? "md" : view === "list" ? "md" : "sm"}
      >
        {readOnly ? (
          renderListView()
        ) : isBatch ? (
          <>
            {view === "create" && !loading && renderCreateView()}
            {view === "create" && loading && renderLoadingView()}
            {view === "created" && renderCreatedView()}
          </>
        ) : (
          <>
            {view === "list" && renderListView()}
            {view === "create" && !loading && renderCreateView()}
            {view === "create" && loading && renderLoadingView()}
            {view === "created" && renderCreatedView()}
          </>
        )}
      </Modal>

      <ConfirmRevokeModal
        isOpen={showRevokeConfirm}
        onClose={() => {
          setShowRevokeConfirm(false);
          setRevokeTarget(null);
        }}
        onConfirm={handleRevokeItem}
        loading={revoking}
      />

      {/* 分享图片预览：合成海报 + 指定区域框选（编辑器上下文才可框选） */}
      <Modal
        isOpen={showPosterPreview}
        onClose={() => setShowPosterPreview(false)}
        title={t("预览分享图片")}
        size="md"
        contentClassName="flex flex-col"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={handleResetPoster}
              disabled={previewLoading || downloadingPoster}
              style={{ flex: 1 }}
            >
              <RotateCcw size={14} />
              {t("重置")}
            </Button>
            {isEditorContext && (
              <Button
                variant="secondary"
                onClick={handlePickRegion}
                disabled={pickingRegion || previewLoading}
                style={{ flex: 1 }}
              >
                {pickingRegion ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Crop size={14} />
                )}
                {posterRegion ? t("重新指定区域") : t("指定区域")}
              </Button>
            )}
            <Button
              variant="primary"
              onClick={handleDownloadPoster}
              disabled={downloadingPoster}
              style={{ flex: 1 }}
            >
              {downloadingPoster ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              {t("下载分享图片")}
            </Button>
          </>
        }
      >
        {previewLoading || !previewDataUrl ? (
          <div className="share-dialog-loading-view">
            <Loader2
              size={24}
              className="animate-spin"
              style={{ color: "var(--primary-500)" }}
            />
            <span className="share-dialog-loading-text">
              {t("正在生成预览...")}
            </span>
          </div>
        ) : (
          <div className="share-dialog-preview-body">
            <img
              src={previewDataUrl}
              alt={t("分享图片预览")}
              className="share-dialog-preview-img"
            />
            {posterRegion && (
              <span className="share-dialog-preview-region-hint">
                {t("已按选定区域生成")}
              </span>
            )}
            {/* 海报选项：底部名称（输入框默认文件名称，清空即不显示）+ 二维码大小（文字一体缩放） */}
            <div className="share-dialog-poster-opts">
              {/* 版式（手机竖版/正方形/横版）从弹窗顶部移入预览内部：用户拍板「风格=布局尺寸」 */}
              <div className="share-dialog-poster-opts-row">
                <Select
                  value={posterLayout}
                  onChange={(v) => setPosterLayout(v as SharePosterLayout)}
                  options={POSTER_LAYOUT_OPTIONS}
                  size="sm"
                  wrapperClassName="share-dialog-poster-opts-select"
                />
              </div>
              <div className="share-dialog-poster-opts-row">
                <label className="share-dialog-poster-opts-label">
                  {t("底部名称")}
                </label>
                <input
                  className="share-dialog-poster-opts-input"
                  value={footerName}
                  onChange={(e) => setFooterName(e.target.value)}
                  placeholder={effectiveFileName}
                  maxLength={60}
                />
              </div>
              <div className="share-dialog-poster-opts-row">
                <label className="share-dialog-poster-opts-label">
                  {t("二维码大小")}
                </label>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={qrScale}
                  onChange={(e) => setQrScale(Number(e.target.value))}
                  className="share-dialog-poster-opts-range"
                />
                <span className="share-dialog-poster-opts-value">
                  {Math.round(qrScale * 100)}%
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default ShareDialog;
