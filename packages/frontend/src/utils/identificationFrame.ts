import {
  getFilterImp,
  McDbBlockReference,
  McDbBlockTableRecord,
  McDbEntity,
  McDbPolyline,
  McGePoint3d,
  McObjectId,
  MxCADResbuf,
  MxCADSelectionSet,
  MxCADUtility,
  MxCpp,
} from 'mxcad';

export interface FrameInfo {
  minPt: McGePoint3d;
  maxPt: McGePoint3d;
}

function sortByAreaDesc(frames: FrameInfo[]): FrameInfo[] {
  return [...frames].sort((a, b) => {
    const areaA = (a.maxPt.x - a.minPt.x) * (a.maxPt.y - a.minPt.y);
    const areaB = (b.maxPt.x - b.minPt.x) * (b.maxPt.y - b.minPt.y);
    return areaB - areaA;
  });
}

function calculateFrameLevels(frames: FrameInfo[]): Map<FrameInfo, number> {
  const sortedFrames = sortByAreaDesc(frames);
  const levels = new Map<FrameInfo, number>();

  for (const frame of sortedFrames) {
    let level = 0;
    for (const [outerFrame, outerLevel] of levels.entries()) {
      if (
        frame.minPt.x >= outerFrame.minPt.x &&
        frame.minPt.y >= outerFrame.minPt.y &&
        frame.maxPt.x <= outerFrame.maxPt.x &&
        frame.maxPt.y <= outerFrame.maxPt.y
      ) {
        level = Math.max(level, outerLevel + 1);
      }
    }
    levels.set(frame, level);
  }

  return levels;
}

function filterNonNestedInSameLevel(frames: FrameInfo[]): FrameInfo[] {
  if (frames.length <= 1) return frames;

  const result: FrameInfo[] = [];
  for (const current of frames) {
    let isContained = false;
    for (const other of frames) {
      if (other === current) continue;
      if (
        current.minPt.x >= other.minPt.x &&
        current.minPt.y >= other.minPt.y &&
        current.maxPt.x <= other.maxPt.x &&
        current.maxPt.y <= other.maxPt.y
      ) {
        isContained = true;
        break;
      }
    }
    if (!isContained) {
      result.push(current);
    }
  }
  return result;
}

export const identificationByBlock = async (options?: {
  blockName?: string;
  isSpecifiedRange?: boolean;
  layerName?: string;
  targetLevel?: number;
}): Promise<FrameInfo[]> => {
  const { blockName, isSpecifiedRange = false, layerName, targetLevel = 0 } = options || {};
  const frames: FrameInfo[] = [];

  let targetBlockName = blockName;

  if (!targetBlockName) {
    const ids = await MxCADUtility.userSelect('选择图块图框');

    if (ids.length === 0) return frames;

    const firstId = ids[0];
    if (!firstId) return frames;
    const ent = firstId.getMcDbEntity();
    if (!(ent instanceof McDbBlockReference)) {
      return frames;
    }

    const referenceBlock = ent as McDbBlockReference;
    const referenceBlockRecord = referenceBlock.blockTableRecordId.getMcDbBlockTableRecord();
    if (!referenceBlockRecord) return frames;

    targetBlockName = referenceBlockRecord.name;
  }

  const ss = new MxCADSelectionSet();
  const filter = new MxCADResbuf();
  filter.AddMcDbEntityTypes('INSERT');
  if (isSpecifiedRange) {
    await ss.userSelect('识别图框的范围', filter);
  } else {
    ss.allSelect(filter);
  }

  ss.forEach((id) => {
    const entity = id.getMcDbEntity();
    if (entity instanceof McDbBlockReference) {
      const blockRef = entity as McDbBlockReference;
      const blockRecord = blockRef.blockTableRecordId.getMcDbBlockTableRecord();

      if (layerName && blockRef.layer !== layerName) return;

      if (blockRecord && blockRecord.name === targetBlockName) {
        const { minPt, maxPt } = blockRef.getBoundingBox();

        const actualMinPt = new McGePoint3d(
          Math.min(minPt.x, maxPt.x),
          Math.min(minPt.y, maxPt.y),
          Math.min(minPt.z, maxPt.z),
        );

        const actualMaxPt = new McGePoint3d(
          Math.max(minPt.x, maxPt.x),
          Math.max(minPt.y, maxPt.y),
          Math.max(minPt.z, maxPt.z),
        );

        frames.push({
          minPt: actualMinPt,
          maxPt: actualMaxPt,
        });
      }
    }
  });

  const levels = calculateFrameLevels(frames);
  const levelFilteredFrames = frames.filter((frame) => levels.get(frame) === targetLevel);
  const cleanedFrames = filterNonNestedInSameLevel(levelFilteredFrames);

  return cleanedFrames.filter(({ minPt, maxPt }) => {
    const ss = new MxCADSelectionSet();
    ss.imp.userSelect(minPt.x, minPt.y, maxPt.x, maxPt.y, getFilterImp(), false);
    return ss.count() > 0;
  });
};

export const identificationByPolyline = async (options?: {
  isSpecifiedRange?: boolean;
  layerName?: string;
  targetLevel?: number;
}): Promise<FrameInfo[]> => {
  const { isSpecifiedRange = true, layerName, targetLevel = 0 } = options || {};
  let ids: McObjectId[] = [];
  if (isSpecifiedRange) {
    ids = await MxCADUtility.userSelect('请选择图框');
  } else {
    const ss = new MxCADSelectionSet();
    const filter = new MxCADResbuf();
    filter.AddMcDbEntityTypes('LWPOLYLINE');
    ss.allSelect(filter);
    ids = ss.getIds();
  }

  const frames: FrameInfo[] = [];
  const isOrthogonal = (p1: McGePoint3d, p2: McGePoint3d, p3: McGePoint3d) =>
    (p2.x - p1.x) * (p2.x - p3.x) + (p2.y - p1.y) * (p2.y - p3.y) === 0;
  const isRectangle = (p1: McGePoint3d, p2: McGePoint3d, p3: McGePoint3d, p4: McGePoint3d) =>
    isOrthogonal(p1, p2, p3);

  const processMcDbPolyline = (ent: McDbEntity) => {
    if (ent instanceof McDbPolyline) {
      if (layerName && ent.layer !== layerName) {
        return;
      }

      const num = ent.numVerts();
      if (num === 0 || (ent.isClosed ? num > 4 : num > 5)) return;

      for (let index = 0; index < num; index++) {
        const bulge = ent.getBulgeAt(index);
        if (bulge > 0.001) return;
      }
      const startPt = ent.getPointAt(0).val;
      if (isRectangle(startPt, ent.getPointAt(1).val, ent.getPointAt(2).val, ent.isClosed ? startPt : ent.getPointAt(3).val)) {
        const { minPt, maxPt } = ent.getBoundingBox();
        frames.push({ minPt, maxPt });
      }
    }
  };

  const processMcDbBlockTableRecord = (block: McDbBlockReference) => {
    const record = block.blockTableRecordId.getMcDbBlockTableRecord();
    if (!record) return;
    record.getAllEntityId().forEach((id) => {
      const ent = id.getMcDbEntity();
      if (!ent) return;
      if (ent instanceof McDbPolyline) {
        processMcDbPolyline(ent);
      }
      if (ent instanceof McDbBlockReference) {
        processMcDbBlockTableRecord(ent);
      }
    });
  };

  ids.forEach((id) => {
    const ent = id.getMcDbEntity();
    if (ent instanceof McDbPolyline) {
      processMcDbPolyline(ent);
    } else if (ent instanceof McDbBlockReference) {
      if (layerName && ent.layer !== layerName) {
        return;
      }
      processMcDbBlockTableRecord(ent);
    }
  });

  const levels = calculateFrameLevels(frames);
  const levelFilteredFrames = frames.filter((frame) => levels.get(frame) === targetLevel);
  const cleanedFrames = filterNonNestedInSameLevel(levelFilteredFrames);

  return cleanedFrames.filter(({ minPt, maxPt }) => {
    const ss = new MxCADSelectionSet();
    ss.imp.userSelect(minPt.x, minPt.y, maxPt.x, maxPt.y, getFilterImp(), false);
    return ss.count() > 0;
  });
};

export const identificationFrame = async (options?: {
  method?: 'polyline' | 'block';
  blockName?: string;
  isSpecifiedRange?: boolean;
  layerName?: string;
  targetLevel?: number;
}): Promise<FrameInfo[]> => {
  const { method = 'polyline', blockName, isSpecifiedRange, layerName, targetLevel } = options || {};

  if (method === 'block') {
    return identificationByBlock({ blockName, isSpecifiedRange, layerName, targetLevel });
  }
  return identificationByPolyline({ isSpecifiedRange, layerName, targetLevel });
};
