import { useCallback, useRef } from 'react';
import { useRangeExportStore, getPaperSize, type SheetSize, type PaperOrientation, type ExportItem } from '@/stores/rangeExportStore';
import { identificationFrame } from '@/utils/identificationFrame';
import {
  calculateScaleToFitMaintainingAspectRatio,
  adjustPointsToFitWithAspectRatio,
  calculateOppositeCornerAutoScaleBasedOnPts,
} from '@/utils/printScale';
import { McGePoint3d, MxCpp, MxCADUiPrPoint, MxCADUiPrPointTransform, MxCADUiPrEntity, McDbBlockReference, McDbPolyline } from 'mxcad';
import { MxFun, DynamicInputType, MxThreeJS } from 'mxdraw';

const keepDecimal = (value: number, decimals: number) => Number(value.toFixed(decimals));

function useToast() {
  return {
    success: (msg: string) => { try { (window as any).MxPluginContext?.useMessage().success(msg); } catch {} },
    error: (msg: string) => { try { (window as any).MxPluginContext?.useMessage().error(msg); } catch {} },
    info: (msg: string) => { try { (window as any).MxPluginContext?.useMessage().info(msg); } catch {} },
    warning: (msg: string) => { try { (window as any).MxPluginContext?.useMessage().warning(msg); } catch {} },
  };
}

export function useRangeExport() {
  const store = useRangeExportStore();
  const toast = useToast();

  const oldPt1Ref = useRef<McGePoint3d | null>(null);
  const oldPt2Ref = useRef<McGePoint3d | null>(null);
  const oScaleRef = useRef(1);

  const getEffectivePaperSize = useCallback((paperOrientation: PaperOrientation, sheetSize: SheetSize) => {
    const { w, h, nw, nh } = getPaperSize(sheetSize);
    if (paperOrientation === '横向') {
      return { w: h, h: w, nw: nh, nh: nw };
    }
    return { w, h, nw, nh };
  }, []);

  const updateScope = useCallback((pt1: McGePoint3d, pt2: McGePoint3d) => {
    oldPt1Ref.current = pt1;
    oldPt2Ref.current = pt2;
    const { w, h } = getEffectivePaperSize(store.paperOrientation, store.sheetSize);

    const scaleFactor = calculateScaleToFitMaintainingAspectRatio(w, h, pt1, pt2);
    oScaleRef.current = scaleFactor;
    const newCadUnits = keepDecimal(store.mm * scaleFactor, 4);
    store.setCadUnits(newCadUnits);
    store.setLowerLeft(keepDecimal(pt1.x, 4), keepDecimal(pt1.y, 4));
    store.setUpperRight(keepDecimal(pt2.x, 4), keepDecimal(pt2.y, 4));
  }, [store, getEffectivePaperSize]);

  const updateDrawingBounds = useCallback(() => {
    const { minPt, maxPt } = MxCpp.getCurrentDatabase().currentSpace.getBoundingBox();
    updateScope(minPt, maxPt);
  }, [updateScope]);

  const updateCurrentlyDisplayedBounds = useCallback(() => {
    const { pt1, pt3 } = MxCpp.getCurrentMxCAD().getViewCADCoord();
    updateScope(pt1, pt3);
  }, [updateScope]);

  const updatePrintParameters = useCallback(() => {
    const { w, h } = getEffectivePaperSize(store.paperOrientation, store.sheetSize);
    const scale = store.cadUnits / store.mm;
    if (Math.abs(scale - oScaleRef.current) < 0.000001) return;
    oScaleRef.current = scale;

    const pt1 = oldPt1Ref.current;
    const pt2 = oldPt2Ref.current;
    if (!pt1 || !pt2) return;

    const [newPt1, newPt2] = adjustPointsToFitWithAspectRatio(w, h, pt1, pt2, scale);
    store.setLowerLeft(keepDecimal(newPt1!.x, 4), keepDecimal(newPt1!.y, 4));
    store.setUpperRight(keepDecimal(newPt2!.x, 4), keepDecimal(newPt2!.y, 4));
  }, [store, getEffectivePaperSize]);

  const updateSize = useCallback(() => {
    const { w, h } = getEffectivePaperSize(store.paperOrientation, store.sheetSize);
    if (!oldPt1Ref.current || !oldPt2Ref.current) return;
    const scaleFactor = calculateScaleToFitMaintainingAspectRatio(w, h, oldPt1Ref.current, oldPt2Ref.current);
    oScaleRef.current = scaleFactor;
    store.setCadUnits(keepDecimal(store.mm * scaleFactor, 4));
    updatePrintParameters();
  }, [store, getEffectivePaperSize, updatePrintParameters]);

  const expandFrameBoundary = useCallback((minPt: McGePoint3d, maxPt: McGePoint3d, expandFactor = store.expandFactor) => {
    return {
      minPt: new McGePoint3d(minPt.x - expandFactor, minPt.y - expandFactor, minPt.z),
      maxPt: new McGePoint3d(maxPt.x + expandFactor, maxPt.y + expandFactor, maxPt.z),
    };
  }, [store.expandFactor]);

  const getThumbnail = useCallback(async (minPt: McGePoint3d, maxPt: McGePoint3d): Promise<string | undefined> => {
    return new Promise((resolve) => {
      const mxcad = MxCpp.getCurrentMxCAD();
      mxcad.setAttribute({ ShowCoordinate: false });
      const w = Math.abs(minPt.x - maxPt.x);
      const h = Math.abs(minPt.y - maxPt.y);
      if (w < 1 || h < 1) return resolve(undefined);

      const targetWidth = 800;
      const jpg_width = w <= targetWidth ? w : targetWidth;
      const jpg_height = w <= targetWidth ? h : targetWidth * (h / w);

      mxcad.mxdraw.createCanvasImageData(
        (imageData: string) => {
          mxcad.setAttribute({ ShowCoordinate: true });
          resolve(imageData);
        },
        {
          width: jpg_width,
          height: jpg_height,
          range_pt1: minPt.toVector3(),
          range_pt2: maxPt.toVector3(),
        },
      );
    });
  }, []);

  const buildBoxParam = useCallback((minPt: McGePoint3d, maxPt: McGePoint3d) => ({
    bd_pt1_x: String(minPt.x),
    bd_pt1_y: String(minPt.y),
    bd_pt2_x: String(maxPt.x),
    bd_pt2_y: String(maxPt.y),
  }), []);

  const isDuplicateParam = useCallback((param: { bd_pt1_x: string; bd_pt1_y: string; bd_pt2_x: string; bd_pt2_y: string }) => {
    const epsilon = 0.001;
    return store.items.some((item) => {
      const x1 = Math.abs(parseFloat(item.param.bd_pt1_x) - parseFloat(param.bd_pt1_x)) < epsilon;
      const y1 = Math.abs(parseFloat(item.param.bd_pt1_y) - parseFloat(param.bd_pt1_y)) < epsilon;
      const x2 = Math.abs(parseFloat(item.param.bd_pt2_x) - parseFloat(param.bd_pt2_x)) < epsilon;
      const y2 = Math.abs(parseFloat(item.param.bd_pt2_y) - parseFloat(param.bd_pt2_y)) < epsilon;
      return x1 && y1 && x2 && y2;
    });
  }, [store.items]);

  const addItemWithDedup = useCallback(async (minPt: McGePoint3d, maxPt: McGePoint3d, name?: string) => {
    const param = buildBoxParam(minPt, maxPt);
    if (isDuplicateParam(param)) {
      toast.info('已过滤重复的区域');
      return;
    }

    let imgBase64: string | undefined;
    if (store.showThumbnail) {
      imgBase64 = await getThumbnail(minPt, maxPt);
    }

    store.addItem({
      imgBase64,
      param,
      exportStatus: 'ready',
      selected: false,
      name: name || `区域${store.items.length + 1}`,
    });
  }, [buildBoxParam, isDuplicateParam, store, getThumbnail, toast]);

  const manualSelect = useCallback(async () => {
    if (!store.isOpen) return;
    store.setOpen(false);

    try {
      const getPoint = new MxCADUiPrPoint();
      getPoint.clearLastInputPoint();
      getPoint.setMessage('\n指定输出范围第一点:');
      const pt1 = await getPoint.go();
      if (!pt1) return;

      getPoint.setMessage('\n指定输出范围第二点:');
      getPoint.setUserDraw((currentPoint: McGePoint3d, worldDraw: any) => {
        worldDraw.setColor(0xFF0000);
        const pl = new McDbPolyline();
        pl.addVertexAt(pt1);
        pl.addVertexAt(new McGePoint3d(pt1.x, (currentPoint as any).y));
        pl.addVertexAt(currentPoint);
        pl.addVertexAt(new McGePoint3d((currentPoint as any).x, pt1.y));
        (pl as any).constantWidth = MxFun.screenCoordLong2Doc(2);
        (pl as any).isClosed = true;
        worldDraw.drawMcDbEntity(pl);

        const points: any[] = [];
        points.push(pt1.toVector3());
        points.push(new (window as any).THREE.Vector3(pt1.x, (currentPoint as any).y));
        points.push(currentPoint.toVector3());
        points.push(new (window as any).THREE.Vector3((currentPoint as any).x, pt1.y));
        worldDraw.setColor(0x003244);
        worldDraw.drawSolid(points, 0.5);
      });
      getPoint.setDisableOsnap(true);
      getPoint.setDisableOrthoTrace(true);
      getPoint.setDynamicInputType(DynamicInputType.kXYCoordInput);
      const pt2 = await getPoint.go();
      if (!pt2) return;

      const minPt = new McGePoint3d(
        Math.min(pt1.x, pt2.x), Math.min(pt1.y, pt2.y), Math.min(pt1.z, pt2.z),
      );
      const maxPt = new McGePoint3d(
        Math.max(pt1.x, pt2.x), Math.max(pt1.y, pt2.y), Math.max(pt1.z, pt2.z),
      );

      const { minPt: eMin, maxPt: eMax } = expandFrameBoundary(minPt, maxPt);
      await addItemWithDedup(eMin, eMax);

      updateScope(pt1, pt2);
    } finally {
      store.setOpen(true);
    }
  }, [store, expandFrameBoundary, addItemWithDedup, updateScope]);

  const callFreeChoiceOfRange = useCallback(async () => {
    if (!store.isOpen) return;
    store.setOpen(false);

    try {
      const getPoint = new MxCADUiPrPointTransform(MxCpp.getCurrentMxCAD().getMxCADViewSpinMatrix());
      getPoint.clearLastInputPoint();
      getPoint.setMessage('\n指定输出范围第一点:');
      getPoint.setDisableOrthoTrace(true);
      const pt1 = await getPoint.go();
      if (!pt1) return;

      getPoint.setMessage('\n指定输出范围第二点:');
      getPoint.setUserDraw((currentPoint: McGePoint3d, worldDraw: any) => {
        if (!pt1) return;
        worldDraw.setColor(0xFF0000);
        const pl = new McDbPolyline();
        const cp = currentPoint;
        pl.addVertexAt(pt1);
        pl.addVertexAt(new McGePoint3d(pt1.x, cp.y));
        pl.addVertexAt(cp);
        pl.addVertexAt(new McGePoint3d(cp.x, pt1.y));
        (pl as any).constantWidth = MxFun.screenCoordLong2Doc(2);
        (pl as any).isClosed = true;
        worldDraw.drawMcDbEntity(pl);

        const points: any[] = [];
        points.push(pt1.toVector3());
        points.push(new (window as any).THREE.Vector3(pt1.x, cp.y));
        points.push(cp.toVector3());
        points.push(new (window as any).THREE.Vector3(cp.x, pt1.y));
        worldDraw.setColor(0x003244);
        worldDraw.drawSolid(points, 0.5);
      });
      getPoint.setDynamicInputType(DynamicInputType.kXYCoordInput);
      let pt2 = await getPoint.go();
      if (!pt2) return;

      pt1.transformBy((getPoint as any).rmat);
      pt2.transformBy((getPoint as any).rmat);

      const normMin = new McGePoint3d(Math.min(pt1.x, pt2.x), Math.min(pt1.y, pt2.y), Math.min(pt1.z, pt2.z));
      const normMax = new McGePoint3d(Math.max(pt1.x, pt2.x), Math.max(pt1.y, pt2.y), Math.max(pt1.z, pt2.z));
      const { minPt: eMin, maxPt: eMax } = expandFrameBoundary(normMin, normMax);
      await addItemWithDedup(eMin, eMax);
      updateScope(pt1, pt2);
    } finally {
      store.setOpen(true);
    }
  }, [store, expandFrameBoundary, addItemWithDedup, updateScope]);

  const callFixedProportionalSelection = useCallback(async () => {
    if (!store.isOpen) return;
    store.setOpen(false);

    try {
      let { w, h } = getEffectivePaperSize(store.paperOrientation, store.sheetSize);
      const scale = store.cadUnits / store.mm;
      w *= scale;
      h *= scale;

      const getPoint = new MxCADUiPrPoint();
      getPoint.clearLastInputPoint();
      getPoint.setMessage('\n指定打印范围第一点:');
      getPoint.disableAllTrace();
      const pt1 = await getPoint.go();
      if (!pt1) return;

      getPoint.setMessage('\n指定打印范围第二点:');
      getPoint.setDisableOrthoTrace(true);
      getPoint.setUserDraw((currentPoint: McGePoint3d, worldDraw: any) => {
        if (!pt1) return;
        const cp = calculateOppositeCornerAutoScaleBasedOnPts(w, h, pt1, currentPoint);
        worldDraw.setColor(0xFF0000);
        const pl = new McDbPolyline();
        pl.addVertexAt(pt1);
        pl.addVertexAt(new McGePoint3d(pt1.x, cp.y));
        pl.addVertexAt(cp);
        pl.addVertexAt(new McGePoint3d(cp.x, pt1.y));
        (pl as any).constantWidth = MxFun.screenCoordLong2Doc(2);
        (pl as any).isClosed = true;
        worldDraw.drawMcDbEntity(pl);

        const points: any[] = [];
        points.push(pt1.toVector3());
        points.push(new (window as any).THREE.Vector3(pt1.x, cp.y));
        points.push(cp.toVector3());
        points.push(new (window as any).THREE.Vector3(cp.x, pt1.y));
        worldDraw.setColor(0x003244);
        worldDraw.drawSolid(points, 0.5);
      });
      getPoint.setDisableOsnap(true);
      getPoint.setDisableOrthoTrace(true);
      getPoint.setDynamicInputType(DynamicInputType.kXYCoordInput);
      let pt2 = await getPoint.go();
      if (!pt2) return;
      pt2 = calculateOppositeCornerAutoScaleBasedOnPts(w, h, pt1, pt2);

      const normMin = new McGePoint3d(Math.min(pt1.x, pt2.x), Math.min(pt1.y, pt2.y), Math.min(pt1.z, pt2.z));
      const normMax = new McGePoint3d(Math.max(pt1.x, pt2.x), Math.max(pt1.y, pt2.y), Math.max(pt1.z, pt2.z));
      const { minPt: eMin, maxPt: eMax } = expandFrameBoundary(normMin, normMax);
      await addItemWithDedup(eMin, eMax);
      updateScope(pt1, pt2);
    } finally {
      store.setOpen(true);
    }
  }, [store, getEffectivePaperSize, expandFrameBoundary, addItemWithDedup, updateScope]);

  const callFixedDrawingSizeSelection = useCallback(async () => {
    if (!store.isOpen) return;
    store.setOpen(false);

    try {
      let { w, h, nw, nh } = getEffectivePaperSize(store.paperOrientation, store.sheetSize);
      const scale = store.cadUnits / store.mm;
      w *= scale; h *= scale;
      if (nw) nw *= scale;
      if (nh) nh *= scale;

      const getPoint = new MxCADUiPrPoint();
      getPoint.clearLastInputPoint();
      getPoint.setDisableOrthoTrace(true);
      getPoint.setMessage('\n指定打印中心位置');
      getPoint.setKeyWords('');

      const mxcad = MxCpp.getCurrentMxCAD();
      getPoint.setUserDraw((currentPoint: McGePoint3d, worldDraw: any) => {
        worldDraw.setColor(0xFF0000);
        const pl = new McDbPolyline();
        const p1 = currentPoint.clone();
        const p2 = new McGePoint3d(currentPoint.x, currentPoint.y + h);
        const p3 = new McGePoint3d(currentPoint.x + w, currentPoint.y + h);
        const p4 = new McGePoint3d(currentPoint.x + w, currentPoint.y);
        pl.addVertexAt(p1);
        pl.addVertexAt(p2);
        pl.addVertexAt(p3);
        pl.addVertexAt(p4);
        (pl as any).constantWidth = MxFun.screenCoordLong2Doc(2);
        (pl as any).isClosed = true;
        worldDraw.drawMcDbEntity(pl);

        const pts: any[] = [p1.toVector3(), p2.toVector3(), p3.toVector3(), p4.toVector3()];
        worldDraw.setColor(0x003244);
        worldDraw.drawSolid(pts, 0.5);

        if (nw && nh && nw > 0 && nh > 0) {
          const dashedPts: any[] = [
            p1.toVector3(), p2.toVector3(), p3.toVector3(), p4.toVector3(), p1.toVector3(),
          ];
          const lSize = mxcad.mxdraw.viewCoordLong2Cad(3);
          const dashed = MxThreeJS.createDashedLines(dashedPts, 0xFFFFFF, lSize * 2, lSize);
          worldDraw.drawEntity(dashed);
        }
      });

      const pt = await getPoint.go();
      if (!pt) return;

      const pt1 = pt.clone();
      const pt2 = new McGePoint3d(pt.x + w, pt.y + h);

      const { minPt: eMin, maxPt: eMax } = expandFrameBoundary(pt1, pt2);
      await addItemWithDedup(eMin, eMax);
      updateScope(pt1, pt2);
    } finally {
      store.setOpen(true);
    }
  }, [store, getEffectivePaperSize, expandFrameBoundary, addItemWithDedup, updateScope]);

  const recognizeByPolyline = useCallback(async () => {
    const frames = await identificationFrame({
      method: 'polyline',
      isSpecifiedRange: !store.isFullGraphMatch,
      layerName: store.layerName || undefined,
      targetLevel: store.levelDepth,
    });

    if (frames.length === 0) {
      toast.error('未找到符合条件的图框');
      return;
    }

    for (const frame of frames) {
      if (!frame) continue;
      const { minPt: eMin, maxPt: eMax } = expandFrameBoundary(frame.minPt, frame.maxPt);
      await addItemWithDedup(eMin, eMax);
    }
    toast.success(`识别到 ${frames.length} 个图框`);
  }, [store.isFullGraphMatch, store.layerName, store.levelDepth, expandFrameBoundary, addItemWithDedup, toast]);

  const recognizeByBlock = useCallback(async () => {
    if (!store.blockName) {
      toast.error('请输入图块名称');
      return;
    }

    const frames = await identificationFrame({
      method: 'block',
      blockName: store.blockName,
      isSpecifiedRange: !store.isFullGraphMatch,
      layerName: store.layerName || undefined,
    });

    if (frames.length === 0) {
      toast.error('未找到符合条件的图框');
      return;
    }

    for (const frame of frames) {
      if (!frame) continue;
      const { minPt: eMin, maxPt: eMax } = expandFrameBoundary(frame.minPt, frame.maxPt);
      await addItemWithDedup(eMin, eMax);
    }
    toast.success(`识别到 ${frames.length} 个图框`);
  }, [store.blockName, store.isFullGraphMatch, store.layerName, expandFrameBoundary, addItemWithDedup, toast]);

  const pickLayerName = useCallback(async () => {
    if (!store.isOpen) return;
    store.setOpen(false);

    try {
      const getEnt = new MxCADUiPrEntity();
      getEnt.setMessage('选择对象获取图层名:');
      const entId = await getEnt.go();
      if (!entId.isValid()) {
        toast.warning('未选中任何对象');
        return;
      }
      const ent = entId.getMcDbEntity();
      if (!ent) {
        toast.warning('无法获取对象');
        return;
      }
      const layerName = ent.layer;
      if (!layerName) {
        toast.warning('无法获取对象的图层名');
        return;
      }
      store.setLayerName(layerName);
      toast.success('已获取图层名: ' + layerName);
    } catch (err) {
      console.error('获取图层名失败:', err);
    } finally {
      store.setOpen(true);
    }
  }, [store, toast]);

  const pickBlockName = useCallback(async () => {
    if (!store.isOpen) return;
    store.setOpen(false);

    try {
      const getEnt = new MxCADUiPrEntity();
      getEnt.setMessage('选择图块获取名称:');
      const entId = await getEnt.go();
      if (!entId.isValid()) {
        toast.warning('未选中任何对象');
        return;
      }
      const ent = entId.getMcDbEntity();
      if (!ent) {
        toast.warning('无法获取对象');
        return;
      }
      if (ent instanceof McDbBlockReference) {
        const blockRef = ent as any;
        const name = blockRef.blockName;
        if (!name) {
          toast.warning('无法获取图块名称');
          return;
        }
        store.setBlockName(name);
        toast.success('已获取图块名: ' + name);
      } else {
        toast.warning('所选对象不是图块');
      }
    } catch (err) {
      console.error('获取图块名失败:', err);
    } finally {
      store.setOpen(true);
    }
  }, [store, toast]);

  const jumpToItem = useCallback((index: number) => {
    const item = store.items[index];
    if (!item) return;

    const x1 = parseFloat(item.param.bd_pt1_x);
    const y1 = parseFloat(item.param.bd_pt1_y);
    const x2 = parseFloat(item.param.bd_pt2_x);
    const y2 = parseFloat(item.param.bd_pt2_y);

    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    const expandFactor = 0.2;

    const mxcad = MxCpp.getCurrentMxCAD();
    mxcad.zoomW(
      new McGePoint3d(x1 - width * expandFactor, y1 - height * expandFactor),
      new McGePoint3d(x2 + width * expandFactor, y2 + height * expandFactor),
    );

    const tempDraw = mxcad.mxdraw.getTempMarkDraw();
    tempDraw.clear();

    const pt1 = new (window as any).THREE.Vector3(x1, y1, 0);
    const pt2 = new (window as any).THREE.Vector3(x2, y1, 0);
    const pt3 = new (window as any).THREE.Vector3(x2, y2, 0);
    const pt4 = new (window as any).THREE.Vector3(x1, y2, 0);
    const rectLine = MxThreeJS.createLines([pt1, pt2, pt3, pt4, pt1], 0xff0000);
    tempDraw.drawEntity(rectLine);
    mxcad.updateDisplay();

    setTimeout(() => {
      toast.warning('点击鼠标左键返回');
      document.addEventListener('click', () => {
        tempDraw.clear();
        store.setOpen(true);
      }, { once: true });
    });
  }, [store, toast]);

  const saveCurrentDrawingAsBlob = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      MxCpp.App.getCurrentMxCAD().saveFile(
        'export',
        (data: { buffer: ArrayBuffer }) => {
          const blob = new Blob([data.buffer], { type: 'application/octet-binary' });
          resolve(blob);
        },
        false, false, undefined,
      );
    });
  }, []);

  const blobToBase64 = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        resolve(typeof result === 'string' ? result.split(',')[1] || '' : '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }, []);

  const exportItem = useCallback(async (index: number): Promise<boolean> => {
    const item = store.items[index];
    if (!item || item.exportStatus === 'exporting') return false;

    store.updateItem(index, { exportStatus: 'exporting' });

    try {
      const blob = await saveCurrentDrawingAsBlob();
      const base64File = await blobToBase64(blob);

      const format = store.format;
      const query: Record<string, string> = { format };
      query.bd_pt1_x = item.param.bd_pt1_x;
      query.bd_pt1_y = item.param.bd_pt1_y;
      query.bd_pt2_x = item.param.bd_pt2_x;
      query.bd_pt2_y = item.param.bd_pt2_y;

      if (format === 'pdf') {
        query.width = String(store.pdfWidth);
        query.height = String(store.pdfHeight);
        query.colorPolicy = store.colorPolicy;
      }

      const response = await fetch(`/api/v1/public-file/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: base64File, ...query }),
      });

      if (!response.ok) throw new Error('导出请求失败');

      const pdfBlob = await response.blob();
      const url = URL.createObjectURL(pdfBlob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.name}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      store.updateItem(index, { exportStatus: 'success', fileName: `${item.name}.${format}` });
      return true;
    } catch (e) {
      console.error('导出失败:', e);
      store.updateItem(index, { exportStatus: 'error' });
      return false;
    }
  }, [store, saveCurrentDrawingAsBlob, blobToBase64]);

  const exportAll = useCallback(async () => {
    const hasExporting = store.items.some((it) => it.exportStatus === 'exporting');
    if (hasExporting) return;
    if (store.items.length === 0) {
      toast.error('请先添加导出区域');
      return;
    }

    const indices = store.items.map((_, i) => i);
    for (const i of indices) {
      if (store.items[i]?.exportStatus === 'exporting') continue;
      store.updateItem(i, { exportStatus: 'ready' });
      await exportItem(i);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }, [store, exportItem, toast]);

  const exportSelected = useCallback(async () => {
    const selected = store.items.map((it, i) => it.selected ? i : -1).filter((i) => i >= 0);
    if (selected.length === 0) {
      toast.error('请先选择要导出的区域');
      return;
    }
    for (const i of selected) {
      store.updateItem(i, { exportStatus: 'ready' });
      await exportItem(i);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    toast.success('选中项导出成功');
  }, [store, exportItem, toast]);

  return {
    store,
    updateScope,
    updateDrawingBounds,
    updateCurrentlyDisplayedBounds,
    updatePrintParameters,
    updateSize,

    manualSelect,
    callFreeChoiceOfRange,
    callFixedProportionalSelection,
    callFixedDrawingSizeSelection,

    recognizeByPolyline,
    recognizeByBlock,

    pickLayerName,
    pickBlockName,

    jumpToItem,

    addItemWithDedup,
    getThumbnail,

    exportItem,
    exportAll,
    exportSelected,
  };
}
