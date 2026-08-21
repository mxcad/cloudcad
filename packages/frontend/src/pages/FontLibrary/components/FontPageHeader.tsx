import { Upload, Palette, HardDrive, FileCode, Type } from 'lucide-react';
import { Button, Tab, Tabs } from '@/components/ui';
import { formatFileSize } from '../../../components/ui/FileSize';
import { t } from '@/languages';

interface FontPageHeaderProps {
  activeTab: 'backend' | 'frontend';
  canUploadFonts: boolean;
  stats: { count: number; totalSize: number; typeCount: number };
  setActiveTab: (tab: 'backend' | 'frontend') => void;
  openUploadModal: () => void;
  clearSelection: () => void;
}

/**
 * 页头：标题行 + 紧凑统计条 + Tabs。
 * 统计从大卡片压缩为单行小卡片，让列表/网格内容区获得更多高度。
 */
export const FontPageHeader: React.FC<FontPageHeaderProps> = ({
  activeTab,
  canUploadFonts,
  stats,
  setActiveTab,
  openUploadModal,
  clearSelection,
}) => {
  const statItems = [
    {
      icon: Palette,
      color: 'var(--primary-600)',
      bg: 'var(--primary-100)',
      label: t('字体总数'),
      value: String(stats.count),
    },
    {
      icon: HardDrive,
      color: 'var(--accent-600)',
      bg: 'var(--accent-100)',
      label: t('总存储'),
      value: formatFileSize(stats.totalSize),
    },
    {
      icon: FileCode,
      color: 'var(--success)',
      bg: 'var(--success-dim)',
      label: t('格式种类'),
      value: String(stats.typeCount),
    },
  ];

  return (
    <>
      <div className="mb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-text-primary mb-0.5">
              {t('字体库管理')}
            </h1>
            <p className="text-text-tertiary text-sm">
              {t('管理和维护 CAD 字体文件')}
            </p>
          </div>
          {canUploadFonts && (
            <Button icon={Upload} onClick={openUploadModal}>
              {t('上传字体')}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {statItems.map(({ icon: Icon, color, bg, label, value }) => (
            <div
              key={label}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-default)]"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: bg }}
              >
                <Icon size={16} style={{ color }} />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-text-primary leading-none">
                  {value}
                </span>
                <span className="text-xs text-text-tertiary">{label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Tabs className="mb-4">
        <Tab
          active={activeTab === 'backend'}
          icon={HardDrive}
          onClick={() => {
            setActiveTab('backend');
            clearSelection();
          }}
        >
          {t('后端字体（转换程序）')}
        </Tab>
        <Tab
          active={activeTab === 'frontend'}
          icon={Type}
          onClick={() => {
            setActiveTab('frontend');
            clearSelection();
          }}
        >
          {t('前端字体（资源目录）')}
        </Tab>
      </Tabs>
    </>
  );
};
