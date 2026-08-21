import { Z_LAYERS } from '@/constants/layers';
import { t } from '@/languages';
import { CSS_CLASSES } from './mxcadTypes';

/**
 * MxCAD 全局容器管理（从 mxcadManagerCore.ts 拆分）
 *
 * 全局叠加层容器：CAD 引擎渲染需要一个常驻 DOM 容器，
 * 通过 visibility + z-index 控制显隐以保持 WebGL 上下文（CADEditorDirect 配合使用）。
 */
export class MxCADContainerManager {
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
    let container = document.getElementById(CSS_CLASSES.GLOBAL_CONTAINER);
    if (!container) {
      container = document.createElement('div');
      container.id = CSS_CLASSES.GLOBAL_CONTAINER;
      container.style.cssText = `
        position: absolute;
        top: 0;
        left: 300px;
        right: 0;
        bottom: 0;
        visibility: hidden;
        z-index: ${Z_LAYERS.BACKGROUND - 1};
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }
    this.globalContainer = container;
  }

  adjustContainerPosition(sidebarWidth: number = 300): void {
    if (this.globalContainer) {
      this.globalContainer.style.left = `${sidebarWidth}px`;
    }
  }

  getContainer(): HTMLElement {
    if (!this.globalContainer) {
      throw new Error(t('全局容器未创建'));
    }
    return this.globalContainer;
  }

  showContainer(show: boolean): void {
    if (this.globalContainer) {
      if (show) {
        this.globalContainer.style.visibility = 'visible';
        this.globalContainer.style.zIndex = String(Z_LAYERS.CAD_EDITOR);
        this.globalContainer.style.pointerEvents = 'auto';
      } else {
        this.globalContainer.style.visibility = 'hidden';
        this.globalContainer.style.zIndex = String(Z_LAYERS.BACKGROUND - 1);
        this.globalContainer.style.pointerEvents = 'none';
      }
    }
  }

  clearContainer(): void {}
}
