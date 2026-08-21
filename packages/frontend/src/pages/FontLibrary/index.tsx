import { FileCode, Trash2 } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useSelectionShortcuts } from '../../hooks/common/useSelectionShortcuts';
import { useRubberBandSelection } from '../../hooks/common/useRubberBandSelection';
import { BatchActionBar } from '@/components/common/BatchActionBar';
import { t } from '@/languages';
import { useFontLibrary } from './hooks/useFontLibrary';
import { FontPageHeader } from './components/FontPageHeader';
import { FontToolbar } from './components/FontToolbar';
import { FontGridView } from './components/FontGridView';
import { FontListView } from './components/FontListView';
import { UploadFontModal } from './components/UploadFontModal';

export default function FontLibrary() {
  useDocumentTitle(t('字体库'));

  const {
    fonts,
    loading,
    activeTab,
    filters,
    sortBy,
    sortOrder,
    viewMode,
    showUploadModal,
    selectedFonts,
    canReadFonts,
    canUploadFonts,
    canDeleteFonts,
    canDownloadFonts,
    stats,
    setActiveTab,
    handleFilterChange,
    handleReset,
    handleSort,
    handleSelect,
    handleSelectAll,
    clearSelection,
    selectMany,
    handleDelete,
    handleBatchDelete,
    handleDownload,
    setShowUploadModal,
    setViewMode,
    fetchFonts,
    formatDate,
  } = useFontLibrary();

  // 多选快捷键：ESC 清空 / Ctrl+A 全选 / Delete 批量删除（有权限且选中时）
  const selectedCount = selectedFonts.size;
  useSelectionShortcuts({
    enabled: !loading && canReadFonts,
    onClearSelection: clearSelection,
    onSelectAll: handleSelectAll,
    onDeleteSelected: canDeleteFonts ? handleBatchDelete : undefined,
    canDelete: selectedCount > 0,
  });

  // 鼠标拖拽框选：内容区为滚动容器（flex-1），边缘自动滚动
  const {
    scrollContainerRef,
    rubberBandJustEndedRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    rubberBandOverlay,
  } = useRubberBandSelection({ onRubberBandSelect: selectMany });

  if (!canReadFonts) {
    return (
      <div className="page-content-theme min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-bg-tertiary flex items-center justify-center">
            <FileCode size={40} className="text-text-muted" />
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            {t('无访问权限')}
          </h2>
          <p className="text-text-tertiary">{t('您没有查看字体库的权限')}</p>
        </div>
      </div>
    );
  }

  const hasNameOrFormatFilter = Boolean(filters.name || filters.extension);

  // 底部悬浮操作栏（grid/list 两视图共用；列表滚动容器内 sticky 吸底，不占布局空间）
  const batchBar =
    selectedCount > 0 ? (
      <BatchActionBar
        count={selectedCount}
        onClear={clearSelection}
        selectAllChecked={
          selectedFonts.size === fonts.length && fonts.length > 0
        }
        onSelectAll={handleSelectAll}
        actions={
          canDeleteFonts
            ? [
                {
                  key: 'delete',
                  label: t('批量删除'),
                  icon: Trash2,
                  variant: 'danger',
                  onClick: () => void handleBatchDelete(),
                },
              ]
            : []
        }
      />
    ) : undefined;

  return (
    <div className="page-content-theme h-full flex flex-col overflow-hidden p-6">
      <div className="max-w-7xl mx-auto w-full flex flex-col flex-1 min-h-0">
        {/* 页头 + 工具栏：固定不随内容滚动（同 LibraryManager 布局） */}
        <div className="flex-shrink-0">
          <FontPageHeader
            activeTab={activeTab}
            canUploadFonts={canUploadFonts}
            stats={stats}
            setActiveTab={setActiveTab}
            openUploadModal={() => setShowUploadModal(true)}
            clearSelection={clearSelection}
          />

          <FontToolbar
            filters={filters}
            viewMode={viewMode}
            sortBy={sortBy}
            sortOrder={sortOrder}
            handleFilterChange={handleFilterChange}
            handleReset={handleReset}
            handleSort={handleSort}
            setViewMode={setViewMode}
          />
        </div>

        {viewMode === 'grid' ? (
          // grid 视图：页面层滚动容器承载框选（ADR-0052）
          <div
            ref={scrollContainerRef}
            // pt-3：第一行卡片 hover 上浮（-translate-y-0.5）与选中 ring
            // 需顶部留白，否则被 overflow-y-auto 裁切看不到边框
            className="relative flex-1 min-h-0 overflow-y-auto select-none px-2 pt-3 [-webkit-touch-callout:none]"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          >
            {/* 内容包装：有操作栏时 min-h-full 撑满滚动容器（内容不足一屏时 mt-auto 把操作栏
                推到底部=页面底部；内容超出时操作栏随内容滚动并在视口底部吸底） */}
            <div className={batchBar ? 'min-h-full flex flex-col' : undefined}>
              <div className="relative">
                <FontGridView
                  fonts={fonts}
                  loading={loading}
                  selectedFonts={selectedFonts}
                  canUploadFonts={canUploadFonts}
                  canDownloadFonts={canDownloadFonts}
                  canDeleteFonts={canDeleteFonts}
                  hasActiveFilters={hasNameOrFormatFilter}
                  handleSelect={handleSelect}
                  handleDelete={handleDelete}
                  handleDownload={handleDownload}
                  openUploadModal={() => setShowUploadModal(true)}
                  formatDate={formatDate}
                  rubberBandJustEndedRef={rubberBandJustEndedRef}
                />
                {rubberBandOverlay}
              </div>
              {/* 底部悬浮操作栏：mt-auto 内容不足一屏时贴滚动容器底部（=页面底部），
                  内容超出时 sticky 吸底（不占布局空间） */}
              {batchBar && (
                <div className="mt-auto sticky bottom-0 z-10 flex justify-center pt-1 pb-3 pointer-events-none">
                  <div className="pointer-events-auto">{batchBar}</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          // list 视图：SelectableTable 自带滚动容器与框选（ADR-0052）
          <div className="flex-1 min-h-0">
            <FontListView
              fonts={fonts}
              loading={loading}
              selectedFonts={selectedFonts}
              canDownloadFonts={canDownloadFonts}
              canDeleteFonts={canDeleteFonts}
              handleSelect={handleSelect}
              handleSelectAll={handleSelectAll}
              handleDelete={handleDelete}
              handleDownload={handleDownload}
              formatDate={formatDate}
              selectMany={selectMany}
              bottomBar={batchBar}
            />
          </div>
        )}

        <div className="flex-shrink-0 mt-3 text-center text-sm text-text-tertiary">
          {t('共')}{' '}
          <span className="text-text-primary font-medium">{fonts.length}</span>{' '}
          {t('个字体文件')}
          {filters.name && t(' · 搜索 ') + filters.name + '"'}
          {filters.extension && t(' · 格式 ') + filters.extension}
        </div>

        {showUploadModal && (
          <UploadFontModal
            onClose={() => setShowUploadModal(false)}
            onSuccess={() => {
              setShowUploadModal(false);
              fetchFonts();
            }}
            defaultTarget={activeTab}
          />
        )}
      </div>
    </div>
  );
}
