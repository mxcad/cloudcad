import { UrlHelper } from '@/utils/mxcadUtils';
import { read } from '@/lib/browserStorage';
import {
  getAppBrandSnapshot,
  getRuntimeBrandField,
} from '@/constants/appConfig';

const UI_CONFIG_PATH = 'ini/myUiConfig.json';

let cachedUiConfig: { brandKey: string; url: string } | null = null;

/**
 * CAD 编辑器自身的 chrome（标题栏标题 + 标题栏 Logo）取自静态
 * `ini/myUiConfig.json`，不经过运行时配置。这里读出后按当前品牌就地覆写，
 * 交给引擎一个 blob URL：
 *   - `title` / `headerTitle`：只由**编辑器专属**的 `brandEditorTitle` 驱动，
 *     留空保持 ini 自带值。刻意不跟随 `brandTitle`（平台品牌名，用于页签
 *     与认证页）——两个产品面互不牵连，改平台名不应改编辑器标题栏文案。
 *   - `logoImg`：始终跟随品牌 Logo 链（`brandLogo`）——留空时该链回落到与 ini
 *     同值的内置默认 Logo，故无回归。
 * 取文件失败时退回静态 URL，编辑器功能不受品牌配置影响。
 */
async function resolveUiConfigUrl(configUrl: string): Promise<string> {
  const staticUrl = `${configUrl}/${UI_CONFIG_PATH}`;
  const brand = getAppBrandSnapshot();
  const editorTitle = getRuntimeBrandField('brandEditorTitle');
  const brandKey = `${brand.logo}|${editorTitle}`;

  if (cachedUiConfig && cachedUiConfig.brandKey === brandKey) {
    return cachedUiConfig.url;
  }

  let url = staticUrl;
  try {
    // eslint-disable-next-line no-restricted-globals -- 豁免：静态编辑器配置 /ini/myUiConfig.json（非后端 API，ADR-0034 豁免清单）
    const res = await fetch(staticUrl);
    if (res.ok) {
      const uiConfig = (await res.json()) as Record<string, unknown>;
      if (editorTitle) {
        if (typeof uiConfig.title === 'string') uiConfig.title = editorTitle;
        if (typeof uiConfig.headerTitle === 'string') {
          uiConfig.headerTitle = editorTitle;
        }
      }
      if (typeof uiConfig.logoImg === 'string') uiConfig.logoImg = brand.logo;
      url = URL.createObjectURL(
        new Blob([JSON.stringify(uiConfig)], { type: 'application/json' })
      );
    }
  } catch (error) {
    console.warn('[MxCAD] 读取编辑器 UI 配置失败，使用静态配置:', error);
  }

  if (cachedUiConfig && cachedUiConfig.url !== staticUrl) {
    URL.revokeObjectURL(cachedUiConfig.url);
  }
  cachedUiConfig = { brandKey, url };
  return url;
}

let isThemeSyncInitialized = false;

export async function initThemeSync(): Promise<void> {
  if (isThemeSyncInitialized) return;

  try {
    const { mxcadApp } = await import('mxcad-app');
    const vuetify = await mxcadApp.getVuetify();

    const originalChange = vuetify.theme.change.bind(vuetify.theme);
    vuetify.theme.change = (name: string) => {
      originalChange(name);
      window.dispatchEvent(
        new CustomEvent('mxcad-theme-changed', {
          detail: { isDark: name === 'dark' },
        })
      );
    };

    const storedTheme = read('mx-user-dark');
    const userThemeIsDark = storedTheme ? storedTheme === 'true' : true;
    const currentMxcadTheme = vuetify.theme.global.name.value;
    const mxcadIsDark = currentMxcadTheme === 'dark';

    if (userThemeIsDark !== mxcadIsDark) {
      vuetify.theme.change(userThemeIsDark ? 'dark' : 'light');
    }

    const handleReactThemeChanged = (e: Event) => {
      const { isDark: newIsDark } = (e as CustomEvent<{ isDark: boolean }>)
        .detail;
      const target = newIsDark ? 'dark' : 'light';
      if (vuetify.theme.global.name.value !== target) {
        vuetify.theme.change(target);
      }
    };
    window.addEventListener('react-theme-changed', handleReactThemeChanged);

    isThemeSyncInitialized = true;
  } catch (error) {
    console.warn('[ThemeSync] 主题同步初始化失败:', error);
  }
}

export async function initMxCADConfig(currentFile?: {
  parentId?: string | null;
  id?: string;
}) {
  const { mxcadApp } = await import('mxcad-app');
  const configUrl = window.location.origin;
  // 与 mxcadAssetsPlugin 的 outputDir（mxcad-app/mxcadAppAssets）保持一致：
  // 整个 mxcad-app 目录 = npm 包 dist 原样，可整体覆盖更新
  mxcadApp.setStaticAssetPath('/mxcad-app/mxcadAppAssets/');
  mxcadApp.initConfig({
    uiConfig: await resolveUiConfigUrl(configUrl),
    sketchesUiConfig: `${configUrl}/ini/mySketchesAndNotesUiConfig.json`,
    serverConfig: `${configUrl}/ini/myServerConfig.json`,
    quickCommandConfig: `${configUrl}/ini/myQuickCommand.json`,
    themeConfig: `${configUrl}/ini/myVuetifyThemeConfig.json`,
  });

  mxcadApp.initPrintConfig({
    callback: async (data: Blob, params) => {
      const {
        showGlobalLoading,
        hideGlobalLoading,
        setLoadingMessage,
        setLoadingProgress,
      } = await import('@/services/loadingService');
      const { calculateFileHash } = await import('@/utils/hashUtils');
      const { uploadFile } = await import('@/utils/mxcadUploadUtils');
      const { publicFileControllerConvertAndDownload } =
        await import('@/api-sdk');
      const { t } = await import('@/languages');
      showGlobalLoading(t('正在上传打印文件...'));
      const file = new File([data], 'print.mxweb', {
        type: 'application/octet-stream',
      });
      const hash = await calculateFileHash(file);
      await uploadFile({
        file,
        hash,
        nodeId: '',
        forceUpload: true,
        skipDb: true,
        onProgress: (percentage: number) => {
          setLoadingMessage(
            percentage === 100
              ? t('打印转换中...')
              : `${t('正在上传打印文件...')} ${percentage.toFixed(1)}%`
          );
          setLoadingProgress(percentage);
        },
      });

      const result = await publicFileControllerConvertAndDownload({
        body: {
          fileHash: hash,
          format: 'pdf',
          params: { cmd: 'print_to_pdf', ...params },
        },
      });

      hideGlobalLoading();
      // SDK 默认不抛错：失败时错误在 result.error，记录真实原因（打印配置降级为空模板）
      if (result?.error) {
        const { handleError } = await import('@/utils/errorHandler');
        handleError(result.error, 'initMxCAD: initPrintConfig');
      }
      const blob = result?.data as Blob | undefined;
      return blob ? URL.createObjectURL(blob) : '';
    },
  });

  mxcadApp.initCutConfig({
    callback: async (data: Blob, box) => {
      const {
        showGlobalLoading,
        hideGlobalLoading,
        setLoadingMessage,
        setLoadingProgress,
      } = await import('@/services/loadingService');
      const { calculateFileHash } = await import('@/utils/hashUtils');
      const { uploadFile } = await import('@/utils/mxcadUploadUtils');
      const { publicFileControllerConvertAndDownload } =
        await import('@/api-sdk');
      const { t } = await import('@/languages');
      showGlobalLoading(t('正在上传裁剪文件...'));
      const file = new File([data], 'cut.mxweb', {
        type: 'application/octet-stream',
      });
      const hash = await calculateFileHash(file);
      await uploadFile({
        file,
        hash,
        nodeId: '',
        forceUpload: true,
        skipDb: true,
        onProgress: (percentage: number) => {
          setLoadingMessage(
            percentage === 100
              ? t('裁剪转换中...')
              : `${t('正在上传裁剪文件...')} ${percentage.toFixed(1)}%`
          );
          setLoadingProgress(percentage);
        },
      });

      const result = await publicFileControllerConvertAndDownload({
        body: {
          fileHash: hash,
          format: 'dwg',
          params: { cmd: 'cut_dwg', ...box.param },
        },
      });

      hideGlobalLoading();
      // SDK 默认不抛错：失败时错误在 result.error，记录真实原因（裁剪配置降级为空模板）
      if (result?.error) {
        const { handleError } = await import('@/utils/errorHandler');
        handleError(result.error, 'initMxCAD: initCutConfig');
      }
      const blob = result?.data as Blob | undefined;
      return blob ? URL.createObjectURL(blob) : '';
    },
  });

  mxcadApp.initCustomUploadConfig({
    callback: async (file: File) => {
      const {
        showGlobalLoading,
        hideGlobalLoading,
        setLoadingMessage,
        setLoadingProgress,
      } = await import('@/services/loadingService');
      const { calculateFileHash } = await import('@/utils/hashUtils');
      const { uploadFile } = await import('@/utils/mxcadUploadUtils');
      const { mxcadManager } = await import('./mxcadManager');
      const { t } = await import('@/languages');
      showGlobalLoading(t('正在上传文件...'));
      const hash = await calculateFileHash(file);
      await uploadFile({
        file,
        hash,
        nodeId: '',
        onProgress: (percentage: number) => {
          if (percentage === 100) {
            setLoadingMessage(t('图纸转换中...'));
          } else {
            setLoadingMessage(
              `${t('正在上传文件...')} ${percentage.toFixed(1)}%`
            );
          }
          setLoadingProgress(percentage);
        },
      });

      mxcadManager.setPendingFileInfo({
        fileId: '',
        parentId: null,
        projectId: null,
        name: file.name,
        personalSpaceId: null,
        // 本地图纸协同识别的唯一标识（drawingId 为空串，按内容 MD5 匹配）
        fileHash: hash,
      });

      const ext = file.name.includes('.')
        ? file.name.substring(file.name.lastIndexOf('.'))
        : '';
      const fileUrl = UrlHelper.buildPublicFileAccessUrl(`${hash}${ext}.mxweb`);
      hideGlobalLoading();
      return { fileUrl };
    },
  });
}
