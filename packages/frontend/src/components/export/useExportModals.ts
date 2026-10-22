/**
 * ExportModals 内部 hook（ADR-0040）
 *
 * 导出/另存为子系统编排：save-as 簇（state + SAVE_AS 订阅 + 成功/本地下载
 * handler）与下载/转换簇（useExportConvert）的组装。仅供
 * components/export/ExportModals.tsx 消费。
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useNotification } from '@/contexts/NotificationContext';
import { t } from '@/languages';
import { CAD_EVENTS } from '@/constants/events';
import {
  subscribe,
  clearCurrentFileDeleted,
  patchSession,
  patchSessionFlags,
} from '@/services/drawingSession';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { useFileSystemStore } from '@/stores/fileSystemStore';
import {
  signalShareChainCloudNodeCreated,
  refreshFileName,
} from '@/services/mxcadManager';
import { buildCadEditorUrl, getCadEditorBackUrl } from '@/utils/cadEditorRoute';
import { uploadSaveAsThumbnail } from './saveAsThumbnail';
import { useExportConvert } from './useExportConvert';

/**
 * 分享图纸另存为成功后把会话切到新节点（非意图链路径）。
 *
 * 只对 `fromShare` 会话生效：普通图纸手动「另存为」是存副本，编辑器应留在原图，
 * 由下方的「打开新图纸」提示决定是否去新标签页；而分享图纸的原节点不属于当前
 * 用户，留在原会话会每点一次保存就再另存为一次、堆出重复副本。
 *
 * 返回 true = 会话已被接管。此时内容本来就是引擎里这张图、编辑器已指向新节点，
 * 再弹「是否打开新图纸」既多余又像是「保存后自动重开」，故调用方直接跳过提示。
 */
function adoptSavedAsFile(result: {
  nodeId: string;
  fileName: string;
  projectId?: string;
  parentId: string;
  targetType?: 'personal' | 'project' | 'library';
  libraryType?: 'drawing' | 'block';
}): boolean {
  const store = useCADEditorStore.getState();
  if (!store.fromShare || !result.nodeId) return false;

  const libraryKey =
    result.targetType === 'library' ? result.libraryType : undefined;
  // 个人空间落点：save-as 响应不带 projectId，但会话里 projectId 的语义是
  // 「所在根节点」（loadByNodeId 对个人空间文件解析出的就是个人空间根）。
  // 落点是个人空间的子文件夹时 parentId ≠ 个人空间根，缺 projectId 会让下一次
  // 保存判不出归属、又弹一次另存为。
  const personalSpaceId =
    result.targetType === 'personal'
      ? useFileSystemStore.getState().personalSpaceId
      : null;
  patchSession({
    fileId: result.nodeId,
    parentId: result.parentId,
    projectId: libraryKey
      ? null
      : (result.projectId ?? personalSpaceId ?? null),
    name: result.fileName,
    fromShare: false,
    // 新节点的 updatedAt 未知（save-as 响应不带它）：保留分享节点的旧时间戳会让
    // 下一次保存的乐观锁必然冲突（后端比对 fullNode.updatedAt ≠ expectedTimestamp，
    // 直接报「文件已被他人修改」）。清空即跳过该检查，由后端按最新节点写。
    expectedTimestamp: undefined,
    updatedAt: undefined,
    ...(libraryKey ? { libraryKey } : {}),
  });
  patchSessionFlags({
    fileId: result.nodeId,
    fileName: result.fileName,
    projectId: libraryKey
      ? null
      : (result.projectId ?? personalSpaceId ?? null),
    fromShare: false,
  });
  // 地址栏跟着切到新节点（丢掉 shareToken）：否则会话指向新节点、URL 还指着
  // 分享者那个节点，刷新一下就跳回别人的图纸，用户会以为「保存没生效」
  window.history.replaceState(
    null,
    '',
    buildCadEditorUrl({
      fileId: result.nodeId,
      parentId: libraryKey ? null : result.parentId,
      libraryKey: libraryKey ?? null,
      back: getCadEditorBackUrl(),
    })
  );
  refreshFileName();
  return true;
}

export interface ExportModalsOptions {
  fileId: string | null;
  canExport?: boolean;
  isAuthenticated?: boolean;
  /** 登录闸门抑制查询（useLoginGate.isLoginSuppressed） */
  isLoginSuppressed?: () => boolean;
  currentFileHash?: string;
}

export function useExportModals({
  fileId,
  canExport,
  isAuthenticated,
  isLoginSuppressed,
  currentFileHash,
}: ExportModalsOptions) {
  const { showToast, showConfirm } = useNotification();
  const forceDownloadToLocal = useRef(false);

  // 订阅生命周期与 props 解耦：变化值走 ref，bus 订阅保持稳定
  const fileIdRef = useRef(fileId);
  fileIdRef.current = fileId;
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;
  const currentFileHashRef = useRef(currentFileHash);
  currentFileHashRef.current = currentFileHash;

  const [saveAsBlob, setSaveAsBlob] = useState<Blob | null>(null);

  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsFileName, setSaveAsFileName] = useState<string>('');
  const [saveAsPersonalSpaceId, setSaveAsPersonalSpaceId] = useState<
    string | null
  >(null);
  const [saveAsSourceNodeId, setSaveAsSourceNodeId] = useState<string | null>(
    null
  );
  const [saveAsFileHash, setSaveAsFileHash] = useState<string | null>(null);

  // 切换图纸时重置另存为簇状态：ExportModals 是页面级组件（同路由换 fileId
  // 参数不重挂载），不清理会残留上一张图纸的另存为弹框/旧 blob
  useEffect(() => {
    setShowSaveAsModal(false);
    setSaveAsBlob(null);
    setSaveAsFileName('');
    setSaveAsPersonalSpaceId(null);
    setSaveAsSourceNodeId(null);
    setSaveAsFileHash(null);
    forceDownloadToLocal.current = false;
  }, [fileId]);

  const convert = useExportConvert({
    fileId,
    canExport,
    saveAsBlob,
    forceDownloadToLocal,
    setSaveAsBlob,
    showToast,
  });

  useEffect(() => {
    return subscribe(CAD_EVENTS.SAVE_AS, (detail) => {
      if (isLoginSuppressed?.()) return;

      if (!isAuthenticatedRef.current) {
        convert.setDownloadingFileName(detail.currentFileName);
        setSaveAsBlob(detail.mxwebBlob);
        forceDownloadToLocal.current = true;
        convert.setShowDownloadFormatModal(true);
        return;
      }

      setSaveAsFileName(detail.currentFileName);
      setSaveAsBlob(detail.mxwebBlob);
      setSaveAsPersonalSpaceId(detail.personalSpaceId);
      setSaveAsSourceNodeId(detail.sourceNodeId ?? fileIdRef.current);
      setSaveAsFileHash(
        detail.sourceFileHash ?? currentFileHashRef.current ?? null
      );
      setShowSaveAsModal(true);
    });
  }, [
    isLoginSuppressed,
    convert.setDownloadingFileName,
    convert.setShowDownloadFormatModal,
  ]);

  const handleSaveAsSuccess = useCallback(
    async (result: {
      nodeId: string;
      fileName: string;
      path: string;
      projectId?: string;
      parentId: string;
      targetType?: 'personal' | 'project' | 'library';
      libraryType?: 'drawing' | 'block';
    }) => {
      setShowSaveAsModal(false);
      setSaveAsBlob(null);
      clearCurrentFileDeleted();
      showToast(t('另存为成功'), 'success');

      // 意图链（ADR-0081 D6）：另存为成功即把新节点回填进会话并续跑原始分享动作；
      // 链已消费则跳过「打开新图纸」提示——编辑器已指向新节点，再问是多一次点击
      if (signalShareChainCloudNodeCreated(result)) return;

      // 分享图纸另存为：必须把会话切到新节点，否则会话仍指着分享者那张图
      // （fromShare=true、fileId 是分享节点），用户每点一次保存都会再走一遍
      // 另存为、每点一次就多一份副本（数据侧已出现同名重复节点）。
      // 回填不需要重载文档：上传的 blob 就是引擎当前内容（ADR-0081 D6 同一理由）。
      // 接管成功即跳过下方「打开新图纸」——编辑器已指向新节点，再问既多余、
      // 也会让用户觉得「保存完图纸又被重开了一次」。
      if (adoptSavedAsFile(result)) return;

      const confirmPromise = showConfirm({
        title: t('打开新图纸'),
        message: t('"{fileName}" 已保存成功，是否在新标签页中打开？', {
          fileName: result.fileName,
        }),
        confirmText: t('打开'),
        cancelText: t('关闭'),
        type: 'info',
      });

      const thumbnailPromise = uploadSaveAsThumbnail(result.nodeId);

      const confirmed = await confirmPromise;
      if (confirmed) {
        // URL 走唯一合成出口：资源库落点必须带 ?library=（否则新标签页按普通
        // 节点查询，库节点查不到、打开失败），parentId 只在非库落点才有意义
        window.open(
          buildCadEditorUrl({
            fileId: result.nodeId,
            parentId: result.targetType === 'library' ? null : result.parentId,
            libraryKey:
              result.targetType === 'library' ? result.libraryType : null,
          }),
          '_blank'
        );
      }

      await thumbnailPromise;
    },
    [showToast, showConfirm]
  );

  return {
    downloadFormat: convert.downloadFormat,
    extRefFormat: convert.extRefFormat,
    pdfExport: convert.pdfExport,
    dwgExport: convert.dwgExport,
    saveAs: {
      blob: saveAsBlob,
      setBlob: setSaveAsBlob,
      show: showSaveAsModal,
      setShow: setShowSaveAsModal,
      fileName: saveAsFileName,
      setFileName: setSaveAsFileName,
      personalSpaceId: saveAsPersonalSpaceId,
      setPersonalSpaceId: setSaveAsPersonalSpaceId,
      forceDownloadToLocal,
      sourceNodeId: saveAsSourceNodeId,
      sourceFileHash: saveAsFileHash,
    },
    handleExternalRefDownload: convert.handleExternalRefDownload,
    handleExtRefFormatDownload: convert.handleExtRefFormatDownload,
    handleDownloadWithFormat: convert.handleDownloadWithFormat,
    handlePdfExport: convert.handlePdfExport,
    handleDwgExport: convert.handleDwgExport,
    handleSaveAsSuccess,
  };
}
