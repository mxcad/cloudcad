import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExternalReferenceModal } from './ExternalReferenceModal';
import type { ExternalReferenceFile } from '../../types/filesystem';

describe('ExternalReferenceModal', () => {
  const mockFiles: ExternalReferenceFile[] = [
    {
      name: 'ref1.dwg',
      type: 'ref',
      uploadState: 'notSelected',
      progress: 0,
    },
    {
      name: 'image1.png',
      type: 'img',
      uploadState: 'notSelected',
      progress: 0,
    },
  ];

  const defaultProps = {
    isOpen: true,
    files: mockFiles,
    loading: false,
    onSelectFiles: vi.fn(),
    onUpload: vi.fn(),
    onComplete: vi.fn(),
    onSkip: vi.fn(),
    onClose: vi.fn(),
  };

  it('应该在 isOpen 为 true 时渲染模态框', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    const title = screen.getByText('上传外部参照文件');
    expect(title).not.toBeNull();

    const warningText = screen.getByText(/检测到 2 个缺失的外部参照文件/);
    expect(warningText).not.toBeNull();
  });

  it('应该在 isOpen 为 false 时不渲染模态框', () => {
    render(<ExternalReferenceModal {...defaultProps} isOpen={false} />);

    const title = screen.queryByText('上传外部参照文件');
    expect(title).toBeNull();
  });

  it('应该显示所有文件', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    const ref1 = screen.getByText('ref1.dwg');
    expect(ref1).not.toBeNull();

    const image1 = screen.getByText('image1.png');
    expect(image1).not.toBeNull();
  });

  it('应该显示正确的文件类型', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    const dwgType = screen.getByText('DWG');
    expect(dwgType).not.toBeNull();

    const imgType = screen.getByText('图片');
    expect(imgType).not.toBeNull();
  });

  it('应该显示所有按钮', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    expect(screen.getByText('选择文件')).not.toBeNull();
    expect(screen.getByText('上传')).not.toBeNull();
    expect(screen.getByText('稍后上传')).not.toBeNull();
    expect(screen.getByText('完成')).not.toBeNull();
    expect(screen.getByText('取消')).not.toBeNull();
  });

  it('应该在所有文件上传成功时显示成功提示', () => {
    const successFiles: ExternalReferenceFile[] = [
      {
        ...mockFiles[0],
        uploadState: 'success',
        progress: 100,
      },
      {
        ...mockFiles[1],
        uploadState: 'success',
        progress: 100,
      },
    ];

    render(<ExternalReferenceModal {...defaultProps} files={successFiles} />);

    const successMessage = screen.getByText('所有外部参照文件上传成功');
    expect(successMessage).not.toBeNull();
  });

  it('应该在文件上传失败时显示失败提示', () => {
    const failFiles: ExternalReferenceFile[] = [
      {
        ...mockFiles[0],
        uploadState: 'fail',
        progress: 0,
      },
    ];

    render(<ExternalReferenceModal {...defaultProps} files={failFiles} />);

    const failMessage = screen.getByText(/部分文件上传失败/);
    expect(failMessage).not.toBeNull();
  });

  it('应该显示待上传状态', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    const statusTexts = screen.getAllByText('待上传');
    expect(statusTexts.length).toBeGreaterThan(0);
  });

  it('应该显示上传中状态和进度', () => {
    const uploadingFiles: ExternalReferenceFile[] = [
      {
        ...mockFiles[0],
        uploadState: 'uploading',
        progress: 50,
      },
    ];

    render(<ExternalReferenceModal {...defaultProps} files={uploadingFiles} />);

    const statusText = screen.getByText('上传中');
    expect(statusText).not.toBeNull();

    const progressText = screen.getByText('50%');
    expect(progressText).not.toBeNull();
  });

  it('应该在上传成功时禁用选择按钮', () => {
    const successFiles: ExternalReferenceFile[] = [
      {
        ...mockFiles[0],
        uploadState: 'success',
        progress: 100,
      },
    ];

    render(<ExternalReferenceModal {...defaultProps} files={successFiles} />);

    const selectButton = screen.getByText('选择文件');
    expect(selectButton.getAttribute('disabled')).toBe('');
  });

  it('应该在上传中时禁用选择按钮', () => {
    const uploadingFiles: ExternalReferenceFile[] = [
      {
        ...mockFiles[0],
        uploadState: 'uploading',
        progress: 50,
      },
    ];

    render(<ExternalReferenceModal {...defaultProps} files={uploadingFiles} />);

    const selectButton = screen.getByText('选择文件');
    expect(selectButton.getAttribute('disabled')).toBe('');
  });

  it('应该显示上传成功状态', () => {
    const successFiles: ExternalReferenceFile[] = [
      {
        ...mockFiles[0],
        uploadState: 'success',
        progress: 100,
      },
    ];

    render(<ExternalReferenceModal {...defaultProps} files={successFiles} />);

    const statusText = screen.getByText('上传成功');
    expect(statusText).not.toBeNull();

    const progressText = screen.getByText('100%');
    expect(progressText).not.toBeNull();
  });

  it('应该显示上传失败状态', () => {
    const failFiles: ExternalReferenceFile[] = [
      {
        ...mockFiles[0],
        uploadState: 'fail',
        progress: 0,
      },
    ];

    render(<ExternalReferenceModal {...defaultProps} files={failFiles} />);

    const statusText = screen.getByText('上传失败');
    expect(statusText).not.toBeNull();

    const progressText = screen.getByText('失败');
    expect(progressText).not.toBeNull();
  });

  it('应该在 loading 时禁用取消和稍后上传按钮', () => {
    render(<ExternalReferenceModal {...defaultProps} loading={true} />);

    const cancelButton = screen.getByRole('button', { name: /取消/ });
    expect(cancelButton.getAttribute('disabled')).toBe('');

    const skipButton = screen.getByText('稍后上传');
    expect(skipButton.getAttribute('disabled')).toBe('');
  });

  it('应该显示上传进度条', () => {
    const uploadingFiles: ExternalReferenceFile[] = [
      {
        ...mockFiles[0],
        uploadState: 'uploading',
        progress: 50,
      },
    ];

    render(<ExternalReferenceModal {...defaultProps} files={uploadingFiles} />);

    const uploadingText = screen.getByText('正在上传...');
    expect(uploadingText).not.toBeNull();
  });

  it('应该处理混合状态文件', () => {
    const mixedFiles: ExternalReferenceFile[] = [
      {
        ...mockFiles[0],
        uploadState: 'success',
        progress: 100,
      },
      {
        ...mockFiles[1],
        uploadState: 'fail',
        progress: 0,
      },
    ];

    render(<ExternalReferenceModal {...defaultProps} files={mixedFiles} />);

    const failMessage = screen.getByText(/部分文件上传失败/);
    expect(failMessage).not.toBeNull();
  });

  it('应该正确显示文件数量', () => {
    const files: ExternalReferenceFile[] = [
      {
        name: 'test1.dwg',
        type: 'ref',
        uploadState: 'notSelected',
        progress: 0,
      },
      {
        name: 'test2.dwg',
        type: 'ref',
        uploadState: 'notSelected',
        progress: 0,
      },
      {
        name: 'test3.dwg',
        type: 'ref',
        uploadState: 'notSelected',
        progress: 0,
      },
    ];

    render(<ExternalReferenceModal {...defaultProps} files={files} />);

    const warningText = screen.getByText(/检测到 3 个缺失的外部参照文件/);
    expect(warningText).not.toBeNull();
  });

  it('应该在无文件时正确显示', () => {
    render(<ExternalReferenceModal {...defaultProps} files={[]} />);

    const warningText = screen.getByText(/检测到 0 个缺失的外部参照文件/);
    expect(warningText).not.toBeNull();
  });

  it('应该显示文件列表表格', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    expect(screen.getByText('状态')).not.toBeNull();
    expect(screen.getByText('文件名')).not.toBeNull();
    expect(screen.getByText('类型')).not.toBeNull();
    expect(screen.getByText('进度')).not.toBeNull();
  });

  it('应该显示成功图标', () => {
    const successFiles: ExternalReferenceFile[] = [
      {
        ...mockFiles[0],
        uploadState: 'success',
        progress: 100,
      },
    ];

    render(<ExternalReferenceModal {...defaultProps} files={successFiles} />);

    expect(document.querySelector('.text-green-500')).not.toBeNull();
  });

  it('应该显示警告图标', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    expect(document.querySelector('.text-amber-500')).not.toBeNull();
  });
});
