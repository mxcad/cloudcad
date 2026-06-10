import React, { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { client } from '@/api-sdk/client.gen';
import type { FileSystemNode } from '@/types/filesystem';

interface NodePropertiesData {
  id: string;
  name: string;
  isFolder: boolean;
  path?: string;
  size?: number;
  totalSize?: number;
  childrenFolderCount?: number;
  childrenFileCount?: number;
  totalChildrenCount?: number;
  ownerName?: string;
  createdAt: string;
  updatedAt: string;
  projectId?: string;
  mimeType?: string;
  permissions: {
    canEdit: boolean;
    canDelete: boolean;
    canDownload: boolean;
  };
}

interface FolderPropertiesModalProps {
  isOpen: boolean;
  node: FileSystemNode | null;
  onClose: () => void;
}

function formatFileSize(bytes: number | undefined | null): string {
  if (bytes === null || bytes === undefined) return '-';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const FolderPropertiesModal: React.FC<FolderPropertiesModalProps> = ({
  isOpen,
  node,
  onClose,
}) => {
  const [properties, setProperties] = useState<NodePropertiesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !node) return;

    setLoading(true);
    setError(null);
    setProperties(null);

    (async () => {
      type PropsResponse = { 200: NodePropertiesData };
      const { data, error: apiError } = await client.get<PropsResponse>({
        url: `/api/v1/file-system/nodes/${node.id}/properties`,
      });

      if (apiError) {
        setError('加载属性失败');
      } else if (data) {
        const d = data as unknown as NodePropertiesData;
        setProperties(d);
      }
      setLoading(false);
    })();
  }, [isOpen, node]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${node?.isFolder ? '文件夹' : '文件'}属性`} size="sm">
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-strong)', borderTopColor: 'transparent' }} />
        </div>
      )}

      {error && (
        <div className="text-center py-8" style={{ color: 'var(--color-error-500)' }}>
          {error}
        </div>
      )}

      {!loading && !error && properties && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="text-lg">{properties.isFolder ? '📁' : '📄'}</span>
            <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {properties.name}
            </span>
          </div>

          <Section title="基本信息">
            <Row label="类型" value={properties.isFolder ? '文件夹' : (properties.mimeType || '文件')} />
            {properties.path && <Row label="路径" value={properties.path} />}
            <Row label="创建时间" value={formatDate(properties.createdAt)} />
            <Row label="修改时间" value={formatDate(properties.updatedAt)} />
            {properties.ownerName && <Row label="所有者" value={properties.ownerName} />}
          </Section>

          {properties.isFolder && (
            <Section title="统计">
              {properties.childrenFolderCount !== undefined && (
                <Row label="子文件夹" value={`${properties.childrenFolderCount} 个`} />
              )}
              {properties.childrenFileCount !== undefined && (
                <Row label="文件" value={`${properties.childrenFileCount} 个`} />
              )}
              {properties.totalChildrenCount !== undefined && (
                <Row label="总计" value={`${properties.totalChildrenCount} 个`} />
              )}
              {properties.totalSize !== undefined && (
                <Row label="总大小" value={formatFileSize(properties.totalSize)} />
              )}
            </Section>
          )}

          {!properties.isFolder && (
            <Section title="文件信息">
              <Row label="大小" value={formatFileSize(properties.size)} />
              {properties.mimeType && <Row label="类型" value={properties.mimeType} />}
            </Section>
          )}

          <Section title="权限">
            <Row label="可编辑" value={properties.permissions.canEdit ? '是' : '否'} />
            <Row label="可删除" value={properties.permissions.canDelete ? '是' : '否'} />
            <Row label="可下载" value={properties.permissions.canDownload ? '是' : '否'} />
          </Section>

          <div className="flex justify-end pt-2">
            <Button onClick={onClose}>关闭</Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="truncate ml-4 max-w-[200px]" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
