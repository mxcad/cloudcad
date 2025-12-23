import { MxCADView } from 'mxcad-app';

/**
 * MxCAD 全局管理器
 * 负责管理 MxCADView 实例的创建、复用和永不销毁的容器
 */
export class MxCADManager {
  private static instance: MxCADManager;
  private mxcadView: MxCADView | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private globalContainer: HTMLElement | null = null;

  private constructor() {
    // 创建永不销毁的全局容器
    this.createGlobalContainer();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): MxCADManager {
    if (!MxCADManager.instance) {
      MxCADManager.instance = new MxCADManager();
    }
    return MxCADManager.instance;
  }

  /**
   * 创建永不销毁的全局容器
   */
  private createGlobalContainer(): void {
    // 检查是否已存在全局容器
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
      console.log('[MxCADManager] 📦 创建永不销毁的全局容器');
    }
    
    this.globalContainer = container;
  }

  /**
   * 初始化 MxCADView 实例（只初始化一次，使用永不销毁的容器）
   */
  async initializeMxCADView(openFile?: string): Promise<MxCADView> {
    // 如果已经初始化，直接返回现有实例
    if (this.mxcadView && this.isInitialized) {
      console.log('[MxCADManager] 🔄 复用现有 MxCADView 实例');
      return this.mxcadView;
    }

    // 如果正在初始化，等待初始化完成
    if (this.initPromise) {
      console.log('[MxCADManager] ⏳ 等待初始化完成');
      await this.initPromise;
      return this.mxcadView!;
    }

    // 开始初始化
    this.initPromise = this.createMxCADView(openFile);
    await this.initPromise;
    this.initPromise = null;

    return this.mxcadView!;
  }

  /**

     * 创建新的 MxCADView 实例（使用永不销毁的容器）

     */

    private async createMxCADView(openFile?: string): Promise<void> {

      if (!this.globalContainer) {

        throw new Error('全局容器未创建');

      }

  

      try {

        console.log('[MxCADManager] 🚀 创建新的 MxCADView 实例（永不销毁容器）');

        

        const viewOptions: any = {

          rootContainer: this.globalContainer,

        };

  

        // 如果是首次初始化且提供了文件URL，直接传入openFile参数

        if (openFile) {

          viewOptions.openFile = openFile;

          console.log('[MxCADManager] 📂 首次初始化时直接打开文件:', openFile);

        }

        

        this.mxcadView = new MxCADView(viewOptions);

  

        await this.mxcadView.create();

        this.isInitialized = true;

        console.log('[MxCADManager] ✅ MxCADView 实例创建完成');

      } catch (error) {

        console.error('[MxCADManager] ❌ MxCADView 实例创建失败:', error);

        this.mxcadView = null;

        this.isInitialized = false;

        throw error;

      }

    }

  /**
   * 显示/隐藏 MxCAD 容器
   */
  showMxCAD(show: boolean = true): void {
    if (this.globalContainer) {
      this.globalContainer.style.display = show ? 'block' : 'none';
      this.globalContainer.style.pointerEvents = show ? 'auto' : 'none';
      console.log(`[MxCADManager] 👁️ ${show ? '显示' : '隐藏'} MxCAD 容器`);
    }
  }

  /**
   * 获取当前 MxCADView 实例
   */
  getCurrentView(): MxCADView | null {
    return this.mxcadView;
  }

  /**
   * 打开文件
   */
  async openFile(fileUrl: string): Promise<void> {
    if (!this.mxcadView || !this.isInitialized) {
      throw new Error('MxCADView 实例未初始化');
    }

    console.log('[MxCADManager] 📂 打开文件:', fileUrl);
    this.mxcadView.mxcad.openWebFile(fileUrl);
  }

  /**
   * 检查是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized && this.mxcadView !== null;
  }

  /**
   * 重置实例（仅在应用完全卸载时使用）
   */
  reset(): void {
    console.log('[MxCADManager] 🔄 重置 MxCADView 实例');
    this.mxcadView = null;
    this.isInitialized = false;
    this.initPromise = null;
    
    // 清理全局容器内容（但保留容器本身）
    if (this.globalContainer) {
      this.globalContainer.innerHTML = '';
    }
  }
}

// 导出单例实例
export const mxcadManager = MxCADManager.getInstance();