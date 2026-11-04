import React, { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/languages";
import { Modal, Button, Input, Select } from "@/components/ui";

import { ImagePlus, FileUp, FileText, Link as LinkIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRuntimeConfig } from "@/contexts/RuntimeConfigContext";
import { useNotification } from "@/contexts/NotificationContext";
import { useCopy } from "@/hooks/useCopy";
import { getErrorMessage } from "@/utils/errorHandler";
import {
  FEEDBACK_TYPE_OPTIONS,
  FEEDBACK_REWARD_RULE,
} from "@/constants/feedback";
import { useFeedbackSubmit } from "@/hooks/feedback/useFeedbackSubmit";
import { useFeedbackAttachments } from "@/hooks/feedback/useFeedbackAttachments";
import { mxcadManager } from "@/services/mxcadManager/mxcadManager";
import {
  RichtextEditor,
  type RichtextEditorHandle,
} from "@/components/richtext";
import { toPersistableHtml, stripHtmlTags } from "@/components/richtext";
import { FeedbackQueryModal } from "@/components/feedback/FeedbackQueryModal";
import { SelectFileModal } from "@/components/modals/SelectFileModal";
import type {
  SelectedFile,
  CurrentDrawingOption,
} from "@/components/modals/SelectFileModal";
import { encodeShareRegion, type ShareRegion } from "@cloudcad/platform";
import {
  generatePosterImage,
  pickThumbnailRegion,
} from "@/services/mxcadManager/mxcadThumbnail";
import type { FeedbackAttachmentDto, SubmitFeedbackResultDto } from "@/api-sdk";
import { saveLocalFeedbackRecord } from "@/lib/feedbackLocalRecords";
import { calculateFileHash } from "@/utils/hashUtils";
import { findDuplicateByContentHash } from "@/components/feedback/attachmentActions";

interface FeedbackSubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DRAWING_EXTENSIONS = [".mxweb", ".dwg", ".dxf"];
/** 前端本地去重阈值：小于等于此大小的文件先算 hash 查当前列表（命中则不发起上传）；
 *  大文件跳过前端计算（读全文件卡 UI），交给后端内容寻址去重（不重复落盘）。 */
const FRONTEND_DEDUP_MAX_BYTES = 20 * 1024 * 1024;
/** 文档按钮 accept（与移动端 DOC_ACCEPT 一致，含图片扩展名保持两端同形） */
const DOC_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.zip,.rar,.7z,.png,.jpg,.jpeg,.gif,.webp,.bmp";
const IMAGE_MIME_PREFIX = "image/";

function isDrawingFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return DRAWING_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function formatSize(size: number): string {
  const mb = size / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)}MB`;
  return `${(size / 1024).toFixed(0)}KB`;
}

/**
 * 提交反馈弹窗（PC 端唯一入口）。
 *
 * 反馈内容为富文本（RichtextEditor）：文字 + 行内图片 + 附件卡片（图纸/文档）。
 * - 粘贴/拖拽图片或文件：直接插入到文本编辑器光标处；
 * - 「上传图片」「上传图纸」「引用当前图纸」按钮：同样插入到光标处；
 * - 提交时 content 为净化 HTML（toPersistableHtml），附件 id 一并绑定。
 * - 登录：以当前账号身份提交；未登录：可匿名（受开关与每日限额约束）。
 */
export const FeedbackSubmitModal: React.FC<FeedbackSubmitModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { isAuthenticated } = useAuth();
  const { config } = useRuntimeConfig();
  const { showToast } = useNotification();
  const { submitting, submit } = useFeedbackSubmit();
  const { uploadFileAttachment, uploadDrawingFile, registerDrawing } =
    useFeedbackAttachments();

  const editorRef = useRef<RichtextEditorHandle>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const drawingInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  // 图片附件 id → 本地 objectURL（仅图片；表单重置时统一 revoke，防泄漏）
  const previewUrls = useRef<Map<string, string>>(new Map());

  const [type, setType] = useState("SUGGESTION");
  const [title, setTitle] = useState("");
  const [contact, setContact] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitFeedbackResultDto | null>(null);
  const [attachments, setAttachments] = useState<FeedbackAttachmentDto[]>([]);
  const [uploading, setUploading] = useState(false);
  // 实时字数（stripHtmlTags 后的纯文本长度），label 旁展示，超 max 变红
  const [contentLen, setContentLen] = useState(0);
  // 查询进度弹窗独立开关：提交弹窗内「查询进度」入口打开，两框平级互不嵌套
  const [queryOpen, setQueryOpen] = useState(false);
  // 查询进度弹窗预填的查询码（成功视图「查询进度」入口带码打开）
  const [queryCode, setQueryCode] = useState<string | null>(null);
  // 引用图纸选择弹框：登录=空间树+当前图纸快捷项；未登录=仅当前图纸
  const [pickerOpen, setPickerOpen] = useState(false);
  // 反馈类型选项：渲染期走 t() 按当前语言取值（模块级烘焙会在 en-US pack 未就绪时
  // 回退 zh-CN 且切语言后不刷新，同 AdminBillingPage/constants.ts 的 labelKey 约定）
  const typeOptions = FEEDBACK_TYPE_OPTIONS.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  }));
  // 指定区域框选进行中：临时隐藏主弹框（hidden 保留 DOM，不丢非受控富文本内容），
  // 让出画布给 getCorner 框选；框选成功/取消/失败后恢复。与分享海报同款交互。
  const [pickingRegion, setPickingRegion] = useState(false);

  const copy = useCopy({
    successMessage: t("查询码已复制"),
    failMessage: t("复制失败"),
  });

  const minLen = config.feedbackMinContentLength;
  const maxLen = config.feedbackMaxContentLength;

  const reset = useCallback(() => {
    setType("SUGGESTION");
    setTitle("");
    setContact("");
    setLocalError(null);
    setResult(null);
    setAttachments([]);
    setQueryOpen(false);
    setQueryCode(null);
    setPickerOpen(false);
    setContentLen(0);
    for (const url of previewUrls.current.values()) URL.revokeObjectURL(url);
    previewUrls.current.clear();
    editorRef.current?.clear();
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const addAttachment = useCallback((att: FeedbackAttachmentDto) => {
    setAttachments((prev) => [...prev, att]);
  }, []);

  /**
   * 前端本地去重：算文件 MD5，命中当前附件列表（同内容已上传）→ 直接复用已有附件
   * 重新插入编辑器，不发起上传；返回是否已复用。命中即提示用户。
   */
  const tryReuseByHash = useCallback(
    async (file: File): Promise<boolean> => {
      const hash = await calculateFileHash(file);
      const dup = findDuplicateByContentHash(attachments, hash);
      if (!dup) return false;
      const name = file.name;
      if (dup.type === "IMAGE") {
        const src =
          previewUrls.current.get(dup.id) ||
          dup.thumbnailUrl ||
          dup.viewUrl ||
          dup.downloadUrl;
        if (src) {
          editorRef.current?.insertImage({
            src,
            attachmentId: dup.id,
            alt: name,
          });
        } else {
          editorRef.current?.insertAttachmentCard({
            kind: "FILE",
            label: name,
            attachmentId: dup.id,
          });
        }
      } else {
        editorRef.current?.insertAttachmentCard({
          kind: dup.type === "DRAWING" ? "DRAWING" : "FILE",
          label: name,
          attachmentId: dup.id,
        });
      }
      showToast(t("检测到相同文件，已直接引用，无需重复上传"));
      return true;
    },
    [attachments, showToast],
  );

  /** 上传前数量上限校验（总数 + 分类型），超限 toast 并返回 false */
  const checkAttachmentLimit = useCallback(
    (type: "IMAGE" | "DOCUMENT" | "DRAWING"): boolean => {
      if (attachments.length >= config.feedbackMaxAttachmentCount) {
        showToast(t("附件总数已达上限，请先删除部分附件"));
        return false;
      }
      const count = attachments.filter((a) => a.type === type).length;
      const max =
        type === "IMAGE"
          ? config.feedbackMaxImageCount
          : type === "DOCUMENT"
            ? config.feedbackMaxDocumentCount
            : config.feedbackMaxDrawingCount;
      if (count >= max) {
        showToast(
          type === "IMAGE"
            ? t("图片附件数量已达上限")
            : type === "DOCUMENT"
              ? t("文档附件数量已达上限")
              : t("图纸附件数量已达上限"),
        );
        return false;
      }
      return true;
    },
    [attachments, config, showToast],
  );

  /** 上传图片 → 在光标处插入行内图片（本地预览 URL + 附件 id 水合标记） */
  const handleUploadImage = useCallback(
    async (file: File) => {
      if (file.size > config.feedbackMaxImageSize * 1024 * 1024) {
        showToast(
          t("图片大小超过上限（最大 {size}）", {
            size: formatSize(config.feedbackMaxImageSize * 1024 * 1024),
          }),
        );
        return;
      }
      if (!checkAttachmentLimit("IMAGE")) return;
      setUploading(true);
      try {
        // 前端去重：小文件算 hash 查当前列表，命中直接复用（省一次上传）
        if (
          file.size <= FRONTEND_DEDUP_MAX_BYTES &&
          (await tryReuseByHash(file))
        ) {
          return;
        }
        const previewUrl = URL.createObjectURL(file);
        const att = await uploadFileAttachment(file);
        if (att.deduped) {
          showToast(t("检测到相同文件，已直接引用，无需重复上传"));
        }
        previewUrls.current.set(att.id, previewUrl);
        editorRef.current?.insertImage({
          src: previewUrl,
          attachmentId: att.id,
          alt: file.name,
        });
        addAttachment(att);
      } catch (err) {
        showToast(getErrorMessage(err));
      } finally {
        setUploading(false);
      }
    },
    [
      config,
      uploadFileAttachment,
      addAttachment,
      checkAttachmentLimit,
      showToast,
      tryReuseByHash,
    ],
  );

  /** 上传本地图纸 → 在光标处插入图纸卡片 */
  const handleUploadDrawing = useCallback(
    async (file: File) => {
      if (file.size > config.feedbackMaxDrawingSize * 1024 * 1024) {
        showToast(
          t("图纸大小超过上限（最大 {size}）", {
            size: formatSize(config.feedbackMaxDrawingSize * 1024 * 1024),
          }),
        );
        return;
      }
      if (!checkAttachmentLimit("DRAWING")) return;
      setUploading(true);
      try {
        if (
          file.size <= FRONTEND_DEDUP_MAX_BYTES &&
          (await tryReuseByHash(file))
        ) {
          return;
        }
        const att = await uploadDrawingFile(file);
        if (att.deduped) {
          showToast(t("检测到相同文件，已直接引用，无需重复上传"));
        }
        editorRef.current?.insertAttachmentCard({
          kind: "DRAWING",
          label: file.name,
          attachmentId: att.id,
        });
        addAttachment(att);
      } catch (err) {
        showToast(getErrorMessage(err));
      } finally {
        setUploading(false);
      }
    },
    [
      config,
      uploadDrawingFile,
      addAttachment,
      checkAttachmentLimit,
      showToast,
      tryReuseByHash,
    ],
  );

  /** 上传本地文档 → 在光标处插入文档卡片 */
  const handleUploadDocument = useCallback(
    async (file: File) => {
      if (file.size > config.feedbackMaxDocumentSize * 1024 * 1024) {
        showToast(
          t("文档大小超过上限（最大 {size}）", {
            size: formatSize(config.feedbackMaxDocumentSize * 1024 * 1024),
          }),
        );
        return;
      }
      if (!checkAttachmentLimit("DOCUMENT")) return;
      setUploading(true);
      try {
        if (
          file.size <= FRONTEND_DEDUP_MAX_BYTES &&
          (await tryReuseByHash(file))
        ) {
          return;
        }
        const att = await uploadFileAttachment(file);
        if (att.deduped) {
          showToast(t("检测到相同文件，已直接引用，无需重复上传"));
        }
        editorRef.current?.insertAttachmentCard({
          kind: "FILE",
          label: file.name,
          attachmentId: att.id,
        });
        addAttachment(att);
      } catch (err) {
        showToast(getErrorMessage(err));
      } finally {
        setUploading(false);
      }
    },
    [
      config,
      uploadFileAttachment,
      addAttachment,
      checkAttachmentLimit,
      showToast,
      tryReuseByHash,
    ],
  );

  /** 粘贴/拖拽到编辑器的文件：图片 MIME → 图片；图纸扩展名 → 图纸；其余 → 文档 */
  const handleEditorFiles = useCallback(
    async (files: File[]) => {
      if (uploading) return;
      for (const file of files) {
        if (file.type.startsWith(IMAGE_MIME_PREFIX)) {
          await handleUploadImage(file);
        } else if (isDrawingFile(file)) {
          await handleUploadDrawing(file);
        } else {
          await handleUploadDocument(file);
        }
      }
    },
    [uploading, handleUploadImage, handleUploadDrawing, handleUploadDocument],
  );

  /** 托盘 chip 点击主体 → 把已有附件重新插入编辑器（无需重新上传） */
  const reinsertAttachment = useCallback((att: FeedbackAttachmentDto) => {
    const name = att.fileName ?? (att.type === "IMAGE" ? "图片" : "附件");
    if (att.type === "IMAGE") {
      const src =
        previewUrls.current.get(att.id) ||
        att.thumbnailUrl ||
        att.viewUrl ||
        att.downloadUrl;
      if (src) {
        editorRef.current?.insertImage({
          src,
          attachmentId: att.id,
          alt: name,
        });
      } else {
        // 无任何可用预览地址时降级为卡片，仍保留附件引用
        editorRef.current?.insertAttachmentCard({
          kind: "FILE",
          label: name,
          attachmentId: att.id,
        });
      }
      return;
    }
    editorRef.current?.insertAttachmentCard({
      kind: att.type === "DRAWING" ? "DRAWING" : "FILE",
      label: name,
      attachmentId: att.id,
    });
  }, []);

  /** 托盘 chip × → 从编辑器移除该附件全部节点 + 从托盘移除 + 释放 objectURL */
  const removeAttachmentFromTray = useCallback((att: FeedbackAttachmentDto) => {
    editorRef.current?.removeAttachment(att.id);
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    const url = previewUrls.current.get(att.id);
    if (url) {
      URL.revokeObjectURL(url);
      previewUrls.current.delete(att.id);
    }
  }, []);

  /** 当前打开图纸快捷项（登录=云图节点；未登录=hash 当前图纸） */
  const getCurrentDrawingOption =
    useCallback((): CurrentDrawingOption | null => {
      const current = mxcadManager.getCurrentFileInfo();
      if (!current) return null;
      if (!current.fileId && !current.fileHash) return null;
      return {
        nodeId: current.fileId || undefined,
        fileHash: current.fileHash || undefined,
        name: current.name || "当前图纸",
        // 引擎实例在当前页面时才能生成/指定区域缩略图；生成失败会 catch 降级为仅下载
        thumbnailCapable: true,
      };
    }, []);

  /** 引用图纸：打开选择弹框（登录=空间树+当前图纸快捷项；未登录=仅当前图纸） */
  const handleReferenceDrawing = useCallback(async () => {
    if (uploading) return;
    setPickerOpen(true);
  }, [uploading]);

  /** blob → base64 dataURL */
  const blobToDataURL = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }, []);

  /** 选中图纸 → 生成/取缩略图 dataURL + 框选区域（region 用于查看链接定位）。 */
  const resolveThumbnailData = useCallback(
    async (
      picked: SelectedFile,
    ): Promise<{ dataUrl?: string; region?: ShareRegion }> => {
      // 指定区域（当前图纸，登录云图节点或未登录 hash 都一样）：引擎内橡皮筋框选区域
      // 生成高清缩略图，与分享海报出图同一套 MxCADUtility.getCorner 框选。
      if (picked.pickRegion) {
        // 隐藏主弹框让出画布：Modal 遮罩（fixed inset-0）会拦截画布鼠标事件，
        // getCorner 永远收不到 mousedown。框选成功/取消/失败后恢复。与 ShareDialog 同款。
        setPickingRegion(true);
        try {
          const region = await pickThumbnailRegion();
          const poster = await generatePosterImage(region);
          return {
            dataUrl: poster?.dataUrl || undefined,
            region: region ?? undefined,
          };
        } finally {
          setPickingRegion(false);
        }
      }
      // 未登录当前图纸（hash，无 nodeId）：引擎内生成整图缩略图
      if (picked.isCurrent && !picked.fileId) {
        const poster = await generatePosterImage();
        return { dataUrl: poster?.dataUrl || undefined };
      }
      // 云图节点（含当前云图）：取节点缩略图 → base64
      if (picked.thumbnailUrl) {
        try {
          const resp = await fetch(picked.thumbnailUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            return { dataUrl: await blobToDataURL(blob) };
          }
        } catch {
          // 无缩略图：忽略，卡片仅下载
        }
      }
      return {};
    },
    [blobToDataURL],
  );

  /** 弹框确认 → 引用图纸（统一转真实附件副本）→ 插入图纸卡片 */
  const handleConfirmPickDrawing = useCallback(
    async (files: SelectedFile[]) => {
      const picked = files[0];
      if (!picked) return;
      setPickerOpen(false);
      if (uploading) return;
      setUploading(true);
      try {
        let thumbnailData: string | undefined;
        let region: ShareRegion | undefined;
        try {
          const resolved = await resolveThumbnailData(picked);
          thumbnailData = resolved.dataUrl;
          region = resolved.region;
        } catch {
          thumbnailData = undefined; // 缩略图生成失败不阻断引用
        }
        const att = await registerDrawing({
          nodeId: picked.fileId || undefined,
          fileHash: picked.fileHash,
          fileName: picked.fileName,
          thumbnailData,
          // 框选区域：编码为 "x1,y1,x2,y2" 存附件，查看链接据此带 ?region= 定位
          region: encodeShareRegion(region) ?? undefined,
        });
        if (att.deduped) {
          showToast(t("检测到相同文件，已直接引用，无需重复上传"));
        }
        editorRef.current?.insertAttachmentCard({
          kind: "DRAWING",
          label: picked.fileName,
          attachmentId: att.id,
        });
        addAttachment(att);
      } catch (err) {
        showToast(getErrorMessage(err));
      } finally {
        setUploading(false);
      }
    },
    [
      uploading,
      resolveThumbnailData,
      registerDrawing,
      addAttachment,
      showToast,
    ],
  );

  const handleSubmit = useCallback(async () => {
    setLocalError(null);

    const trimmedTitle = title.trim();
    const html = toPersistableHtml(editorRef.current?.getHTML() ?? "");
    const textContent = stripHtmlTags(html);
    // 弹窗内容区可滚动，错误除内联外再 toast 一次，保证不滚动也可见
    if (!trimmedTitle) {
      const msg = t("请填写反馈标题");
      setLocalError(msg);
      showToast(msg);
      return;
    }
    if (textContent.length < minLen) {
      const msg = t("反馈内容至少 {n} 个字", { n: minLen });
      setLocalError(msg);
      showToast(msg);
      return;
    }
    if (textContent.length > maxLen) {
      const msg = t("反馈内容不能超过 {n} 个字", { n: maxLen });
      setLocalError(msg);
      showToast(msg);
      return;
    }
    // 匿名但关闭了匿名开关 → 提示登录
    if (!isAuthenticated && !config.feedbackAnonymousEnabled) {
      const msg = t("当前未开启匿名反馈，请登录后提交");
      setLocalError(msg);
      showToast(msg);
      return;
    }

    try {
      const res = await submit({
        type: type as "BUG" | "SUGGESTION" | "COMPLAINT" | "OTHER",
        title: trimmedTitle,
        content: html,
        contact: contact.trim() || undefined,
        source: "PC",
        anonymous: !isAuthenticated,
        attachmentIds: attachments.map((a) => a.id),
      });
      setResult(res);
      // 本地记录：无论登录与否都写入（未登录用户在本设备查看自己反馈的入口）
      saveLocalFeedbackRecord({
        code: res.feedbackCode,
        title: trimmedTitle,
        type,
        contentHtml: html,
        contact: contact.trim() || undefined,
        createdAt: res.createdAt,
        source: "PC",
        anonymous: !isAuthenticated,
      });
    } catch (err) {
      const msg = getErrorMessage(err);
      setLocalError(msg);
      showToast(msg);
    }
  }, [
    title,
    contact,
    type,
    minLen,
    maxLen,
    isAuthenticated,
    config.feedbackAnonymousEnabled,
    submit,
    attachments,
    showToast,
  ]);

  // 登录态变化（登录/登出）时清掉已上传附件：附件归属绑定上传时身份，
  // 保留继续提交会被后端拒「附件不属于当前用户」；文本内容保留，用户不必重填
  const prevAuth = useRef(isAuthenticated);
  useEffect(() => {
    if (isOpen && prevAuth.current !== isAuthenticated) {
      if (attachments.length) {
        for (const att of attachments) {
          editorRef.current?.removeAttachment(att.id);
        }
        for (const url of previewUrls.current.values())
          URL.revokeObjectURL(url);
        previewUrls.current.clear();
        setAttachments([]);
        showToast(t("登录状态已变化，已上传的附件已清除，请重新上传"));
      }
    }
    prevAuth.current = isAuthenticated;
  }, [isAuthenticated, isOpen, attachments, showToast]);

  // 提交成功态：展示查询码 + 认领提示
  const successView = result ? (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 text-sm">
        <span className="text-green-600">✓</span>
        <p className="text-[var(--text-primary)]">{t("反馈提交成功")}</p>
      </div>

      <div className="rounded-lg border border-[var(--border-default)] p-4 bg-[var(--bg-secondary)]">
        <p className="text-sm text-[var(--text-secondary)] mb-2">
          {t("请保存以下查询码，用于查询处理进度与认领奖励：")}
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 font-mono text-lg tracking-wider text-[var(--primary-500)]">
            {result.feedbackCode}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => copy.copy(result.feedbackCode, "feedback-code")}
          >
            {copy.copiedMarker === "feedback-code" ? t("已复制") : t("复制")}
          </Button>
        </div>
      </div>

      {result.claimRequired && (
        <p className="text-sm text-[var(--warning, #b45309)]">
          {t(
            "你的反馈已被采纳为待发放奖励：奖励不能匿名领取，请凭查询码联系客服注册或绑定账号后发放。",
          )}
        </p>
      )}
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      {/* 匿名提交提示：放表单顶部，不滚动即可见（匿名有每日限额，易触发） */}
      {!isAuthenticated && (
        <p className="text-xs text-[var(--text-secondary)]">
          {config.feedbackAnonymousEnabled
            ? t(
                "当前未登录，将以匿名方式提交（每日限额内）；奖励需联系客服认领。",
              )
            : t("当前未开启匿名反馈，请登录后提交。")}
        </p>
      )}
      {/* 奖励规则披露 */}
      <div className="rounded-lg border border-[var(--border-default)] p-3 text-xs text-[var(--text-secondary)] space-y-1">
        <p className="font-medium text-[var(--text-primary)]">
          {t("如何获得奖励")}
        </p>
        {FEEDBACK_REWARD_RULE.map((rule, i) => (
          <p key={i}>· {t(rule)}</p>
        ))}
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium">{t("反馈类型")}</label>
          <Select
            value={type}
            onChange={setType}
            options={typeOptions}
            disabled={submitting}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">{t("标题")}</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("用一句话概括你的问题或建议")}
            maxLength={100}
            disabled={submitting}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            {t("反馈内容")}
            <span className="ml-1 text-xs text-[var(--text-secondary)]">
              {t("（{min}~{max} 字，可粘贴/上传图片、图纸、文档）", {
                min: minLen,
                max: maxLen,
              })}
            </span>
            <span
              className={`ml-2 text-xs tabular-nums ${
                contentLen > maxLen
                  ? "text-red-600"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              {contentLen}/{maxLen}
            </span>
          </label>
          <RichtextEditor
            ref={editorRef}
            disabled={submitting || uploading}
            minHeight={140}
            placeholder={t(
              "请详细描述问题现象、操作步骤或建议方案；可直接粘贴/拖拽图片，或点击下方按钮插入图片、图纸、文档",
            )}
            onFiles={handleEditorFiles}
            onChange={(html) =>
              setContentLen(stripHtmlTags(toPersistableHtml(html)).length)
            }
            ariaLabel={t("反馈内容")}
          />
          {/* 插入工具条：图片/图纸/引用，全部插入到编辑器光标处；按钮带 tooltip 说明 */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={submitting || uploading}
              onClick={() => imageInputRef.current?.click()}
              icon={ImagePlus}
              title={t("上传本地图片，插入到反馈内容")}
            >
              {t("上传图片")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={submitting || uploading}
              onClick={() => drawingInputRef.current?.click()}
              icon={FileUp}
              title={t("上传本地图纸文件，插入为附件卡片")}
            >
              {t("上传图纸")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={submitting || uploading}
              onClick={() => void handleReferenceDrawing()}
              icon={LinkIcon}
              title={t("从个人空间/项目选择图纸，或引用当前打开图纸")}
            >
              {t("引用图纸")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={submitting || uploading}
              onClick={() => docInputRef.current?.click()}
              icon={FileText}
              title={t("上传本地文档，插入为附件卡片")}
            >
              {t("上传文档")}
            </Button>
          </div>
          {uploading && (
            <p className="text-xs text-[var(--text-secondary)]">
              {t("正在上传附件…")}
            </p>
          )}
          {/* 附件托盘：已上传附件可反复插入（点 chip 主体）或删除（×），无需重新上传 */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((att) => {
                const preview =
                  att.type === "IMAGE"
                    ? previewUrls.current.get(att.id) ||
                      att.thumbnailUrl ||
                      att.viewUrl ||
                      att.downloadUrl
                    : att.thumbnailUrl;
                const name =
                  att.fileName ??
                  (att.type === "IMAGE" ? t("图片") : t("附件"));
                return (
                  <div
                    key={att.id}
                    className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-secondary)] py-1 pl-1.5 pr-1 hover:border-[var(--primary-500)]"
                    title={`${name}（${t("重新插入")}）`}
                    onClick={() => reinsertAttachment(att)}
                  >
                    {preview ? (
                      <img
                        src={preview}
                        alt=""
                        className="h-7 w-7 rounded object-cover"
                      />
                    ) : (
                      <span className="px-1 text-base leading-none">
                        {att.type === "DRAWING" ? "📄" : "📎"}
                      </span>
                    )}
                    <span className="max-w-[120px] truncate text-xs text-[var(--text-secondary)]">
                      {name}
                    </span>
                    <button
                      type="button"
                      aria-label={t("删除附件")}
                      className="ml-0.5 rounded px-1 text-xs text-[var(--text-tertiary)] hover:text-red-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAttachmentFromTray(att);
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            {t("联系方式（选填）")}
          </label>
          <Input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={t("邮箱或手机号，便于回访与查询校验")}
            maxLength={100}
            disabled={submitting}
          />
        </div>
      </div>

      {localError && <p className="text-sm text-red-600">{localError}</p>}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={result ? t("提交成功") : t("提交反馈")}
      maxWidth="max-w-[560px]"
      closeOnOverlayClick={!submitting}
      hidden={pickingRegion}
      footer={
        result ? (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setQueryCode(result.feedbackCode);
                setQueryOpen(true);
              }}
            >
              {t("查询进度")}
            </Button>
            <Button variant="secondary" onClick={handleClose}>
              {t("关闭")}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="secondary"
              onClick={() => setQueryOpen(true)}
              disabled={submitting}
            >
              {t("查询进度")}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={handleClose}
                disabled={submitting}
              >
                {t("取消")}
              </Button>
              <Button onClick={handleSubmit} loading={submitting}>
                {t("提交反馈")}
              </Button>
            </div>
          </div>
        )
      }
    >
      {successView}
      {/* 查询进度独立弹框：由「查询进度」入口打开，与提交弹框平级；成功视图入口带查询码预填 */}
      <FeedbackQueryModal
        isOpen={queryOpen}
        onClose={() => setQueryOpen(false)}
        initialCode={queryCode ?? undefined}
      />
      {/* 引用图纸选择弹框：登录=空间树+当前图纸快捷项；未登录=仅当前图纸（SelectFileModal 内处理） */}
      <SelectFileModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={(files) => void handleConfirmPickDrawing(files)}
        title={t("选择要引用的图纸")}
        multiSelect={false}
        showThumbnail
        currentDrawing={getCurrentDrawingOption()}
      />
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          for (const file of files) void handleUploadImage(file);
          e.target.value = "";
        }}
      />
      <input
        ref={drawingInputRef}
        type="file"
        accept=".mxweb,.dwg,.dxf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUploadDrawing(file);
          e.target.value = "";
        }}
      />
      <input
        ref={docInputRef}
        type="file"
        multiple
        accept={DOC_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          for (const file of files) void handleUploadDocument(file);
          e.target.value = "";
        }}
      />
    </Modal>
  );
};
