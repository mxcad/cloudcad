import { openMxWeb } from '@/plugins/mxcad/openMxWeb';
import { showFilePicker, FilePickerResult } from '@/composables/useNativeFilePicker';
import { showToastOnce } from '@/utils/toast';
import { cachedApiUrl } from '@/utils/apiConfig';
import { waitPublicConversion } from '@/services/conversionStream';
import { checkPublicFileExternalRefs } from '@/composables/useFileLoader';
import { useEditorState } from '@/composables/useEditorState';
import { useOpenGuard } from '@/composables/useOpenGuard';
import { addCommand } from '@/plugins/mxcad/command';
import { FetchAttributes } from 'mxcad';
import { t } from '@/languages';

/**
 * 「打开文件」：从本机选一张图纸打开（对齐 PC 的 openFile / openFile_noCache）。
 *
 * 两种格式两条路径：
 *
 * - .mxweb 是源格式，引擎能直接读：不上传、不转换，以 blob URL 就地打开
 *   （PC 走 IndexedDB 虚拟盘 `local/<md5>.mxweb`，移动端沿用 blob URL——
 *   useFileLoader 的缓存命中路径是同一机制）。
 * - .dwg / .dxf 必须服务端转换：走无节点（公开）上传路径（nodeId 为空），
 *   然后订阅 per-file 转换 SSE 等 COMPLETED，再打开
 *   /api/v1/public-file/access/<hash>.<ext>.mxweb。
 *   access 端点按 hash 在 uploads/ 里找 mxweb，未就位直接 404，引擎只会把它
 *   报成「打开图纸失败」——所以必须先拿到转换终态再打开，不能上传完就去开。
 *
 * 打开成功只设 fileName / fileHash / isPublicFile：fileId 保持空，保存因此退化为
 * 「另存为到云图」，与 PC 对本地打开文件的处理一致（没有节点可以写回）。
 */

/** 「无缓存打开」的引擎 fetch 标志位：绕过 IndexedDB 与浏览器缓存重新拉取 */
const NO_CACHE_FETCH_ATTRIBUTES =
  FetchAttributes.EMSCRIPTEN_FETCH_LOAD_TO_MEMORY |
  FetchAttributes.EMSCRIPTEN_FETCH_PERSIST_FILE |
  FetchAttributes.EMSCRIPTEN_FETCH_REPLACE;

function applyOpenSuccess(param: FilePickerResult): void {
  const editorState = useEditorState();
  editorState.setIsActive(true);
  editorState.setFileName(param.name);
  editorState.setIsPublicFile(true);
  editorState.setFileHash(param.hash);
}

/** 源格式：blob URL 就地打开，无服务端往返 */
async function openLocalMxweb(param: FilePickerResult): Promise<boolean> {
  const editorState = useEditorState();
  editorState.resetFileState();
  editorState.setProgressStage('opening');

  const objectUrl = URL.createObjectURL(param.file.source);
  try {
    const opened = await openMxWeb(objectUrl);
    if (opened) {
      applyOpenSuccess(param);
    } else {
      showToastOnce(t('打开图纸失败'));
    }
    return opened;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** CAD 图纸：等转换终态后打开服务端产出的 mxweb */
async function openConvertedCad(
  param: FilePickerResult,
  noCache: boolean
): Promise<boolean> {
  const editorState = useEditorState();
  editorState.resetFileState();
  editorState.setProgressStage('converting');

  const status = await waitPublicConversion(param.hash);
  if (status !== 'COMPLETED') {
    showToastOnce(t('转换失败'));
    return false;
  }

  // 转换已完成后查外部参照是否缺失（缺失则弹补传弹窗），此时 preloading.json 已就位
  await checkPublicFileExternalRefs(param.hash);

  editorState.setProgressStage('opening');
  const url = cachedApiUrl(
    `/public-file/access/${param.hash}.${param.ext}.mxweb`
  );
  const opened = await openMxWeb(url, {
    fetchAttributes: noCache ? NO_CACHE_FETCH_ATTRIBUTES : undefined,
  });
  if (opened) {
    applyOpenSuccess(param);
  } else {
    showToastOnce(t('打开图纸失败'));
  }
  return opened;
}

/** 选完文件后的打开流程；无论成功失败都要收起遮罩，否则画布被永久遮住 */
async function openPicked(
  param: FilePickerResult,
  noCache: boolean
): Promise<boolean> {
  const editorState = useEditorState();
  try {
    return param.type === 'mxweb'
      ? await openLocalMxweb(param)
      : await openConvertedCad(param, noCache);
  } finally {
    editorState.setLoading(false);
  }
}

function runOpenCommand(noCache: boolean): void {
  const { guardBeforeOpen } = useOpenGuard();

  void (async () => {
    // 移动端无多窗口，打开即替换当前图纸：有未保存更改先确认
    if (!(await guardBeforeOpen())) return;

    showFilePicker(async (param) => {
      await openPicked(param, noCache);
    }, noCache, true);
  })();
}

addCommand('OpenDwg', () => runOpenCommand(false));

addCommand('OpenDwg_DoNotUseCache', () => runOpenCommand(true));
