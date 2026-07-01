import { calculateFileHash } from '@/utils/hashUtils';
import { uploadFile, MobileUploadResult } from '@/services/mobileUploadService';
import { handleApiError } from '@/utils/apiConfig';
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

export function showFilePicker(callback: FilePickerCallback, noCache = false): void {
  const input = getPickerEl();

  input.onchange = async (e: Event) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;

    const file = files[0];
    try {
      const hash = await calculateFileHash(file);

      const result: MobileUploadResult = await uploadFile({
        file,
        hash,
        nodeId: '',
        forceUpload: noCache,
        onProgress: (pct) => {
          console.log(`upload progress: ${pct.toFixed(1)}%`);
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
      console.error('File upload failed:', err);
      handleApiError(err, t('文件上传失败'));
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
