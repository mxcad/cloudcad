import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExternalReferenceModal } from './ExternalReferenceModal';
import type { ExternalReferenceFile } from '../../types/filesystem';

// Mock Modal component
vi.mock('../ui/Modal', () => ({
  Modal: ({ isOpen, onClose, children, title, footer }: any) => {
    if (!isOpen) return null;
    return (
      <div data-testid="modal">
        <div data-testid="modal-title">{title}</div>
        <div data-testid="modal-content">{children}</div>
        <div data-testid="modal-footer">{footer}</div>
      </div>
    );
  },
}));

// Mock Button component
vi.mock('../ui/Button', () => ({
  Button: ({ children, onClick, variant, disabled }: any) => (
    <button
      data-testid={`button-${variant || 'default'}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  ),
}));

// Mock Tooltip component
vi.mock('../ui/Tooltip', () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
}));

// Mock TruncateText/FileNameText component
vi.mock('../ui/TruncateText', () => ({
  FileNameText: ({ children }: any) => <span data-testid="file-name">{children}</span>,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  CheckCircle: () => <span data-testid="icon-check-circle">CheckCircle</span>,
  XCircle: () => <span data-testid="icon-x-circle">XCircle</span>,
  Loader2: () => <span data-testid="icon-loader">Loader2</span>,
  Upload: () => <span data-testid="icon-upload">Upload</span>,
  AlertTriangle: () => <span data-testid="icon-alert-triangle">AlertTriangle</span>,
}));

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
    onSelectAndUpload: vi.fn(),
    onComplete: vi.fn(),
    onSkip: vi.fn(),
    onClose: vi.fn(),
  };

  it('应该在 isOpen 为 true 时渲染模态框', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    const title = screen.getByText('管理外部参照文件');
    expect(title).not.toBeNull();
  });

  it('应该在 isOpen 为 false 时不渲染模态框', () => {
    render(<ExternalReferenceModal {...defaultProps} isOpen={false} />);

    const title = screen.queryByText('管理外部参照文件');
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

  it('应该显示操作按钮', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    expect(screen.getByText('选择并上传')).not.toBeNull();
    expect(screen.getByText('取消')).not.toBeNull();
    expect(screen.getByText('关闭')).not.toBeNull();
  });

  it('应该在所有文件上传成功时显示成功提示', () => {
    const successFiles: ExternalReferenceFile[] = [
      {
        name: 'ref1.dwg',
        type: 'ref',
        uploadState: 'success',
        progress: 100,
      },
      {
        name: 'image1.png',
        type: 'img',
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
        name: 'ref1.dwg',
        type: 'ref',
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
        name: 'ref1.dwg',
        type: 'ref',
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

  it('应该在上传中时禁用选择按钮', () => {
    const uploadingFiles: ExternalReferenceFile[] = [
      {
        name: 'ref1.dwg',
        type: 'ref',
        uploadState: 'uploading',
        progress: 50,
      },
    ];

    render(<ExternalReferenceModal {...defaultProps} files={uploadingFiles} />);

    const selectButton = screen.getByText((content) => content.includes('上传中...'));
    expect(selectButton.getAttribute('disabled')).toBe('');
  });

  it('应该显示上传成功状态', () => {
    const successFiles: ExternalReferenceFile[] = [
      {
        name: 'ref1.dwg',
        type: 'ref',
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
        name: 'ref1.dwg',
        type: 'ref',
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

  it('应该在 loading 时禁用取消按钮', () => {
    render(<ExternalReferenceModal {...defaultProps} loading={true} />);

    const cancelButton = screen.getByRole('button', { name: /取消/ });
    expect(cancelButton.getAttribute('disabled')).toBe('');
  });

  it('应该显示上传进度信息', () => {
    const uploadingFiles: ExternalReferenceFile[] = [
      {
        name: 'ref1.dwg',
        type: 'ref',
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
        name: 'ref1.dwg',
        type: 'ref',
        uploadState: 'success',
        progress: 100,
      },
      {
        name: 'image1.png',
        type: 'img',
        uploadState: 'fail',
        progress: 0,
      },
    ];

    render(<ExternalReferenceModal {...defaultProps} files={mixedFiles} />);

    const failMessage = screen.getByText(/部分文件上传失败/);
    expect(failMessage).not.toBeNull();
  });

  it('应该正确显示缺失文件数量', () => {
    const files: ExternalReferenceFile[] = [
      {
        name: 'test1.dwg',
        type: 'ref',
        uploadState: 'notSelected',
        progress: 0,
        exists: false,
      },
      {
        name: 'test2.dwg',
        type: 'ref',
        uploadState: 'notSelected',
        progress: 0,
        exists: false,
      },
      {
        name: 'test3.dwg',
        type: 'ref',
        uploadState: 'notSelected',
        progress: 0,
        exists: false,
      },
    ];

    render(<ExternalReferenceModal {...defaultProps} files={files} />);

    const warningText = screen.getByText(/检测到 3 个缺失的外部参照文件/);
    expect(warningText).not.toBeNull();
  });

  it('应该在无缺失文件时显示正常提示', () => {
    const existingFiles: ExternalReferenceFile[] = [
      {
        name: 'test1.dwg',
        type: 'ref',
        uploadState: 'notSelected',
        progress: 0,
        exists: true,
      },
    ];

    render(<ExternalReferenceModal {...defaultProps} files={existingFiles} />);

    const infoText = screen.getByText(/所有外部参照文件已存在/);
    expect(infoText).not.toBeNull();
  });

  it('应该显示文件列表表格', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    expect(screen.getByText('状态')).not.toBeNull();
    expect(screen.getByText('文件名')).not.toBeNull();
    expect(screen.getByText('类型')).not.toBeNull();
    expect(screen.getByText('进度')).not.toBeNull();
  });

  it('应该显示警告图标', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    expect(screen.getByTestId('icon-alert-triangle')).not.toBeNull();
  });
});
