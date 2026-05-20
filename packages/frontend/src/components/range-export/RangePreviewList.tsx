import React from 'react';
import { Button } from '@/components/ui/Button';
import { useRangeExportStore } from '@/stores/rangeExportStore';

interface RangePreviewListProps {
  onExportItem: (index: number) => void;
  onExportSelected: () => void;
  onJumpToItem: (index: number) => void;
}

export const RangePreviewList: React.FC<RangePreviewListProps> = ({
  onExportItem,
  onExportSelected,
  onJumpToItem,
}) => {
  const store = useRangeExportStore();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          size="xs"
          variant="ghost"
          onClick={() => store.setMultiSelectMode(!store.isMultiSelectMode)}
        >
          {store.isMultiSelectMode ? '多选' : '单选'}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={store.toggleSelectAll}
          disabled={store.items.length === 0 || !store.isMultiSelectMode}
        >
          {store.items.some((it) => !it.selected) ? '全选' : '取消全选'}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={onExportSelected}
          disabled={!store.items.some((it) => it.selected)}
        >
          批量导出
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={store.deleteSelected}
          disabled={!store.items.some((it) => it.selected)}
        >
          批量删除
        </Button>
      </div>

      <div
        className="flex flex-wrap gap-3 overflow-y-auto"
        style={{ maxHeight: '340px' }}
      >
        {store.items.map((item, index) => (
          <div
            key={index}
            className="relative"
            style={{
              width: '160px',
              height: '150px',
              outline: item.selected ? '2px solid rgb(25, 118, 210)' : 'none',
              outlineOffset: '2px',
            }}
          >
            <div
              className="relative overflow-hidden rounded cursor-pointer"
              style={{
                width: '100%',
                height: '120px',
                backgroundImage: item.imgBase64 ? `url(${item.imgBase64})` : undefined,
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'contain',
                backgroundColor: item.imgBase64 ? undefined : 'var(--bg-tertiary)',
              }}
              onClick={() => {
                if (store.isMultiSelectMode) store.toggleItemSelected(index);
              }}
            >
              <div
                className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor:
                    item.exportStatus === 'ready' ? 'rgba(100,100,100,0.6)' :
                    item.exportStatus === 'exporting' ? 'rgba(33,150,243,0.6)' :
                    item.exportStatus === 'success' ? 'rgba(76,175,80,0.6)' :
                    'rgba(244,67,54,0.6)',
                }}
              >
                {store.isMultiSelectMode ? (
                  <input
                    type="checkbox"
                    checked={!!item.selected}
                    onChange={() => store.toggleItemSelected(index)}
                    className="w-4 h-4"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-white text-xs leading-none">
                    {item.exportStatus === 'ready' && '○'}
                    {item.exportStatus === 'exporting' && '⟳'}
                    {item.exportStatus === 'success' && '✓'}
                    {item.exportStatus === 'error' && '✗'}
                  </span>
                )}
              </div>

              <div className="absolute top-1 right-8 flex opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="xs" variant="ghost" onClick={() => store.removeItem(index)}>
                  🗑
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  loading={item.exportStatus === 'exporting'}
                  onClick={() => onExportItem(index)}
                >
                  📥
                </Button>
              </div>

              <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="xs" variant="ghost" onClick={() => onJumpToItem(index)}>
                  🔍
                </Button>
              </div>
            </div>

            {item.fileName && (
              <div
                className="text-xs text-center mt-1 truncate"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {item.fileName}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default RangePreviewList;
