<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, unref, computed, watch } from 'vue';
import { t } from '@/languages';
import { createMxCAD } from '../../plugins/mxcad';
import { callCommand } from '@/plugins/mxcad/command';
import { uiConfig } from '@/config/uiConfig';
import BScroll from '@better-scroll/core';
import ObserveDOM from '@better-scroll/observe-dom';
import ObserveImage from '@better-scroll/observe-image';
import { McCmColor, MxCpp } from 'mxcad';
import { useColorPicker } from './useColorPicker';
import iro from '@jaames/iro';
import { useMenu } from './hooks/useMenu';
import { useEditObjectToolbar } from './hooks/useEditObjectToolbar';
import { useSimulatedMouse } from './hooks/useSimulatedMouse';
import { useRunCmdOperationBtnList } from './hooks/useRunCmdOperationBtnList';
import { useFooterToolbar } from './hooks/useFooterToolbar';

import {
  useFileLoader,
  checkFileExternalRefs,
  checkPublicFileExternalRefs,
  type FileOpenOptions,
} from '../../composables/useFileLoader';
import { uploadThumbnailForNode } from '../../services/thumbnailService';
import {
  isHashLike,

} from '../../services/publicFileService';
import { checkLibraryPermissions } from '../../services/permissionService';
import { useEditorState } from '../../composables/useEditorState';
import { useSave } from '../../composables/useSave';
import {
  saveAsToCloudTrigger,
  saveLoginRequiredTrigger,
  saveToCloudTrigger,
} from '../../composables/useSaveAs';
import { useUser } from '../../composables/useUser';

import {
  showToast,
  showConfirmDialog,
} from 'vant';
import { showToastOnce } from '@/utils/toast';

import { getPCLoginUrl } from '@/utils/apiConfig';
import { navigateBack } from '../../utils/navigateBack';
import {
  exitCollaborationIfNeeded,

} from '../../composables/useCooperate';
import { useCollabAutoJoin } from '../../composables/useCollabAutoJoin';
import { useShareFileLoad } from '../../composables/useShareFileLoad';
import { useRuntimeConfig } from '../../composables/useRuntimeConfig';
import CommitMessageDialog from './components/CommitMessageDialog.vue';
import SaveAsSheet from './components/SaveAsSheet.vue';
import VersionHistoryPopup from './components/VersionHistoryPopup.vue';
import LoginPromptPopup from './components/LoginPromptPopup.vue';
import CooperatePopup from './components/CooperatePopup.vue';
import InsertBlockPopup from './components/InsertBlockPopup.vue';
import LibraryPanel from './components/LibraryPanel.vue';
import type { LibraryType } from '../../composables/useLibrary';
import { pendingInsertParams } from '../../command/m_mx_insert_block';
import { isBlockLibrary } from '../../composables/useInsertBlock';
import type { BlockInfoItem } from '../../composables/useInsertBlock';
import MxToolbar from '@/components/MxToolbar.vue';

BScroll.use(ObserveDOM);
BScroll.use(ObserveImage);
// ‍  气泡菜单
// ‍ Bubble menu

const { isShowMenu, actions, onSelectMenu, onCloseMenu } = useMenu();

// ‍  图元编辑工具栏
// ‍ Element Editing Toolbar

const {
  isShowObjectEditingToolbar,
  objectEditingToolbarItems,
  onObjectEditingBtnTap,
  initEditObjectToolbar,
} = useEditObjectToolbar();

const { needle, handle, arrowTip, onTouchstart } = useSimulatedMouse();
const { isRunCmd, stopRunCmd, determine, cmdTipObj, sendInputCmd } =
  useRunCmdOperationBtnList();
// ‍  颜色选择器
// ‍ Color picker

const { isShowColorPicker, openColorPicker } = useColorPicker('.colorPicker');
const color = ref('#fff');

// 从云图新标签页打开时的返回信息（用于判断是否可以直接关闭标签页）
const backUrl = ref<string | null>(null);
const initialFileId = ref<string | null>(null);

function doGoBack() {
  navigateBack({
    fileId: editorState.state.fileId,
    projectId: editorState.state.projectId,
    personalSpaceId: editorState.state.personalSpaceId,
    libraryKey: editorState.state.libraryKey,
    parentId: (editorState.state.fileInfo as Record<string, unknown>)
      ?.parentId as string | null,
    backUrl: backUrl.value,
    initialFileId: initialFileId.value,
  });
}

const selectColor = () => {
  let _color = MxCpp.getCurrentMxCAD().getDatabase().getCurrentlyTrueColor();
  if (_color.getColorValue() === '0xFFFFFF') {
    _color.setRGB(255, 255, 255);
  }
  openColorPicker(
    (c) => {
      color.value = c.hexString;
      const mcColor = new McCmColor();
      mcColor.setRGB(c.red, c.green, c.blue);
      MxCpp.getCurrentMxCAD().getDatabase().setCurrentlyTrueColor(mcColor);
      MxCpp.getCurrentMxCAD().drawColor = mcColor;
    },
    new iro.Color({
      r: _color.red,
      g: _color.green,
      b: _color.blue,
    })
  );
};

const {
  left,
  currentItem,
  onTap,
  onClick,
  // ‍  历史点击
  // ‍ Historical clicks

  state,
  historyBtnList,
  toggle,
  onHistoryBtnClick,
} = useFooterToolbar();

const {
  loading: fileLoading,
  error: fileError,
  progress: fileProgress,
  loadByNodeId,
  loadByHash,
  getFileIdFromUrl,
  getNodeIdFromUrl,
  getHashFromUrl,
  getVersionFromUrl,
  clearError,
} = useFileLoader();
const editorState = useEditorState();
const drawName = computed(() => {
  if (editorState.state.isInCollaboration) {
    return `${t('[协同中]')} ${editorState.state.fileName}`;
  }
  return editorState.state.fileName;
});
const isInCollaboration = computed(() => editorState.state.isInCollaboration);
const currentVersion = computed(() => editorState.state.currentVersion);
const isPublicFile = computed(() => editorState.state.isPublicFile);

const progressMessage = computed(() => {
  const stage = editorState.state.progressStage;
  switch (stage) {
    case 'uploading': return t('上传中...');
    case 'converting': return t('正在转换...');
    case 'opening': return t('正在打开图纸...');
    case 'fetching-info': return t('正在获取文件信息...');
    case 'loading-cache': return t('正在从缓存加载图纸...');
    default: return fileProgress.value || t('加载中...');
  }
});

const displayError = computed(() => fileError.value || editorState.state.error);

const errorIcon = computed(() => {
  switch (editorState.state.errorType) {
    case 'auth': return 'info-o';
    case 'permission': return 'info-o';
    case 'not-found': return 'search';
    case 'network': return 'wifi';
    case 'converting': return 'underway-o';
    case 'server': return 'warning-o';
    default: return 'warning-o';
  }
});

const errorColor = computed(() => {
  switch (editorState.state.errorType) {
    case 'auth': return '#ff976a';
    case 'permission': return '#ff976a';
    case 'not-found': return '#ff976a';
    case 'network': return '#ff976a';
    case 'converting': return '#ff976a';
    default: return '#ff4444';
  }
});

function dismissError() {
  clearError();
  editorState.setError(null);
  editorState.setErrorType(null);
  doGoBack();
}

const { saving, save: saveAction } = useSave();
const { user, isAuthenticated } = useUser();
const showCommitDialog = ref(false);
const showSaveAsSheet = ref(false);
watch(saveAsToCloudTrigger, () => {
  showSaveAsSheet.value = true;
});
watch(saveLoginRequiredTrigger, () => {
  pendingActionAfterLogin.value = 'saveAs';
  showLoginPrompt.value = true;
});
watch(saveToCloudTrigger, () => {
  const state = editorState.state;
  if (state.isPublicFile) {
    showToast(t('公开文件不支持保存'));
    return;
  }
  if (!state.permissions.canSave) {
    showToast(t('没有保存权限'));
    return;
  }
  if (!isAuthenticated.value) {
    pendingActionAfterLogin.value = 'save';
    showLoginPrompt.value = true;
    return;
  }
  showCommitDialog.value = true;
});
const pendingCommitMessage = ref('');
const canManageLibrary = ref(false);
const showVersionHistory = ref(false);
const showLoginPrompt = ref(false);
const loginPromptWaiting = ref(false);
const pendingActionAfterLogin = ref<'save' | 'saveAs' | 'version-history' | null>(null);
const { config: runtimeConfig } = useRuntimeConfig();
const showCooperate = ref(false);
const showCollabDisabled = ref(false);
const showInsertBlock = ref(false);
const insertBlockParams = ref<BlockInfoItem | null>(null);
const showLibrary = ref(false);
const libraryType = ref<LibraryType>('drawing');

const onInsertBlockConfirm = () => {
  showLibrary.value = false
}

const onInsertBlockComplete = () => {
  // 仅从图块库触发插入时，插入完成后重新弹出图块库抽屉
  if (!isBlockLibrary.value) return
  setTimeout(() => {
    showLibrary.value = true
  }, 1000)
}

const onInsertBlockClose = () => {
  showInsertBlock.value = false
}

checkLibraryPermissions().then((result) => {
  canManageLibrary.value = result.canManageDrawing || result.canManageBlock;
});

function onCommitConfirm(message: string) {
  pendingCommitMessage.value = message;
  showCommitDialog.value = false;
  executeSave();
}

async function executeSave() {
  const result = await saveAction(pendingCommitMessage.value);
  if (result.success) return;
  if (result.needLogin) {
    pendingActionAfterLogin.value = 'save';
    showLoginPrompt.value = true;
    return;
  }
  if (result.needSaveAs) {
    showSaveAsSheet.value = true;
    return;
  }
  if (result.message) {
    showToast(result.message);
  }
}

function onSaveAsClose() {
  showSaveAsSheet.value = false;
}

function onSaveAsSuccess() {
  showSaveAsSheet.value = false;
}

function onShowVersionHistory() {
  if (isPublicFile.value) {
    showToast(t('公开文件不支持版本历史'));
    return;
  }
  if (!editorState.state.fileId) {
    showToast(t('本地图纸无版本历史'));
    return;
  }
  if (!editorState.state.permissions.canSave) {
    showToast(t('没有查看版本历史的权限'));
    return;
  }
  if (!isAuthenticated.value) {
    pendingActionAfterLogin.value = 'version-history';
    showLoginPrompt.value = true;
    return;
  }
  showVersionHistory.value = true;
}

function onLoginPromptLogin() {
  loginPromptWaiting.value = true;
  if (pendingActionAfterLogin.value) {
    sessionStorage.setItem('pendingAction', pendingActionAfterLogin.value);
    pendingActionAfterLogin.value = null;
  }

  const win = window.open(getPCLoginUrl(window.location.href), 'pc-login');

  if (!win) {
    loginPromptWaiting.value = false;
    showLoginPrompt.value = false;
    window.location.href = getPCLoginUrl();
    return;
  }

  // storage 事件监听：新标签页写入 token 后触发 refresh
  function onStorage(event: StorageEvent) {
    if (event.key === 'accessToken' && event.newValue) {
      window.removeEventListener('storage', onStorage);
      const { refresh } = useUser();
      refresh();

      showLoginPrompt.value = false;
      loginPromptWaiting.value = false;

      const pending = sessionStorage.getItem('pendingAction');
      if (pending) {
        sessionStorage.removeItem('pendingAction');
        setTimeout(() => {
          if (pending === 'save') showCommitDialog.value = true;
          else if (pending === 'saveAs') showSaveAsSheet.value = true;
          else if (pending === 'version-history')
            showVersionHistory.value = true;
        }, 500);
      }
    }
  }
  window.addEventListener('storage', onStorage);
}

function onLoginPromptClose() {
  showLoginPrompt.value = false;
  loginPromptWaiting.value = false;
}

async function handleNewFile() {
  exitCollaborationIfNeeded();

  if (editorState.state.isModified) {
    try {
      await showConfirmDialog({
        title: t('未保存的更改'),
        message: t('当前图纸有未保存的更改，是否保存？'),
        confirmButtonText: t('保存'),
        cancelButtonText: t('不保存'),
      });
      try {
        const success = await saveAction();
        if (!success) return;
      } catch {
        return;
      }
    } catch {
      editorState.setIsModified(false);
    }
  }

  editorState.resetNewFile();

  editorState.setNewFileInfo();

  const mxcad = MxCpp.App.getCurrentMxCAD();
  mxcad.newFile();

  showToastOnce(t('已新建空白图纸'));
}

const handleShowCollaborate = () => {
  if (!runtimeConfig.value.collaborationEnabled) {
    showCollabDisabled.value = true;
    return;
  }
  showCooperate.value = true;
};

const handleShowInsertBlock = (e: Event) => {
  insertBlockParams.value = (e as CustomEvent).detail ?? pendingInsertParams;
  showInsertBlock.value = true;
};

const handleShowLibrary = (e: Event) => {
  libraryType.value = ((e as CustomEvent).detail as LibraryType) ?? 'drawing';
  showLibrary.value = true;
};

function onBeforeUnloadHandler() {
  exitCollaborationIfNeeded();
}

onMounted(async () => {
  window.addEventListener('open-version-history', onShowVersionHistory);
  window.addEventListener('mxcad-new-file', handleNewFile);
  window.addEventListener('mxcad-show-collaborate', handleShowCollaborate);
  window.addEventListener('mxcad-show-insert-block', handleShowInsertBlock);
  window.addEventListener('mxcad-show-library', handleShowLibrary);
  window.addEventListener('beforeunload', onBeforeUnloadHandler);

  // Auto-join cleanup reference
  let autoJoinCleanup: (() => void) | null = null;

  onBeforeUnmount(() => {
    window.removeEventListener('open-version-history', onShowVersionHistory);
    window.removeEventListener('mxcad-new-file', handleNewFile);
    window.removeEventListener('mxcad-show-collaborate', handleShowCollaborate);
    window.removeEventListener('mxcad-show-insert-block', handleShowInsertBlock);
    window.removeEventListener('mxcad-show-library', handleShowLibrary);
    window.removeEventListener('beforeunload', onBeforeUnloadHandler);
    autoJoinCleanup?.();
    // 离开页面时退出当前协同会话
    exitCollaborationIfNeeded();
    // 组件卸载时重置协同分享状态（与 PC CADEditorDirect.tsx cleanup 对齐）
    if (editorState.state.fromCollabShare) {
      editorState.setCollabShareState({
        fromCollabShare: false,
        targetWorkId: null,
      });
    }
  });

  // ====== 解析 URL 参数 ======
  const searchParams = new URLSearchParams(window.location.search);
  const fileId = getFileIdFromUrl();
  const fileHash = getHashFromUrl();
  const libraryKey =
    (searchParams.get('library') as 'drawing' | 'block' | null) || undefined;
  const shareToken = searchParams.get('shareToken') || undefined;
  const collabWorkId = searchParams.get('collabWorkId');
  const collabDrawingId = searchParams.get('drawingId');
  const collabProjectId = searchParams.get('projectId');

  // ====== 协同分享链接（与 PC CADEditorDirect.tsx L316-L343 + CollaborateSidebar.tsx L364-L513 对齐） ======
  if (collabWorkId) {
    if (!runtimeConfig.value.collaborationEnabled) {
      showCollabDisabled.value = true;
    }
    const workId = parseInt(collabWorkId, 10);
    if (!isNaN(workId) && workId > 0) {
      editorState.setFileId(collabDrawingId || fileId || '');
      if (collabProjectId) {
        editorState.setProjectId(collabProjectId);
      }
      editorState.setCollabShareState({
        fromCollabShare: true,
        targetWorkId: workId,
      });
      // 协同模式下只初始化 CAD 引擎，不打开文件（由协同 SDK 自动加载）
      const mxcad = await createMxCAD();
      mxcad.on('databaseModify', () => {
        editorState.setIsModified(true);
      });
      mxcad.on('openFileComplete', () => {
        editorState.setIsModified(false);
      });
      initEditObjectToolbar(mxcad);
      editorState.setFileName(t('协作图纸'));
      const { startAutoJoin } = useCollabAutoJoin(user);
      autoJoinCleanup = startAutoJoin(workId);
      return;
    }
  }

  // ====== History stack fix（与 PC L244-L259 对齐） ======
  if (fileId && window.history.length <= 1) {
    const urlBackUrl = searchParams.get('back');
    if (urlBackUrl) {
      // 保存返回信息，用于判断是否可以直接关闭标签页
      backUrl.value = urlBackUrl;
      initialFileId.value = fileId;

      const url = new URL(urlBackUrl, window.location.origin);
      if (!url.searchParams.has('fileId')) {
        url.searchParams.set('fileId', fileId);
      }
      const cadEditorPath = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', url.toString());
      window.history.pushState(null, '', cadEditorPath);
    }
  }

  // ====== 分享链接处理（使用 useShareFileLoad） ======
  if (shareToken && fileId && !collabWorkId) {
    const loaded = await useShareFileLoad(
      shareToken,
      fileId,
      createMxCAD,
      initEditObjectToolbar
    );
    if (loaded) return;
    // 分享加载失败时已设置 error → 暂停后续流程，展示 error overlay
    return;
  }

  // ====== 初始化 CAD 引擎（非分享链接） ======
  const mxcad = await createMxCAD();
  mxcad.on('databaseModify', () => {
    editorState.setIsModified(true);
  });
  mxcad.on('openFileComplete', () => {
    editorState.setIsModified(false);
    // 打开文件后异步生成并上传缩略图（参考 PC setupFileOpenListener）
    const fileId = editorState.state.fileId;
    if (fileId) {
      uploadThumbnailForNode(fileId).catch(() => { });
    }
  });

  initEditObjectToolbar(mxcad);

  // ====== 根据文件源打开图纸 ======
  const openOptions: FileOpenOptions = {};
  let fileSource: 'project' | 'library' | 'share' | 'public' | 'none' = 'none';

  if (libraryKey) {
    openOptions.libraryKey = libraryKey;
    fileSource = 'library';
  } else if (shareToken) {
    openOptions.shareToken = shareToken;
    fileSource = 'share';
  }

  if (fileId) {
    fileSource = fileSource === 'none' ? 'project' : fileSource;
    const ok = await loadByNodeId(
      fileId,
      Object.keys(openOptions).length ? openOptions : undefined
    );

    if (ok) {
      editorState.setCurrentVersion(getVersionFromUrl());
      if (fileSource === 'project') {
        checkFileExternalRefs(fileId);
      }
    }
  } else if (fileHash && isHashLike(fileHash)) {
    fileSource = 'public';
    editorState.setIsPublicFile(true);
    const ok = await loadByHash(fileHash);
    if (ok) {
      editorState.setCurrentVersion(getVersionFromUrl());
      checkPublicFileExternalRefs(fileHash);
    } else {
      editorState.setFileName(mxcad.getCurrentFileName());
    }
  } else {
    editorState.setFileName('new.dwg');
  }

  const pendingAction = sessionStorage.getItem('pendingAction');
  if (pendingAction && isAuthenticated.value) {
    sessionStorage.removeItem('pendingAction');
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (pendingAction === 'save') {
      showCommitDialog.value = true;
    } else if (pendingAction === 'saveAs') {
      showSaveAsSheet.value = true;
    } else if (pendingAction === 'version-history') {
      showVersionHistory.value = true;
    }
  }
});
// ‍  适配内容高度
// ‍ Adaptation content height

function setViewportHeight() {
  let vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

window.addEventListener('resize', setViewportHeight);
window.addEventListener('orientationchange', setViewportHeight);
setViewportHeight();
</script>

<template>
  <div class="mxCanvasBox">
    <div class="header">
      <span class="draw_name">{{ drawName }}</span>
      <span v-if="currentVersion" class="version-badge">r{{ currentVersion }}</span>
      <div class="top_toolbar">
        <button class="item" :disabled="saving || isPublicFile || !editorState.state.permissions.canSave
          " @click="callCommand('Mx_SaveToCloud')">
          <MxIcon icon="baocun" isDefault class="zoomed"></MxIcon>
        </button>
        <button class="item" @click="callCommand('Mx_ZoomE')">
          <MxIcon icon="quanping" isDefault class="zoomed"></MxIcon>
        </button>
        <button class="item" @click="callCommand('Mx_Undo')">
          <MxIcon icon="huitui" isDefault class="zoomed"></MxIcon>
        </button>
        <button class="item" @click="selectColor">
          <div class="color_box zoomed" :style="{ backgroundColor: color }"></div>
        </button>
        <van-popover class="menu" v-model:show="isShowMenu" icon-prefix="mxicon" placement="bottom-end"
          :actions="actions" @select="onSelectMenu" @closed="onCloseMenu">
          <template #reference>
            <button class="item">
              <MxIcon icon="caidan" isDefault class="zoomed"></MxIcon>
            </button>
          </template>
        </van-popover>
      </div>
    </div>
    <div class="cmd_operation_btn_list" v-if="isRunCmd">
      <template v-if="cmdTipObj?.keys">
        <van-button color="#363636c4" size="small" style="margin-right: 5px; margin-bottom: 5px"
          v-for="item in cmdTipObj.keys" @click.stop="item?.key && sendInputCmd(item.key)">{{ item.label }}</van-button>
      </template>

      <button class="item zoomed" @click.stop="stopRunCmd">
        <van-icon name="./mxcustomui/draw/cuo.png"></van-icon>
      </button>
      <button class="item zoomed" @click.stop="determine">
        <van-icon name="./mxcustomui/draw/dui.png"></van-icon>
      </button>
    </div>
    <div class="colorPicker" v-show="isShowColorPicker"></div>



    <!-- 模拟鼠标指针 -->
    <!-- 针头 -->
    <div class="singleArrow" ref="needle">
      <div class="singleArrow_tip" ref="arrowTip"></div>
    </div>
    <!-- 针柄 -->
    <button class="needle-handle ring" ref="handle" @touchstart="onTouchstart"></button>

    <!-- Loading overlay -->
    <div class="loading-overlay" v-if="fileLoading || editorState.state.loading">
      <div class="loading-content">
        <van-loading color="#fff" type="spinner" />
        <p class="loading-text">{{ progressMessage }}</p>
        <div v-if="editorState.state.progressStage === 'uploading'" class="upload-progress-bar">
          <div class="upload-progress-fill" :style="{ width: Math.round(editorState.state.uploadProgress) + '%' }"></div>
          <span class="upload-progress-text">{{ Math.round(editorState.state.uploadProgress) }}%</span>
        </div>
      </div>
    </div>
    <!-- Error overlay -->
    <div class="loading-overlay" v-if="displayError && !fileLoading && !editorState.state.loading"
      @click="dismissError">
      <div class="loading-content">
        <van-icon :name="errorIcon" :color="errorColor" size="56" />
        <p class="loading-text">{{ displayError }}</p>
      </div>
    </div>
    <CommitMessageDialog v-if="showCommitDialog" @confirm="onCommitConfirm" @cancel="showCommitDialog = false" />
    <SaveAsSheet :show="showSaveAsSheet" :current-file-name="editorState.state.fileName"
      :can-manage-library="canManageLibrary" :current-node-id="editorState.state.fileId || undefined"
      @close="onSaveAsClose" @success="onSaveAsSuccess" @login-required="showLoginPrompt = true" />
    <VersionHistoryPopup v-if="showVersionHistory" @close="showVersionHistory = false" />
    <LoginPromptPopup v-if="showLoginPrompt" :waiting="loginPromptWaiting" @login="onLoginPromptLogin"
      @close="onLoginPromptClose" />
    <CooperatePopup v-if="showCooperate" @close="showCooperate = false" />
    <van-dialog v-model:show="showCollabDisabled" :title="t('提示')" @confirm="showCollabDisabled = false">
      <div style="padding: 16px 20px; font-size: 14px; line-height: 1.6; color: var(--text-secondary);">
        <span>{{ t('实时协同只支持私有化部署，请点击') }}</span>
        <a
          href="https://help.mxdraw.com/"
          target="_blank"
          rel="noopener noreferrer"
          style="color: var(--primary); text-decoration: underline;"
        >{{ t('查看文档') }}</a>
        <span>{{ t('或者联系客服') }}</span>
      </div>
    </van-dialog>
    <div v-show="showInsertBlock">
      <InsertBlockPopup
        v-model:show="showInsertBlock"
        :preset-item="insertBlockParams"
        @close="onInsertBlockClose"
        @confirm="onInsertBlockConfirm"
        @insert-complete="onInsertBlockComplete"
      />
    </div>
    <div v-show="showLibrary">
      <LibraryPanel
        v-model:show="showLibrary"
        :library-type="libraryType"
        preserve-height-on-reopen
        @close="showLibrary = false"
      />
    </div>
    <canvas id="mxCanvas"></canvas>
    <div class="history_box">
      <transition name="slide">
        <div class="history_btn_list" v-if="state">
          <button v-for="item in historyBtnList" class="history_btn zoomed" @click.stop="onHistoryBtnClick(item)">
            <div class="history_btn_content">
              <MxIcon :icon="item.icon" :isDefault="item.isIconDefault"></MxIcon>
            </div>
          </button>
        </div>
      </transition>
      <button class="history_btn" @click.stop="() => toggle()">
        <van-icon class="history_btn_icon" :name="state
          ? './mxcustomui/history_close.png'
          : './mxcustomui/history_open.png'
          "></van-icon>
      </button>
    </div>
    <div class="footer">
      <MxToolbar class="object_editing_toolbar" :items="objectEditingToolbarItems" v-show="isShowObjectEditingToolbar"
        @tap="onObjectEditingBtnTap" />
      <transition name="fade">
        <div class="bubble_dialog" v-if="currentItem && currentItem.list">
          <div class="bubble_dialog_box chamfer">
            <div class="bubble_dialog_content chamfer">
              <MxToolbar class="bubble_dialog_content_toolbar" :items="currentItem.list" @tap="onClick" />
            </div>
          </div>
          <div class="arrow_box">
            <div class="arrow" :style="{
              left: left + 'px',
            }"></div>
          </div>
        </div>
      </transition>
      <MxToolbar :items="uiConfig.toolbarData || []" @tap="onTap" />
    </div>
  </div>
</template>
<style lang='scss'>
.van-popover__arrow {
  --van-popover-light-background:  var(--accent-secondary);

}

.van-popover__content {
  --van-popover-action-width: auto;
  --van-popover-radius: 0;
  border-top: 2px solid var(--accent-secondary);
  border-radius: 0;
}

.van-popover__action {
  border-bottom: 2px solid #202020;
  --van-popover-action-height: 30px;
  --van-popover-action-font-size: var(--van-font-size-xs);

  &:active {
    background: #666666;
  }

  .van-toast {
    --van-toast-background: #333333c7;
  }

  .van-hairline--bottom:after {
    border-bottom-width: 0
  }

}
</style>
<style scoped lang="scss">
.needle-handle {
  --handleSize: 70px;
  display: none;
  position: absolute;
  width: var(--handleSize);
  height: var(--handleSize);
  cursor: move;
  border-radius: 50%;
  transform: translate(calc(50vw - 35px), calc(50vh - 35px));

  &:before {
    content: '';
    position: absolute;
    top: 5px;
    /* 控制内外圆的间距，调整以改变环的宽度 */
    left: 5px;
    right: 5px;
    bottom: 5px;
    border-radius: inherit;
    background-color: color-mix(in srgb, var(--text-tertiary) 80%, transparent);
  }

  &:after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: inherit;
    border: 1px solid color-mix(in srgb, var(--text-tertiary) 80%, transparent);
    /* 环的边框颜色和宽度 */
    box-sizing: border-box;
  }
}

.singleArrow {
  display: none;
  width: 120px;
  height: 1px;
  position: absolute;
  background-color: var(--text-tertiary);
  transform-origin: left;
  transform: translate(50vw, 50vh) rotate(-110deg);
  opacity: 0.8;
}

.singleArrow_tip {
  display: none;
  width: 10px;
  height: 10px;
  display: block;
  position: absolute;
  top: -5px;
  right: -5px;
  transform: rotate(140deg);
}

.singleArrow_tip::after {
  content: '';
  position: absolute;
  width: 1px;
  height: 30px;
  background: var(--text-tertiary);
  transform: rotate(-30deg);
  transform-origin: top;
}

.singleArrow_tip::before {
  content: '';
  position: absolute;

  width: 1px;
  height: 30px;
  background: var(--text-tertiary);
  transform: rotate(290deg);
  transform-origin: top;
}

.zoomed:active {
  transform: scale(1.2);
}

.colorPicker {
  position: absolute;
  top: 100px;
  left: 20%;
  z-index: 100;
}

.color_box {
  width: 17px;
  height: 17px;
}

.floating_right_box_list {
  position: absolute;
  overflow: hidden;
  top: 44px;
  right: 50px;
  width: 90px;
  max-height: 300px;
  background-color: color-mix(in srgb, var(--bg-elevated) 80%, transparent);
  margin-right: 10px;

  .floating_right_box_list_item {
    width: 100%;
    padding: 0;
    height: 35px;
    margin-bottom: 5px;
    overflow: hidden;
    --zoomed-scale: 1.1;
    font-size: 20px;
  }
}

.object_editing_toolbar {
  border-radius: 10px;
  margin-bottom: 5px;
  border: 2px solid var(--primary);
}

.chamfer {
  background:
    linear-gradient(135deg,
      transparent var(--leftTopChamferDist, 3px),
      var(--leftTopChamferColor, var(--accent)) 0) top left,
    linear-gradient(-135deg,
      transparent var(--rightTopChamferDist, 3px),
      var(--rightTopChamferColor, var(--accent)) 0) top right,
    linear-gradient(-45deg,
      transparent var(--rightBottomChamferDist, 3px),
      var(--rightBottomChamferColor, var(--accent)) 0) bottom right,
    linear-gradient(45deg,
      transparent var(--leftBottomChamferDist, 3px),
      var(--leftBottomChamferColor, var(--accent)) 0) bottom left;
  background-size: var(--bgSize1, 50.1%) var(--bgSize2, 50.1%);
  background-repeat: no-repeat;
}

.bubble_dialog {
  &.fade-enter-active {
    transition: all 0.2s ease-in-out;
  }

  &.fade-enter-from {
    opacity: 0;
    transform: translateY(100%);
    /*  ‍ 元素初始位置向下偏移其自身高度 */
    /* ‍ The initial position of the element is offset downwards by its own height*/
  }

  &.fade-enter-to {
    opacity: 1;
    transform: translateY(0);
    /*  ‍ 元素最终位置回到正常 */
    /* ‍ The final position of the element returns to normal*/
  }

  &.fade-leave-active {
    transition: all 0.2s ease-in-out;
  }

  &.fade-leave-from {
    opacity: 1;
    transform: translateY(0);
  }

  &.fade-leave-to {
    opacity: 0;
    transform: translateY(100%);
    /*  ‍ 离开时向下偏移，可选，根据实际需求调整 */
    /* ‍ Shift downwards when leaving, optional, adjust according to actual needs*/
  }

  .bubble_dialog_box {
    height: 57px;
    padding-top: 2px;
    margin: 0 5px;
    --bgSize1: 80%;
    --leftTopChamferColor: var(--bg-primary);
    --rightTopChamferColor: var(--bg-primary);
  }

  .bubble_dialog_content_toolbar {
    --toolbar-name-min-width: 50px;
    --toolbar-padding: 0;
  }

  .bubble_dialog_content {
    display: flex;
    --leftTopChamferColor: var(--bg-primary);
    --rightTopChamferColor: var(--bg-primary);
    --rightBottomChamferColor: var(--bg-primary);
    --leftBottomChamferColor: var(--bg-primary);
    --rightBottomChamferDist: 0;
    --leftBottomChamferDist: 0;
  }

  .arrow_box {
    position: relative;
    width: 100%;
    height: 12px;
    margin-top: -1px;
  }

  .arrow {
    position: absolute;
    width: 0;
    height: 0;
    border-top: 12px solid var(--accent);
    border-right: 6px solid transparent;
    border-bottom: 0 solid transparent;
    border-left: 6px solid transparent;
  }
}

.mxCanvasBox {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: calc(var(--vh, 1vh) * 100);
  background: var(--bg-primary);

  .header {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0 var(--van-padding-xs);
    color: var(--text-primary);
    margin-top: 5px;
    height: 30px;

    .draw_name {
      text-align: center;
      height: 30px;
      line-height: 30px;
      background: color-mix(in srgb, var(--bg-tertiary) 80%, #628591 20%);
      width: 300px;
      margin-right: 5px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .top_toolbar {
      display: flex;
      align-items: center;
      height: 100%;
      background-color: color-mix(in srgb, var(--bg-tertiary) 85%, transparent 15%);
      border-radius: var(--van-radius-md);
      --zoomed-scale: 1.5;
      --icon-size: 24px;

      .item {
        width: 30px;
        margin-right: 5px;
      }
    }
  }

  .footer {
    width: 100%;
    position: absolute;
    bottom: 0;
  }
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--bg-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.loading-content {
  text-align: center;
}

.loading-text {
  color: var(--text-primary);
  margin-top: 16px;
  font-size: 16px;
}

.upload-progress-bar {
  position: relative;
  width: 200px;
  height: 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  margin: 12px auto 0;
  overflow: hidden;
}

.upload-progress-fill {
  height: 100%;
  background: var(--primary, #4fc3f7);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.upload-progress-text {
  display: block;
  color: var(--text-primary);
  font-size: 12px;
  margin-top: 6px;
}

.error-actions {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}

.version-badge {
  position: absolute;
  top: -4px;
  left: calc(50%);
  transform: translateX(-50%);
  background: var(--accent-secondary);
  color: #fff;
  font-size: 11px;
  padding: 0px 8px;
  border-radius: 6px;
  z-index: 10;
  white-space: nowrap;
}

.cmd_operation_btn_list {
  position: absolute;
  right: 0;
  top: 40px;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;

  .item {
    width: 30px;
    height: 30px;
    margin-right: 5px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--bg-elevated) 75%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.history_box {
  display: flex;
  position: absolute;
  color: var(--text-primary);
  right: 0;
  bottom: 65px;
  --icon-size: 24px;

  .history_btn_list {
    display: flex;

    &.slide-enter-active,
    &.slide-leave-active {
      transition: all 0.1s ease;
    }

    &.slide-enter-from {
      transform: translateX(100%);
    }
  }

  .history_btn {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 30px;
    height: 30px;
    border-radius: 5px;
    background-color: var(--bg-elevated);
    margin-right: 8px;
    padding: 0;

    .history_btn_icon {
      font-size: 30px;
    }

    --zoomed-scale: 1.4;

    .history_btn_content {
      transform: scale(1);
    }
  }
}
</style>
