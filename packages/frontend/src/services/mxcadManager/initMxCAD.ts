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

    const storedTheme = localStorage.getItem('mx-user-dark');
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
  mxcadApp.setStaticAssetPath('/mxcadAppAssets/');
  mxcadApp.initConfig({
    uiConfig: `${configUrl}/ini/myUiConfig.json`,
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
      });

      const ext = file.name.includes('.')
        ? file.name.substring(file.name.lastIndexOf('.'))
        : '';
      const fileUrl = `/api/v1/public-file/access/${hash}${ext}.mxweb`;
      hideGlobalLoading();
      return { fileUrl };
    },
  });
}
