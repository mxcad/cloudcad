import {
  mxCadControllerCheckFileExist,
} from '../api-sdk';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingNodeId: string | null;
}

export async function checkDuplicateFile(
  fileHash: string,
  filename: string,
  fileSize: number,
  nodeId?: string,
): Promise<DuplicateCheckResult> {
  try {
    const result = await mxCadControllerCheckFileExist({
      body: {
        fileSize,
        fileHash,
        filename,
        nodeId: nodeId || '',
      },
    });
    const data = result.data as unknown as { exists: boolean; nodeId?: string } | undefined;
    if (data?.exists) {
      return { isDuplicate: true, existingNodeId: data.nodeId || null };
    }
    return { isDuplicate: false, existingNodeId: null };
  } catch {
    return { isDuplicate: false, existingNodeId: null };
  }
}

export interface DuplicateFileAction {
  action: 'open-existing' | 'upload-new' | 'cancel';
}

export function showDuplicateFileDialog(
  fileName: string,
): Promise<DuplicateFileAction> {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const handleAction = (action: DuplicateFileAction['action']) => {
      document.body.removeChild(container);
      resolve({ action });
    };

    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.5); display: flex; align-items: center;
      justify-content: center; z-index: 2000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      width: 85%; max-width: 380px; background: #2a2a2a; border-radius: 12px;
      overflow: hidden; color: #fff;
    `;

    dialog.innerHTML = `
      <div style="padding:20px 16px 12px;text-align:center;">
        <div style="font-size:16px;font-weight:600;margin-bottom:8px;">文件已存在</div>
        <div style="font-size:14px;color:#ccc;line-height:1.5;">
          「${fileName}」已存在于服务器中
        </div>
      </div>
      <div style="padding:8px 16px 16px;display:flex;flex-direction:column;gap:8px;">
        <button class="dup-btn dup-btn-primary" data-action="open-existing">打开已有文件</button>
        <button class="dup-btn dup-btn-default" data-action="upload-new">重新上传并覆盖</button>
        <button class="dup-btn dup-btn-cancel" data-action="cancel">取消</button>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .dup-btn { width:100%; padding:12px; border:none; border-radius:8px;
        font-size:15px; cursor:pointer; text-align:center; }
      .dup-btn-primary { background:#1989fa; color:#fff; }
      .dup-btn-default { background:#3a3a3a; color:#ccc; }
      .dup-btn-cancel { background:transparent; color:#999; }
      .dup-btn:active { opacity:0.8; }
    `;
    document.head.appendChild(style);

    dialog.querySelectorAll('.dup-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.action as DuplicateFileAction['action'];
        document.head.removeChild(style);
        handleAction(action);
      });
    });

    backdrop.appendChild(dialog);
    container.appendChild(backdrop);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        document.head.removeChild(style);
        handleAction('cancel');
      }
    });
  });
}
