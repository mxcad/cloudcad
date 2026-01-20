import { MxCADView } from 'mxcad-app';
import { Logger } from '../utils/mxcadUtils';
import { apiService } from './apiService';
import { MxFun } from 'mxdraw';
import { McGePoint3d, MxCpp } from 'mxcad';

// 当前打开的文件信息（用于返回逻辑）
let currentFileInfo: {
  fileId: string;
  parentId: string | null;
  projectId: string | null;
  name: string;
} | null = null;

// React Router navigate 函数（由 CADEditorDirect 组件设置）
let navigateFunction: ((path: string) => void) | null = null;

/**
 * 设置当前文件信息（由 CADEditorDirect 组件调用）
 */
export function setCurrentFileInfo(fileInfo: {
  fileId: string;
  parentId: string | null;
  projectId: string | null;
  name: string;
}) {
  currentFileInfo = fileInfo;
  Logger.info('设置当前文件信息', fileInfo);
}

/**
 * 设置 navigate 函数（由 CADEditorDirect 组件调用）
 */
export function setNavigateFunction(navigate: (path: string) => void) {
  navigateFunction = navigate;
  Logger.info('设置 navigate 函数');
}

/**
 * 清除当前文件信息和 navigate 函数
 */
export function clearCurrentFileInfo() {
  currentFileInfo = null;
  navigateFunction = null;
  Logger.info('清除当前文件信息');
}

MxFun.addCommand('return-to-cloud-map-management', () => {
  Logger.info('========== 执行返回命令 ==========');
  Logger.info('currentFileInfo:', JSON.stringify(currentFileInfo, null, 2));

  if (!currentFileInfo) {
    Logger.warn('当前文件信息不存在，返回项目列表');
    if (navigateFunction) {
      Logger.info('调用 navigateFunction("/projects")');
      navigateFunction('/projects');
    } else {
      console.warn('navigate 函数未设置，无法返回');
    }
    return;
  }

  const { fileId, parentId, projectId } = currentFileInfo;
  Logger.info(`解析结果: fileId=${fileId}, parentId=${parentId}, projectId=${projectId}`);

  // 优先返回到文件所在的父文件夹
  if (parentId) {
    // 如果有项目 ID，返回到项目内的文件夹
    if (projectId) {
      const targetPath = `/projects/${projectId}/files/${parentId}`;
      Logger.info(`路径A - 有parentId和projectId: ${targetPath}`);
      if (navigateFunction) {
        Logger.info('调用 navigateFunction(pathA)');
        navigateFunction(targetPath);
      } else {
        console.warn('navigate 函数未设置，无法返回');
      }
    } else {
      // 如果没有项目 ID，尝试直接使用 parentId 作为项目 ID
      const targetPath = `/projects/${parentId}/files`;
      Logger.info(`路径B - 有parentId无projectId: ${targetPath}`);
      if (navigateFunction) {
        Logger.info('调用 navigateFunction(pathB)');
        navigateFunction(targetPath);
      } else {
        console.warn('navigate 函数未设置，无法返回');
      }
    }
  } else if (projectId) {
    // 如果没有父文件夹但有项目 ID，返回到项目根目录
    const targetPath = `/projects/${projectId}/files`;
    Logger.info(`路径C - 无parentId有projectId: ${targetPath}`);
    if (navigateFunction) {
      Logger.info('调用 navigateFunction(pathC)');
      navigateFunction(targetPath);
    } else {
      console.warn('navigate 函数未设置，无法返回');
    }
  } else {
    // 最后备用：返回项目列表
    Logger.warn('无法确定返回路径，返回项目列表');
    if (navigateFunction) {
      Logger.info('调用 navigateFunction("/projects")');
      navigateFunction('/projects');
    } else {
      console.warn('navigate 函数未设置，无法返回');
    }
  }
  Logger.info('========== 返回命令执行完毕 ==========');
});
/**
 * MxCAD 容器管理器
 * 负责创建和管理永不销毁的全局容器
 */
class MxCADContainerManager {
  private static instance: MxCADContainerManager;
  private globalContainer: HTMLElement | null = null;

  private constructor() {
    this.createGlobalContainer();
  }

  static getInstance(): MxCADContainerManager {
    if (!MxCADContainerManager.instance) {
      MxCADContainerManager.instance = new MxCADContainerManager();
    }
    return MxCADContainerManager.instance;
  }

  private createGlobalContainer(): void {
    let container = document.getElementById('mxcad-global-container');

    if (!container) {
      container = document.createElement('div');
      container.id = 'mxcad-global-container';
      container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1;
        pointer-events: none;
      `;
      document.body.appendChild(container);
      Logger.info('创建永不销毁的全局容器');
    }

    this.globalContainer = container;
  }

  getContainer(): HTMLElement {
    if (!this.globalContainer) {
      throw new Error('全局容器未创建');
    }
    return this.globalContainer;
  }

  showContainer(show: boolean): void {
    if (this.globalContainer) {
      this.globalContainer.style.display = show ? 'block' : 'none';
      this.globalContainer.style.pointerEvents = show ? 'auto' : 'none';
      Logger.info(`${show ? '显示' : '隐藏'} MxCAD 容器`);
    }
  }

  clearContainer(): void {
    // 永远不要清空全局容器，保持 mxcadView 绑定的 DOM 元素
  }
}

/**
 * 获取当前上传节点 ID
 *
 * 从 URL 查询参数中读取 nodeId
 */
const getCurrentUploadNodeId = (): string => {
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('nodeId') || '';
  }
  return '';
};

/**
 * MxCAD 认证管理器
 * 负责配置全面的网络认证拦截器
 */
class MxCADAuthManager {
  private static instance: MxCADAuthManager;
  private isConfigured = false;
  private originalFetch: typeof fetch | null = null;
  private originalXHROpen: typeof XMLHttpRequest.prototype.open | null = null;
  private originalXHRSend: typeof XMLHttpRequest.prototype.send | null = null;

  private constructor() {}

  static getInstance(): MxCADAuthManager {
    if (!MxCADAuthManager.instance) {
      MxCADAuthManager.instance = new MxCADAuthManager();
    }
    return MxCADAuthManager.instance;
  }

  setupAuthInterceptor(): void {
    // 防止重复配置
    if (this.isConfigured) {
      Logger.info('MxCAD 认证拦截器已配置，跳过重复配置');
      return;
    }

    // 保存原始方法（只保存一次）
    if (!this.originalXHROpen) {
      this.originalXHROpen = XMLHttpRequest.prototype.open;
    }
    if (!this.originalXHRSend) {
      this.originalXHRSend = XMLHttpRequest.prototype.send;
    }
    if (!this.originalFetch) {
      this.originalFetch = window.fetch;
    }

    const originalOpen = this.originalXHROpen;
    const originalSend = this.originalXHRSend;
    const originalFetch = this.originalFetch;

    // 拦截 XMLHttpRequest
    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      ...args: any[]
    ) {
      const urlString = url.toString();
      if (urlString.includes('/mxcad/') || urlString.includes('/api/mxcad/')) {
        (this as any)._isMxCad = true;
        (this as any)._mxCadMethod = method.toUpperCase();
      }
      return originalOpen.call(this, method, url, ...args);
    };

    XMLHttpRequest.prototype.send = function (body?: any) {
      if ((this as any)._isMxCad) {
        // Authorization 由 globalAuth.ts 在底层统一处理
        // 这里只添加 MxCAD 项目上下文

        const method = (this as any)._mxCadMethod;
        if (method === 'POST' || method === 'PUT') {
          try {
            const bodyData = JSON.parse(body);

            // 优先保留请求体中已有的 nodeId
            // 只有在请求体中没有 nodeId 时，才从 URL 参数读取
            if (!bodyData.nodeId) {
              const currentNodeId = getCurrentUploadNodeId();
              if (currentNodeId) {
                bodyData.nodeId = currentNodeId;
              }
            }

            // 清理冗余参数
            if (bodyData.projectId) {
              delete bodyData.projectId;
            }
            if (bodyData.parentId) {
              delete bodyData.parentId;
            }

            const newBody = JSON.stringify(bodyData);
            return originalSend.call(this, newBody);
          } catch (error) {
            // 静默处理 JSON 解析错误
          }
        }
      }
      return originalSend.call(this, body);
    };

    // 拦截 fetch - 只添加项目上下文，不处理 Authorization
    window.fetch = function (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const urlString = typeof input === 'string' ? input : input.toString();

      if (urlString.includes('/mxcad/') || urlString.includes('/api/mxcad/')) {
        // Authorization 由 globalAuth.ts 在底层统一处理
        // 这里只添加 MxCAD 项目上下文

        const headers = new Headers(init?.headers || {});

        const modifiedInit: RequestInit = {
          ...init,
          headers,
        };

        const method = (init?.method || 'GET').toUpperCase();
        if (
          (method === 'POST' || method === 'PUT') &&
          init?.body &&
          typeof init.body === 'string'
        ) {
          try {
            const bodyData = JSON.parse(init.body);

            // 优先保留请求体中已有的 nodeId
            // 只有在请求体中没有 nodeId 时，才从 URL 参数读取
            if (!bodyData.nodeId) {
              const currentNodeId = getCurrentUploadNodeId();
              if (currentNodeId) {
                bodyData.nodeId = currentNodeId;
              }
            }

            // 清理冗余参数
            if (bodyData.projectId) {
              delete bodyData.projectId;
            }
            if (bodyData.parentId) {
              delete bodyData.parentId;
            }

            modifiedInit.body = JSON.stringify(bodyData);
          } catch (error) {
            // 静默处理 JSON 解析错误
          }
        }

        return originalFetch.call(window, input, modifiedInit);
      }

      return originalFetch.call(window, input, init);
    };

    this.isConfigured = true;
    Logger.info('MxCAD 认证拦截器已设置 (XHR + Fetch)');
  }

  /**
   * 清理所有拦截器，恢复原始方法
   */
  cleanup(): void {
    if (!this.isConfigured) {
      return;
    }

    Logger.info('清理 MxCAD 认证拦截器');

    // 恢复原始 fetch
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
      this.originalFetch = null;
    }

    // 恢复原始 XMLHttpRequest
    if (this.originalXHROpen) {
      XMLHttpRequest.prototype.open = this.originalXHROpen;
      this.originalXHROpen = null;
    }

    if (this.originalXHRSend) {
      XMLHttpRequest.prototype.send = this.originalXHRSend;
      this.originalXHRSend = null;
    }

    this.isConfigured = false;
    Logger.success('已清理所有 MxCAD 认证拦截器');
  }
}

/**
 * MxCAD 实例管理器
 * 负责管理 MxCADView 实例的生命周期
 */
class MxCADInstanceManager {
  private mxcadView: MxCADView | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  async initialize(initialFileUrl?: string): Promise<MxCADView> {
    Logger.info('MxCADView 初始化开始', {
      initialFileUrl,
      hasExistingView: !!this.mxcadView,
      isInitialized: this.isInitialized,
    });

    // 如果实例已存在且已初始化，直接返回现有实例
    if (this.mxcadView && this.isInitialized) {
      Logger.info('复用现有 MxCADView 实例');

      // 如果传入了新文件URL，则使用 openWebFile 打开新文件
      if (initialFileUrl) {
        Logger.info('切换到新文件', { initialFileUrl });
        await this.openFile(initialFileUrl);
      }

      return this.mxcadView;
    }

    // 如果正在初始化中，等待完成
    if (this.initPromise) {
      Logger.info('等待初始化完成');
      await this.initPromise;

      // 等待初始化完成后，如果有文件URL则打开
      if (initialFileUrl) {
        Logger.info('初始化完成后切换到新文件', { initialFileUrl });
        await this.openFile(initialFileUrl);
      }

      return this.mxcadView!;
    }

    // 创建新实例（只执行一次）
    Logger.info('创建新实例', { initialFileUrl });
    this.initPromise = this.createInstance(initialFileUrl);
    await this.initPromise;
    this.initPromise = null;

    return this.mxcadView!;
  }

  /**
   * 获取图框截图并生成缩略图
   */
  private async generateThumbnail(): Promise<string | undefined> {
    try {
      const mxcad = MxCpp.getCurrentMxCAD();
      mxcad.setAttribute({ ShowCoordinate: false });

      const { minPt, maxPt } = mxcad
        .getDatabase()
        .currentSpace.getBoundingBox();

      const w = Math.abs(minPt.x - maxPt.x);
      const h = Math.abs(minPt.y - maxPt.y);

      if (w < 1 || h < 1) {
        Logger.warn('图纸范围太小，无法生成缩略图');
        return undefined;
      }

      // 目标正方形边长
      const targetSize = 100;

      // 计算缩放比例（取宽高中较大的，确保图纸完整显示）
      const scale = Math.min(targetSize / w, targetSize / h);

      // 计算缩放后的尺寸
      const scaledWidth = w * scale;
      const scaledHeight = h * scale;

      // 计算居中偏移量
      const offsetX = (targetSize - scaledWidth) / 2;
      const offsetY = (targetSize - scaledHeight) / 2;

      // 调整边界框以居中显示
      const centerX = (minPt.x + maxPt.x) / 2;
      const centerY = (minPt.y + maxPt.y) / 2;

      const newMinPt = new McGePoint3d({
        x: centerX - (targetSize / 2) / scale,
        y: centerY - (targetSize / 2) / scale,
      });

      const newMaxPt = new McGePoint3d({
        x: centerX + (targetSize / 2) / scale,
        y: centerY + (targetSize / 2) / scale,
      });

      return new Promise<string | undefined>((resolve, reject) => {
        mxcad.mxdraw.createCanvasImageData(
          (imageData: string) => {
            mxcad.setAttribute({ ShowCoordinate: true });
            resolve(imageData);
          },
          {
            width: targetSize,
            height: targetSize,
            range_pt1: newMinPt,
            range_pt2: newMaxPt,
          }
        );
      });
    } catch (error) {
      Logger.error('生成缩略图失败', error);
      return undefined;
    }
  }

  /**
   * 上传缩略图
   */
  private async uploadThumbnail(
    nodeId: string,
    imageData: string
  ): Promise<boolean> {
    try {
      const blob = this.dataURLtoBlob(imageData);
      const formData = new FormData();
      formData.append('file', blob, 'thumbnail.png');

      await apiService.uploadThumbnail(nodeId, formData);
      Logger.success('缩略图上传成功');
      return true;
    } catch (error) {
      Logger.error('缩略图上传失败', error);
      return false;
    }
  }

  /**
   * 将 DataURL 转换为 Blob
   */
  private dataURLtoBlob(dataURL: string): Blob {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  private _openFile() {
      const onOpen = async () => {
        if(currentFileInfo) {
          globalThis.MxPluginContext.useFileName().fileName.value =
            ' - ' + currentFileInfo.name;
          
          // 查询缩略图
          try {
            const fileId = currentFileInfo.fileId;
            const thumbnailResult = await apiService.checkThumbnail(fileId);
            
            // 如果缩略图不存在，生成并上传
            if (!thumbnailResult.data.exists) {
              Logger.info('缩略图不存在，开始生成...');
              const imageData = await this.generateThumbnail();
   
              if (imageData) {
                Logger.info('缩略图生成成功，开始上传...');
                await this.uploadThumbnail(fileId, imageData);
              }
            }
          } catch (error) {
            Logger.error('缩略图处理失败', error);
          }
        }
        // 注意：不要在这里清除 currentFileInfo，返回命令需要用到它
        // currentFileInfo 只在组件卸载时通过 clearCurrentFileInfo() 清除
        
        this.mxcadView.mxcad.off('openFileComplete', onOpen);
      };
      this.mxcadView.mxcad.on('openFileComplete', onOpen);
  }
  private async createInstance(openFile?: string): Promise<void> {
    try {
      Logger.info('创建新的 MxCADView 实例', { openFile });

      const containerManager = MxCADContainerManager.getInstance();
      const authManager = MxCADAuthManager.getInstance();

      // 在创建 MxCADView 实例之前就设置认证拦截器
      // 确保 MxCAD-App 的所有网络请求都携带认证头
      authManager.setupAuthInterceptor();

      const viewOptions: any = {
        rootContainer: containerManager.getContainer(),
      };
  
      // 第一次初始化时传入 mxweb 文件 URL
      // 注意：只有第一次创建实例时才设置 openFile 参数
      // 后续文件切换应该使用 openWebFile 方法
      if (openFile) {
        viewOptions.openFile = openFile;
        Logger.info('第一次初始化，设置初始文件', { openFile });
      } else {
        Logger.info('第一次初始化，未设置初始文件');
      }

      this.mxcadView = new MxCADView(viewOptions);

      // 使用 viewOptions 创建实例
      // 如果设置了 openFile 参数，MxCADView 会自动打开该文件
      this.mxcadView.create();
      this._openFile()
      // 监听 MxCAD 应用创建完成事件
      MxFun.on('mxcadApplicationCreatedMxCADObject', () => {
        this.isInitialized = true;
        Logger.success('MxCADView 实例初始化完成');
      });

      Logger.info('MxCADView 实例创建完成，等待初始化事件');
    } catch (error) {
      Logger.error('MxCADView 实例创建失败', error);
      this.mxcadView = null;
      this.isInitialized = false;
      throw error;
    }
  }

  async openFile(fileUrl: string): Promise<void> {
    if (!this.mxcadView || !this.isInitialized) {
      throw new Error('MxCADView 实例未初始化');
    }
    try {
      // 检查当前是否已有打开的文件
      const currentFileName = this.getCurrentFileName();
      const targetFileName = fileUrl.split('/').pop();

      // 如果目标文件已经打开，则跳过
      if (
        currentFileName &&
        targetFileName &&
        currentFileName.includes(targetFileName)
      ) {
        Logger.info('目标文件已打开，跳过重复操作', {
          currentFileName,
          targetFileName,
        });
        return;
      }

      Logger.info('准备打开文件', { fileUrl, currentFileName, targetFileName });

      // 检查 mxcad 对象是否可用
      if (!this.mxcadView?.mxcad) {
        Logger.error('mxcad 对象不可用，无法打开文件');
        throw new Error('mxcad 对象不可用');
      }
      this._openFile()
      // 使用 openWebFile 方法打开文件
      // 这是 MxCADView 实例创建后打开文件的正确方式
      this.mxcadView.mxcad.openWebFile(fileUrl);

      Logger.success('使用 openWebFile 方法打开文件成功', { fileUrl });
    } catch (error) {
      Logger.error('打开文件时发生错误', error);
      throw error;
    }
  }

  getCurrentView(): MxCADView | null {
    return this.mxcadView;
  }

  getCurrentFileName(): string | null {
    if (!this.mxcadView?.mxcad) {
      return null;
    }

    try {
      return this.mxcadView.mxcad.getCurrentFileName?.() || null;
    } catch (error) {
      // 静默：无法获取当前文件名
      return null;
    }
  }

  isFileOpen(targetFileName: string): boolean {
    const currentFileName = this.getCurrentFileName();
    if (!currentFileName || !targetFileName) {
      return false;
    }
    return currentFileName.includes(targetFileName);
  }

  isCreated(): boolean {
    return this.mxcadView !== null;
  }

  isReady(): boolean {
    return this.isInitialized && this.mxcadView !== null;
  }

  reset(): void {
    // 静默：重置 MxCADView 实例
    this.mxcadView = null;
    this.isInitialized = false;
    this.initPromise = null;

    const containerManager = MxCADContainerManager.getInstance();
    containerManager.clearContainer();
  }
}

/**
 * MxCAD 全局管理器
 * 统一的入口点，协调各个子管理器
 */
export class MxCADManager {
  private static instance: MxCADManager;
  private containerManager: MxCADContainerManager;
  private instanceManager: MxCADInstanceManager;

  private constructor() {
    this.containerManager = MxCADContainerManager.getInstance();
    this.instanceManager = new MxCADInstanceManager();
  }

  static getInstance(): MxCADManager {
    if (!MxCADManager.instance) {
      MxCADManager.instance = new MxCADManager();
    }
    return MxCADManager.instance;
  }

  async initializeMxCADView(initialFileUrl?: string): Promise<MxCADView> {
    return this.instanceManager.initialize(initialFileUrl);
  }

  showMxCAD(show: boolean = true): void {
    this.containerManager.showContainer(show);
  }

  getCurrentView(): MxCADView | null {
    return this.instanceManager.getCurrentView();
  }

  async openFile(fileUrl: string): Promise<void> {
    return this.instanceManager.openFile(fileUrl);
  }

  isCreated(): boolean {
    return this.instanceManager.isCreated();
  }

  isReady(): boolean {
    return this.instanceManager.isReady();
  }

  getCurrentFileName(): string | null {
    return this.instanceManager.getCurrentFileName();
  }

  isFileOpen(targetFileName: string): boolean {
    return this.instanceManager.isFileOpen(targetFileName);
  }

  reset(): void {
    this.instanceManager.reset();
  }

  setupAuthInterceptor(): void {
    MxCADAuthManager.getInstance().setupAuthInterceptor();
  }
}

// 导出单例实例
export const mxcadManager = MxCADManager.getInstance();
