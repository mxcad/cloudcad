import { create } from 'zustand';

export const SHEET_SIZES = ['A1', 'A2', 'A3', 'A4', '自定义16.55x23.90'] as const;
export const PAPER_ORIENTATIONS = ['横向', '纵向'] as const;
export const OUTPUT_FORMATS = ['dwg', 'dxf', 'mxweb', 'pdf'] as const;

export type SheetSize = (typeof SHEET_SIZES)[number];
export type PaperOrientation = (typeof PAPER_ORIENTATIONS)[number];
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export interface ExportItem {
  imgBase64?: string;
  param: {
    bd_pt1_x: string;
    bd_pt1_y: string;
    bd_pt2_x: string;
    bd_pt2_y: string;
  };
  exportStatus: 'ready' | 'exporting' | 'success' | 'error';
  fileName?: string;
  selected?: boolean;
  name: string;
}

export interface MxScope {
  pt1X: number; pt1Y: number;
  pt2X: number; pt2Y: number;
  w: number; h: number;
  size: SheetSize;
  paperOrientation: PaperOrientation;
  mm: number;
  cadUnits: number;
}

export function getPaperSize(sheetSize: SheetSize) {
  switch (sheetSize) {
    case 'A1': return { w: 594, h: 841 };
    case 'A2': return { w: 420, h: 594 };
    case 'A3': return { w: 297, h: 420 };
    case 'A4': return { w: 210, h: 297 };
    case '自定义16.55x23.90': return { w: 165.5, h: 239, nw: 130, nh: 190 };
  }
}

interface RangeExportState {
  isOpen: boolean;

  selectionMethod: 'manual' | 'polyline' | 'block';
  isFullGraphMatch: boolean;

  layerName: string;
  blockName: string;
  levelDepth: number;

  format: OutputFormat;
  colorPolicy: 'mono' | 'color';

  sheetSize: SheetSize;
  paperOrientation: PaperOrientation;
  mm: number;
  cadUnits: number;

  expandFactor: number;

  pdfWidth: number;
  pdfHeight: number;

  lowerLeftX: number;
  lowerLeftY: number;
  upperRightX: number;
  upperRightY: number;

  isMultiSelectMode: boolean;
  showThumbnail: boolean;

  items: ExportItem[];
  scopeHistory: MxScope[];
}

interface RangeExportActions {
  setOpen: (open: boolean) => void;

  setSelectionMethod: (method: 'manual' | 'polyline' | 'block') => void;
  setIsFullGraphMatch: (v: boolean) => void;

  setLayerName: (name: string) => void;
  setBlockName: (name: string) => void;
  setLevelDepth: (depth: number) => void;

  setFormat: (format: OutputFormat) => void;
  setColorPolicy: (policy: 'mono' | 'color') => void;

  setSheetSize: (size: SheetSize) => void;
  setPaperOrientation: (orientation: PaperOrientation) => void;
  setMm: (mm: number) => void;
  setCadUnits: (units: number) => void;

  setExpandFactor: (factor: number) => void;
  setPdfWidth: (w: number) => void;
  setPdfHeight: (h: number) => void;

  setLowerLeft: (x: number, y: number) => void;
  setUpperRight: (x: number, y: number) => void;

  setMultiSelectMode: (mode: boolean) => void;
  setShowThumbnail: (show: boolean) => void;

  setItems: (items: ExportItem[]) => void;
  addItem: (item: ExportItem) => void;
  updateItem: (index: number, item: Partial<ExportItem>) => void;
  removeItem: (index: number) => void;
  clearItems: () => void;

  toggleItemSelected: (index: number) => void;
  toggleSelectAll: () => void;
  deleteSelected: () => void;

  pushScope: (scope: MxScope) => void;
  popScope: () => MxScope | undefined;

  reset: () => void;
}

const initialState: RangeExportState = {
  isOpen: false,
  selectionMethod: 'manual',
  isFullGraphMatch: false,
  layerName: '',
  blockName: '',
  levelDepth: 0,
  format: 'dwg',
  colorPolicy: 'mono',
  sheetSize: 'A4',
  paperOrientation: '横向',
  mm: 1,
  cadUnits: 1,
  expandFactor: 1,
  pdfWidth: 2000,
  pdfHeight: 2000,
  lowerLeftX: 0,
  lowerLeftY: 0,
  upperRightX: 0,
  upperRightY: 0,
  isMultiSelectMode: false,
  showThumbnail: true,
  items: [],
  scopeHistory: [],
};

export const useRangeExportStore = create<RangeExportState & RangeExportActions>((set, get) => ({
  ...initialState,

  setOpen: (open) => set({ isOpen: open }),

  setSelectionMethod: (method) => set({ selectionMethod: method }),
  setIsFullGraphMatch: (v) => set({ isFullGraphMatch: v }),

  setLayerName: (name) => set({ layerName: name }),
  setBlockName: (name) => set({ blockName: name }),
  setLevelDepth: (depth) => set({ levelDepth: depth }),

  setFormat: (format) => set({ format }),
  setColorPolicy: (policy) => set({ colorPolicy: policy }),

  setSheetSize: (size) => set({ sheetSize: size }),
  setPaperOrientation: (orientation) => set({ paperOrientation: orientation }),
  setMm: (mm) => set({ mm }),
  setCadUnits: (units) => set({ cadUnits: units }),

  setExpandFactor: (factor) => set({ expandFactor: factor }),
  setPdfWidth: (w) => set({ pdfWidth: w }),
  setPdfHeight: (h) => set({ pdfHeight: h }),

  setLowerLeft: (x, y) => set({ lowerLeftX: x, lowerLeftY: y }),
  setUpperRight: (x, y) => set({ upperRightX: x, upperRightY: y }),

  setMultiSelectMode: (mode) => set({ isMultiSelectMode: mode }),
  setShowThumbnail: (show) => set({ showThumbnail: show }),

  setItems: (items) => set({ items }),
  addItem: (item) => set((s) => ({ items: [...s.items, item] })),
  updateItem: (index, item) =>
    set((s) => ({
      items: s.items.map((it, i) => (i === index ? { ...it, ...item } : it)),
    })),
  removeItem: (index) => set((s) => ({ items: s.items.filter((_, i) => i !== index) })),
  clearItems: () => set({ items: [] }),

  toggleItemSelected: (index) =>
    set((s) => ({
      items: s.items.map((it, i) => (i === index ? { ...it, selected: !it.selected } : it)),
    })),
  toggleSelectAll: () =>
    set((s) => {
      const hasUnselected = s.items.some((it) => !it.selected);
      return { items: s.items.map((it) => ({ ...it, selected: hasUnselected })) };
    }),
  deleteSelected: () => set((s) => ({ items: s.items.filter((it) => !it.selected) })),

  pushScope: (scope) => set((s) => ({ scopeHistory: [...s.scopeHistory, scope] })),
  popScope: () => {
    const state = get();
    if (state.scopeHistory.length === 0) return undefined;
    const scope = state.scopeHistory[state.scopeHistory.length - 1];
    set((s) => ({ scopeHistory: s.scopeHistory.slice(0, -1) }));
    return scope;
  },

  reset: () => set(initialState),
}));
