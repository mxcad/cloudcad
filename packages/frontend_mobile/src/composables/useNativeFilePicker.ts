import { calculateFileHash } from '@/utils/hashUtils';
import { uploadFile, getFileExt, MobileUploadResult } from '@/services/mobileUploadService';
import { useEditorStore } from '@/stores/editor';
import { showFailToast } from 'vant';
import { t } from '@/languages';

const PICKER_ID = 'mxcad-native-file-picker';

export interface FilePickerResult {
  hash: string;
  type: string;
  ext: string;
  name: string;
  size: number;
  file: {
    name: string;
    source: File;
  };
  isUseServerExistingFile: boolean;
}

/**
 * 源格式：引擎能直接读的格式。这类文件不走上传——既不需要服务端转换，
 * 也不占存储与转换配额；调用方以 blob URL 直接打开 file.source。
 */
const SOURCE_FORMATS = new Set(['mxweb']);

type FilePickerCallback = (result: FilePickerResult) => void;

function getPickerEl(): HTMLInputElement {
  let picker = document.getElementById(PICKER_ID) as HTMLInputElement;
  if (!picker) {
    picker = document.createElement('input');
    picker.id = PICKER_ID;
    picker.type = 'file';
    picker.accept = '.dwg,.dxf,.mxweb,.DWG,.DXF,.MXWEB';
    picker.style.display = 'none';
    document.body.appendChild(picker);
  }
  return picker;
}

export function showFilePicker(
  callback: FilePickerCallback,
  noCache = false,
  showLoading = false
): void {
  const input = getPickerEl();

  input.onchange = async (e: Event) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const editorStore = useEditorStore();

    // 遮罩只在出错时复位：成功路径的 loading 交由调用方按阶段推进（uploading →
    // converting → opening），这里无条件关掉会让转换/打开阶段失去遮罩
    const resetLoading = (): void => {
      if (!showLoading) return;
      editorStore.setLoading(false);
      editorStore.setProgressStage('idle');
    };

    if (showLoading) {
      editorStore.setProgressStage('uploading');
      editorStore.setLoading(true);
    }

    let hash: string;
    try {
      hash = await calculateFileHash(file);
    } catch (err) {
      // 读文件失败（损坏/被回收），此时尚未发起任何上传
      console.error('File hash failed:', err);
      resetLoading();
      showFailToast(t('文件上传失败'));
      return;
    }

    const ext = getFileExt(file.name);
    // 源格式不上传：调用方以 blob URL 直接打开 file.source
    if (SOURCE_FORMATS.has(ext)) {
      callback({
        hash,
        type: ext,
        ext,
        name: file.name,
        size: file.size,
        file: { name: file.name, source: file },
        isUseServerExistingFile: false,
      });
      return;
    }

    try {
      const result: MobileUploadResult = await uploadFile({
        file,
        hash,
        nodeId: '',
        forceUpload: noCache,
        onProgress: (pct) => {
          if (showLoading) {
            editorStore.setUploadProgress(pct);
          }
        },
      });

      callback({
        hash: result.hash,
        type: result.ext,
        ext: result.ext,
        name: result.name,
        size: result.size,
        file: {
          name: result.name,
          source: result.file,
        },
        isUseServerExistingFile: result.isUseServerExistingFile,
      });
    } catch (err) {
      // 上传失败的 toast 由 mobileUploadService 负责，这里不重复提示
      console.error('File upload failed:', err);
      resetLoading();
    }
  };

  input.value = '';
  input.click();
}

export function destroyFilePicker(): void {
  const picker = document.getElementById(PICKER_ID);
  if (picker) {
    picker.remove();
  }
}
