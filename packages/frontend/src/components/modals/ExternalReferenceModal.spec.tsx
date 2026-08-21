import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExternalReferenceModal } from './ExternalReferenceModal';
import type { ExternalReferenceFile } from '../../types/filesystem';

// Mock Modal component
vi.mock('../ui/Modal', () => ({
  Modal: ({
    isOpen,
    onClose,
    children,
    title,
    footer,
  }: {
    isOpen?: boolean;
    onClose?: () => void;
    children?: React.ReactNode;
    title?: React.ReactNode;
    footer?: React.ReactNode;
  }) => {
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
  Button: ({
    children,
    onClick,
    variant,
    disabled,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    disabled?: boolean;
  }) => (
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
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

// Mock TruncateText/FileNameText component
vi.mock('../ui/TruncateText', () => ({
  FileNameText: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="file-name">{children}</span>
  ),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  CheckCircle: () => <span data-testid="icon-check-circle">CheckCircle</span>,
  XCircle: () => <span data-testid="icon-x-circle">XCircle</span>,
  Loader2: () => <span data-testid="icon-loader">Loader2</span>,
  Upload: () => <span data-testid="icon-upload">Upload</span>,
  AlertCircle: () => <span data-testid="icon-alert-circle">AlertCircle</span>,
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

    const dwgType = screen.getByText('图纸');
    expect(dwgType).not.toBeNull();

    const imgType = screen.getByText('图片');
    expect(imgType).not.toBeNull();
  });

  it('应该显示操作按钮', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    expect(screen.getByText('选择并上传')).not.toBeNull();
    expect(screen.getByText('继续打开')).not.toBeNull();
  });

  it('应该在所有文件上传成功时显示完成状态', () => {
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

    expect(screen.getAllByText('已完成')).toHaveLength(2);
  });

  it('应该在文件上传失败时显示失败状态', () => {
    const failFiles: ExternalReferenceFile[] = [
      {
        name: 'ref1.dwg',
        type: 'ref',
        uploadState: 'fail',
        progress: 0,
      },
    ];

    render(<ExternalReferenceModal {...defaultProps} files={failFiles} />);

    expect(screen.getByText('上传失败')).not.toBeNull();
    expect(screen.getByText('失败')).not.toBeNull();
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

    const selectButton = screen.getByText((content) =>
      content.includes('上传中...')
    );
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

    const statusText = screen.getByText('已完成');
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

  it('应该在 loading 时禁用继续打开按钮', () => {
    render(<ExternalReferenceModal {...defaultProps} loading={true} />);

    const cancelButton = screen.getByRole('button', { name: /继续打开/ });
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

    expect(screen.getByText('已完成')).not.toBeNull();
    expect(screen.getByText('上传失败')).not.toBeNull();
    expect(screen.getByText('失败')).not.toBeNull();
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

    expect(screen.getAllByTestId('file-name')).toHaveLength(3);
    expect(screen.getAllByText('待上传')).toHaveLength(3);
  });

  it('应该在无缺失文件时显示已存在状态', () => {
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

    expect(screen.getByText('已上传')).not.toBeNull();
    expect(screen.getByText('可覆盖')).not.toBeNull();
  });

  it('应该显示文件列表表格', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    expect(screen.getByText('状态')).not.toBeNull();
    expect(screen.getByText('文件名')).not.toBeNull();
    expect(screen.getByText('类型')).not.toBeNull();
    expect(screen.getByText('进度')).not.toBeNull();
  });

  it('应该显示待上传警告图标', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    expect(screen.getAllByTestId('icon-alert-circle')).toHaveLength(2);
  });
});
