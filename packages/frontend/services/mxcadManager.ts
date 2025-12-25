import axios from 'axios';
import { MxCADView } from 'mxcad-app';
import { Logger } from '../utils/mxcadUtils';
import { MxFun } from 'mxdraw';

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
    console.log('ℹ️ 跳过清空全局容器，保持 MxCAD 实例');
  }
}

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

  private constructor() { }

  static getInstance(): MxCADAuthManager {
    if (!MxCADAuthManager.instance) {
      MxCADAuthManager.instance = new MxCADAuthManager();
    }
    return MxCADAuthManager.instance;
  }

  setupAuthInterceptor(): void {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      Logger.warn('未找到 JWT token');
      return;
    }

    // 3. 简单的 XMLHttpRequest 拦截器
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...args: any[]) {
      const urlString = url.toString();
      if (urlString.includes('/mxcad/')) {
        (this as any)._isMxCad = true;
      }
      return originalOpen.call(this, method, url, ...args);
    };

    XMLHttpRequest.prototype.send = function(body?: any) {
      if ((this as any)._isMxCad) {
        // 设置认证头
        if (!(this as any)._authSet && token) {
          (this as any)._authSet = true;
          try {
            console.log('🔐 为 MxCAD XMLHttpRequest 请求添加认证头');
            this.setRequestHeader('Authorization', `Bearer ${token}`);
          } catch (e) {}
        }

        // 添加项目参数到请求体
        if (typeof body === 'string') {
          try {
            const bodyData = JSON.parse(body);
            const urlParams = new URLSearchParams(window.location.search);
            const projectId = urlParams.get('project');
            const parentId = urlParams.get('parent');
            
            if (projectId && !bodyData.projectId) {
              bodyData.projectId = projectId;
              if (parentId && !bodyData.parentId) {
                bodyData.parentId = parentId;
              }
              
              const newBody = JSON.stringify(bodyData);
              console.log('📋 已为 MxCAD 请求添加项目参数', { projectId, parentId });
              return originalSend.call(this, newBody);
            }
          } catch (error) {
            console.log('解析请求体失败，跳过添加项目参数');
          }
        }
      }
      return originalSend.call(this, body);
    };

    this.isConfigured = true;
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
    Logger.info('MxCADView 初始化开始', { initialFileUrl, hasExistingView: !!this.mxcadView, isInitialized: this.isInitialized });
    
    if (this.mxcadView && this.isInitialized) {
      Logger.info('复用现有 MxCADView 实例');
      
      // 如果传入了新文件URL，则打开新文件
      if (initialFileUrl) {
        Logger.info('切换到新文件', { initialFileUrl });
        await this.openFile(initialFileUrl);
      }
      
      return this.mxcadView;
    }

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

    Logger.info('创建新实例', { initialFileUrl });
    this.initPromise = this.createInstance(initialFileUrl);
    await this.initPromise;
    this.initPromise = null;

    return this.mxcadView!;
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
      if (openFile) {
        viewOptions.openFile = openFile;
        Logger.info('设置初始文件（第一次初始化）', { openFile });
      }

      this.mxcadView = new MxCADView(viewOptions);
      
      // 使用viewOptions创建实例，第一次初始化会自动打开文件
      this.mxcadView.create();
      
      MxFun.on("mxcadApplicationCreatedMxCADObject", () => {
        this.isInitialized = true;
        Logger.success('MxCADView 实例初始化完成');
      })

      Logger.info('MxCADView 实例创建完成');
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
      if (currentFileName && targetFileName && currentFileName.includes(targetFileName)) {
        Logger.info('目标文件已打开，跳过重复操作', { currentFileName, targetFileName });
        return;
      }
      
      // 第二次打开文件需要调用 openWebFile 方法
      if (this.mxcadView?.mxcad) {
        this.mxcadView.mxcad.openWebFile(fileUrl);
        Logger.info('第二次打开文件命令已执行', { fileUrl, currentFileName, targetFileName });
      } else {
        Logger.error('mxcad 对象不可用');
        throw new Error('mxcad 对象不可用');
      }
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