///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import React, { useState, useRef, useCallback } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { FolderPlus, Upload, CheckCircle, XCircle, X } from 'lucide-react';
import {
  useDirectoryImport,
  ConflictStrategy,
  ImportMode,
} from '../hooks/useDirectoryImport';

interface DirectoryImportDialogProps {
  open: boolean;
  onClose: () => void;
  targetParentId: string;
  libraryType: 'drawing' | 'block';
  onSuccess?: () => void;
}

/**
 * 批量目录导入对话框组件
 */
export const DirectoryImportDialog: React.FC<DirectoryImportDialogProps> = ({
  open,
  onClose,
  targetParentId,
  libraryType,
  onSuccess,
}) => {
  const [step, setStep] = useState<
    'select' | 'preview' | 'importing' | 'result'
  >('select');
  const [strategy, setStrategy] = useState<ConflictStrategy>('skip');
  const [importMode, setImportMode] = useState<ImportMode>('content');
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    fileTree,
    progress,
    scanDirectory,
    executeImport,
    cancelImport,
    reset,
  } = useDirectoryImport();

  /**
   * 处理目录选择
   */
  const handleDirectorySelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      try {
        setError('');
        await scanDirectory(files, importMode);
        setStep('preview');
      } catch (err) {
        setError(err instanceof Error ? err.message : '扫描目录失败');
      }
    },
    [scanDirectory, importMode]
  );

  /**
   * 返回选择步骤重新选择
   */
  const handleReselect = useCallback(() => {
    reset();
    setStep('select');
    setError('');
  }, [reset]);

  /**
   * 处理导入确认
   */
  const handleStartImport = useCallback(async () => {
    try {
      setError('');
      setStep('importing');

      const result = await executeImport(
        fileTree!,
        targetParentId,
        libraryType,
        strategy
      );

      setStep('result');

      if (result.success && onSuccess) {
        setTimeout(() => {
          onSuccess();
          reset();
          setStep('select');
          setError('');
          onClose();
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
      setStep('preview');
    }
  }, [
    executeImport,
    fileTree,
    targetParentId,
    libraryType,
    strategy,
    onSuccess,
    reset,
    onClose,
  ]);

  /**
   * 处理关闭
   */
  const handleCloseModal = useCallback(() => {
    if (step === 'importing') {
      cancelImport();
    }
    reset();
    setStep('select');
    setError('');
    onClose();
  }, [step, cancelImport, reset, onClose]);

  /**
   * 统计文件树
   */
  const countFilesAndFolders = (
    node: typeof fileTree
  ): { files: number; folders: number } => {
    if (!node || !node.children) return { files: 0, folders: 0 };

    let files = 0;
    let folders = 0;

    for (const child of node.children) {
      if (child.isFolder) {
        folders++;
        const count = countFilesAndFolders(child);
        files += count.files;
        folders += count.folders;
      } else {
        files++;
      }
    }

    return { files, folders };
  };

  /**
   * 获取目录名称
   */
  const getDirectoryName = () => {
    if (!fileTree) return '';
    if (fileTree.children && fileTree.children.length > 0) {
      const firstChild = fileTree.children[0];
      if (firstChild?.isFolder) {
        return firstChild.name;
      }
    }
    return '选择的内容';
  };

  /**
   * 渲染选择步骤
   */
  const renderSelectStep = () => (
    <div className="text-center py-8">
      <Upload size={64} className="mx-auto text-slate-400 mb-4" />
      <h3 className="text-lg font-semibold mb-2">选择要导入的目录</h3>
      <p className="text-sm text-slate-600 mb-6">
        将目录中的文件导入到当前资源库
      </p>

      {/* 导入模式选择 */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2 text-left">
          导入方式：
        </label>
        <div className="flex gap-4 justify-center">
          <label className="flex items-center">
            <input
              type="radio"
              name="importMode"
              value="content"
              checked={importMode === 'content'}
              onChange={() => setImportMode('content')}
              className="mr-2"
            />
            <span className="text-sm">导入目录内容</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="importMode"
              value="folder"
              checked={importMode === 'folder'}
              onChange={() => setImportMode('folder')}
              className="mr-2"
            />
            <span className="text-sm">将目录作为子目录</span>
          </label>
        </div>
        <p className="text-xs text-slate-500 mt-1 text-left">
          {importMode === 'content'
            ? '将选中目录的内部文件/文件夹导入到当前目录'
            : '将整个选中目录作为子目录导入'}
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        // @ts-expect-error - webkitdirectory 是标准属性
        webkitdirectory=""
        className="hidden"
        onChange={handleDirectorySelect}
      />

      <Button
        variant="primary"
        size="lg"
        onClick={() => fileInputRef.current?.click()}
      >
        <FolderPlus size={18} className="mr-2" />
        选择目录
      </Button>
    </div>
  );

  /**
   * 渲染预览步骤
   */
  const renderPreviewStep = () => {
    const { files, folders } = countFilesAndFolders(fileTree);
    const dirName = getDirectoryName();

    return (
      <div>
        {/* 已选择的目录信息 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <p className="text-sm font-medium">已选择目录：{dirName}</p>
          <p className="text-xs text-slate-500 mt-1">
            共 {folders} 个文件夹，{files} 个文件将导入到当前目录
          </p>
          <p className="text-xs text-slate-500">
            导入方式：
            {importMode === 'content' ? '导入目录内容' : '将目录作为子目录'}
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            冲突处理策略：
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="strategy"
                value="skip"
                checked={strategy === 'skip'}
                onChange={(e) =>
                  setStrategy(e.target.value as ConflictStrategy)
                }
                className="mr-2"
              />
              <span className="text-sm">跳过同名文件</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="strategy"
                value="overwrite"
                checked={strategy === 'overwrite'}
                onChange={(e) =>
                  setStrategy(e.target.value as ConflictStrategy)
                }
                className="mr-2"
              />
              <span className="text-sm">覆盖同名文件</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="strategy"
                value="rename"
                checked={strategy === 'rename'}
                onChange={(e) =>
                  setStrategy(e.target.value as ConflictStrategy)
                }
                className="mr-2"
              />
              <span className="text-sm">自动重命名（添加序号）</span>
            </label>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* 返回重新选择按钮 */}
        <div className="mb-4">
          <Button variant="outline" size="sm" onClick={handleReselect}>
            <X size={14} className="mr-1" />
            重新选择
          </Button>
        </div>
      </div>
    );
  };

  /**
   * 渲染导入进度
   */
  const renderImportingStep = () => (
    <div className="text-center py-8">
      <div className="mb-4">
        <div className="w-full bg-slate-200 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
        <p className="text-sm text-slate-600 mt-2">{progress.message}</p>
        <p className="text-xs text-slate-500">
          {progress.currentFile} / {progress.totalFiles}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={cancelImport}
        className="text-red-600 border-red-300"
      >
        取消导入
      </Button>
    </div>
  );

  /**
   * 渲染结果
   */
  const renderResultStep = () => {
    const isSuccess = progress.status === 'completed';

    return (
      <div className="text-center py-8">
        {isSuccess ? (
          <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
        ) : (
          <XCircle size={64} className="mx-auto text-red-500 mb-4" />
        )}
        <h3 className="text-lg font-semibold mb-2">
          {isSuccess ? '导入完成' : '导入失败'}
        </h3>
        <p className="text-sm text-slate-600">{progress.message}</p>
      </div>
    );
  };

  return (
    <Modal
      isOpen={open}
      onClose={handleCloseModal}
      title={`批量导入 - ${libraryType === 'drawing' ? '图纸库' : '图块库'}`}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={handleCloseModal}>
                取消
              </Button>
              <Button variant="primary" onClick={handleStartImport}>
                开始导入
              </Button>
            </>
          )}
          {(step === 'result' || step === 'importing') && (
            <Button variant="primary" onClick={handleCloseModal}>
              {step === 'importing' ? '取消' : '关闭'}
            </Button>
          )}
        </div>
      }
    >
      {step === 'select' && renderSelectStep()}
      {step === 'preview' && renderPreviewStep()}
      {step === 'importing' && renderImportingStep()}
      {step === 'result' && renderResultStep()}
    </Modal>
  );
};
