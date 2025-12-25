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
    if (this.globalContainer) {
      this.globalContainer.innerHTML = '';
    }
  }
}

/**
 * MxCAD 认证管理器
 * 负责配置 axios 认证拦截器
 */
class MxCADAuthManager {
  private static instance: MxCADAuthManager;
  private isConfigured = false;

  private constructor() { }

  static getInstance(): MxCADAuthManager {
    if (!MxCADAuthManager.instance) {
      MxCADAuthManager.instance = new MxCADAuthManager();
    }
    return MxCADAuthManager.instance;
  }

  setupAuthInterceptor(): void {
    if (this.isConfigured) {
      Logger.info('认证拦截器已配置，跳过重复配置');
      return;
    }

    axios.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('accessToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    this.isConfigured = true;
    Logger.success('已为 MxCAD-App 配置 axios 认证拦截器');
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
}

// 导出单例实例
export const mxcadManager = MxCADManager.getInstance();