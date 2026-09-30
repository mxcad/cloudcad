/**
 * 打开系统文件选择框（create-dispose 形态的唯一出口）。
 *
 * resolve 用户选中的文件数组；用户取消时 onchange 不触发，promise 保持
 * pending（调用方无需处理，等价于旧的「取消后什么都不做」回调语义）。
 * 需要元素常驻复用的选择器（CAD 打开图纸的单例 picker）不在此列。
 */
export interface PickFilesOptions {
  /** 文件类型过滤（input.accept，如 '.dwg,image/*'） */
  accept?: string;
  /** 是否允许多选（默认单选） */
  multiple?: boolean;
}

export function pickFiles(options: PickFilesOptions = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options.accept) input.accept = options.accept;
    input.multiple = options.multiple ?? false;
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : [];
      input.onchange = null;
      if (input.parentNode) input.parentNode.removeChild(input);
      resolve(files);
    };

    input.click();
  });
}
