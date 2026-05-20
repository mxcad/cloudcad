import React, { useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { Section } from '@/components/ui/Section';
import { RangePreviewList } from './RangePreviewList';
import { useRangeExportStore, SHEET_SIZES, PAPER_ORIENTATIONS, OUTPUT_FORMATS } from '@/stores/rangeExportStore';
import { useRangeExport } from '@/hooks/useRangeExport';

interface RangeExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RangeExportDialog: React.FC<RangeExportDialogProps> = ({ isOpen, onClose }) => {
  const store = useRangeExportStore();
  const {
    manualSelect,
    callFreeChoiceOfRange,
    callFixedProportionalSelection,
    callFixedDrawingSizeSelection,
    recognizeByPolyline,
    recognizeByBlock,
    pickLayerName,
    pickBlockName,
    exportItem,
    exportAll,
    exportSelected,
    jumpToItem,
    updateSize,
    updatePrintParameters,
  } = useRangeExport();

  const handleClose = useCallback(() => {
    store.reset();
    onClose();
  }, [store, onClose]);

  const handleRecognize = useCallback(() => {
    if (store.selectionMethod === 'block') {
      recognizeByBlock();
    } else {
      recognizeByPolyline();
    }
  }, [store.selectionMethod, recognizeByBlock, recognizeByPolyline]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="范围导出"
      maxWidth="max-w-4xl"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            取消
          </Button>
          <Button variant="outline" onClick={exportAll}>
            导出全部
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        {/* 左栏：选择区域 */}
        <Section title="选择区域" className="h-full">
          <div className="space-y-3">
            {/* 选择方式 */}
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input
                type="radio"
                checked={store.selectionMethod === 'manual'}
                onChange={() => store.setSelectionMethod('manual')}
              />
              手动框选
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input
                type="radio"
                checked={store.selectionMethod === 'polyline'}
                onChange={() => store.setSelectionMethod('polyline')}
              />
              多段线图框识别
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input
                type="radio"
                checked={store.selectionMethod === 'block'}
                onChange={() => store.setSelectionMethod('block')}
              />
              图块图框识别
            </label>

            {/* 全图匹配 */}
            <Checkbox
              checked={store.isFullGraphMatch}
              onChange={(e) => store.setIsFullGraphMatch(e.target.checked)}
              label="全图匹配"
              size="sm"
            />

            {/* 过滤条件 */}
            <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-default)' }}>
              <div className="flex items-center gap-1">
                <Input
                  size="sm"
                  value={store.blockName}
                  onChange={(e) => store.setBlockName(e.target.value)}
                  placeholder="图块名称"
                  wrapperClassName="flex-1"
                />
                <Button size="xs" variant="outline" onClick={pickBlockName} tooltip="点选获取">
                  🎯
                </Button>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  size="sm"
                  value={store.layerName}
                  onChange={(e) => store.setLayerName(e.target.value)}
                  placeholder="图层名称"
                  wrapperClassName="flex-1"
                />
                <Button size="xs" variant="outline" onClick={pickLayerName} tooltip="点选获取">
                  🎯
                </Button>
              </div>
              <Input
                size="sm"
                type="number"
                min="0"
                value={String(store.levelDepth)}
                onChange={(e) => store.setLevelDepth(Number(e.target.value))}
                placeholder="层级深度 (0=最外层)"
              />
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-col gap-1">
              <Button size="sm" variant="outline" onClick={manualSelect}>
                手动框选
              </Button>
              <Button size="sm" variant="outline" onClick={callFreeChoiceOfRange}>
                自由选择
              </Button>
              <Button size="sm" variant="outline" onClick={callFixedProportionalSelection}>
                固定比例选择
              </Button>
              <Button size="sm" variant="outline" onClick={callFixedDrawingSizeSelection}>
                固定图纸大小选择
              </Button>
              <Button size="sm" variant="outline" onClick={handleRecognize}>
                图框识别
              </Button>
            </div>

            {/* 坐标显示 */}
            <div className="space-y-1 pt-2 border-t" style={{ borderColor: 'var(--border-default)' }}>
              <Input
                size="xs"
                value={String(store.lowerLeftX)}
                onChange={(e) => store.setLowerLeft(Number(e.target.value), store.lowerLeftY)}
                placeholder="左下 X"
              />
              <Input
                size="xs"
                value={String(store.lowerLeftY)}
                onChange={(e) => store.setLowerLeft(store.lowerLeftX, Number(e.target.value))}
                placeholder="左下 Y"
              />
              <Input
                size="xs"
                value={String(store.upperRightX)}
                onChange={(e) => store.setUpperRight(Number(e.target.value), store.upperRightY)}
                placeholder="右上 X"
              />
              <Input
                size="xs"
                value={String(store.upperRightY)}
                onChange={(e) => store.setUpperRight(store.upperRightX, Number(e.target.value))}
                placeholder="右上 Y"
              />
            </div>
          </div>
        </Section>

        {/* 右栏：输出设置 */}
        <div className="flex flex-col gap-4">
          <Section title="输出设置">
            <div className="space-y-3">
              <Select
                value={store.format}
                onChange={(v) => store.setFormat(v as any)}
                options={OUTPUT_FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }))}
                size="sm"
              />

              <Select
                value={store.colorPolicy}
                onChange={(v) => store.setColorPolicy(v as any)}
                options={[
                  { value: 'mono', label: '黑白' },
                  { value: 'color', label: '彩色' },
                ]}
                size="sm"
              />

              <div className="pt-2 border-t" style={{ borderColor: 'var(--border-default)' }}>
                <Select
                  value={store.sheetSize}
                  onChange={(v) => {
                    store.setSheetSize(v as any);
                    setTimeout(updateSize, 0);
                  }}
                  options={SHEET_SIZES.map((s) => ({ value: s, label: s }))}
                  size="sm"
                />
                <div className="mt-2">
                  <Select
                    value={store.paperOrientation}
                    onChange={(v) => {
                      store.setPaperOrientation(v as any);
                      setTimeout(updateSize, 0);
                    }}
                    options={PAPER_ORIENTATIONS.map((o) => ({ value: o, label: o }))}
                    size="sm"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-default)' }}>
                <Input
                  size="sm"
                  type="number"
                  min="0"
                  value={String(store.mm)}
                  onChange={(e) => store.setMm(Number(e.target.value))}
                  onBlur={updatePrintParameters}
                  rightNode={<span className="text-xs" style={{ color: 'var(--text-muted)' }}>毫米</span>}
                />
                <div className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>=</div>
                <Input
                  size="sm"
                  type="number"
                  min="0"
                  value={String(store.cadUnits)}
                  onChange={(e) => store.setCadUnits(Number(e.target.value))}
                  onBlur={updatePrintParameters}
                  rightNode={<span className="text-xs" style={{ color: 'var(--text-muted)' }}>CAD绘图单位</span>}
                />
              </div>

              <div className="pt-2 border-t" style={{ borderColor: 'var(--border-default)' }}>
                <Input
                  size="sm"
                  type="number"
                  min="0"
                  value={String(store.expandFactor)}
                  onChange={(e) => store.setExpandFactor(Number(e.target.value))}
                  rightNode={<span className="text-xs" style={{ color: 'var(--text-muted)' }}>单位</span>}
                />
              </div>

              {/* PDF 额外参数 */}
              <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-default)' }}>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    size="sm"
                    type="number"
                    value={String(store.pdfWidth)}
                    onChange={(e) => store.setPdfWidth(Number(e.target.value))}
                    placeholder="PDF宽度"
                  />
                  <Input
                    size="sm"
                    type="number"
                    value={String(store.pdfHeight)}
                    onChange={(e) => store.setPdfHeight(Number(e.target.value))}
                    placeholder="PDF高度"
                  />
                </div>
              </div>

              <Checkbox
                checked={store.showThumbnail}
                onChange={(e) => store.setShowThumbnail(e.target.checked)}
                label="显示缩略图"
                size="sm"
              />
            </div>
          </Section>
        </div>
      </div>

      {/* 预览列表 */}
      <div className="mt-4">
        <Section title="预览列表">
          <RangePreviewList
            onExportItem={exportItem}
            onExportSelected={exportSelected}
            onJumpToItem={jumpToItem}
          />
        </Section>
      </div>
    </Modal>
  );
};

export default RangeExportDialog;
