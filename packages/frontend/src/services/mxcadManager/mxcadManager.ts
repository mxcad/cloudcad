import { MxCADView } from 'mxcad-app';
import { useCADEditorStore } from '../../stores/useCADEditorStore';
import { getFileInfo } from './mxcadHelpers';
import { MxCADContainerManager } from './mxcadContainerManager';
import { MxCADInstanceManager } from './mxcadInstanceManager';
import type { CurrentFileInfo, OpenFilePayload } from './mxcadTypes';

export function setNavigateFunction(fn: ((path: string) => void) | null): void {
  useCADEditorStore.getState().setNavigateFunction(fn);
}

export function setOpenedBackInfo(backUrl: string, fileId: string): void {
  useCADEditorStore.getState().setOpenedBackInfo(backUrl, fileId);
}

export function clearOpenedBackInfo(): void {
  useCADEditorStore.getState().clearOpenedBackInfo();
}

/**
 * MxCADManager 门面（从 mxcadManagerCore.ts 拆分）
 *
 * 对外暴露的单一入口：内部组合容器管理 + 实例管理，
 * 外部消费方（mxcadOpenFile / mxcadNavigation / cmd/*）只依赖本类与 mxcadManager 实例。
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
    if (!MxCADManager.instance) MxCADManager.instance = new MxCADManager();
    return MxCADManager.instance;
  }

  async initializeMxCADView(
    initialFileUrl?: string,
    initialFileInfo?: CurrentFileInfo,
    onSuccess?: () => void
  ): Promise<MxCADView> {
    return this.instanceManager.initialize(
      initialFileUrl,
      initialFileInfo,
      onSuccess
    );
  }

  showMxCAD(show: boolean = true): void {
    this.containerManager.showContainer(show);
  }

  getCurrentView(): MxCADView | null {
    return this.instanceManager.getCurrentView();
  }

  async openFile(payload: OpenFilePayload): Promise<void> {
    const { exitCollaborationIfNeeded } = await import('./mxcadCollaboration');
    exitCollaborationIfNeeded();
    return this.instanceManager.openFile(payload);
  }

  setPendingFileInfo(fileInfo: CurrentFileInfo | null): void {
    this.instanceManager.setPendingFileInfo(fileInfo);
  }

  isCreated(): boolean {
    return this.instanceManager.isCreated();
  }
  isReady(): boolean {
    return this.instanceManager.isReady();
  }
  /** 是否有正在打开中的图纸（pendingOpenInfo 未消费：成功 openSession / 失败回滚前） */
  hasPendingOpen(): boolean {
    return this.instanceManager.getPendingOpenInfo() !== null;
  }
  getCurrentFileName(): string | null {
    return this.instanceManager.getCurrentFileName();
  }
  isFileOpen(targetFileName: string): boolean {
    return this.instanceManager.isFileOpen(targetFileName);
  }

  async reloadCurrentFile(): Promise<boolean> {
    return this.instanceManager.reloadCurrentFile();
  }

  reset(): void {
    this.instanceManager.reset();
  }

  async reopenWithUrl(fileUrl: string): Promise<void> {
    return this.instanceManager.reopenWithUrl(fileUrl);
  }

  getCurrentFileInfo(): CurrentFileInfo | null {
    return getFileInfo();
  }

  adjustContainerPosition(sidebarWidth: number = 300): void {
    this.containerManager.adjustContainerPosition(sidebarWidth);
  }
}

export const mxcadManager = MxCADManager.getInstance();
