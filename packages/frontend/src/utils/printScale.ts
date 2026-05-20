import { McGePoint3d } from 'mxcad';

export function calculateScaleToFitMaintainingAspectRatio(
  rectBWidth: number,
  rectBHeight: number,
  pt1: McGePoint3d,
  pt2: McGePoint3d,
) {
  const newWidth = Math.abs(pt2.x - pt1.x);
  const newHeight = Math.abs(pt2.y - pt1.y);

  let scaleFactor: number;
  if (rectBWidth / newWidth < rectBHeight / newHeight) {
    scaleFactor = newWidth / rectBWidth;
  } else {
    scaleFactor = newHeight / rectBHeight;
  }

  return scaleFactor;
}

export function adjustPointsToFitWithAspectRatio(
  rectBWidth: number,
  rectBHeight: number,
  pt1: McGePoint3d,
  pt2: McGePoint3d,
  newScaleFactor: number,
) {
  const scaledWidth = rectBWidth * newScaleFactor;
  const scaledHeight = rectBHeight * newScaleFactor;

  const centerX = (pt1.x + pt2.x) / 2;
  const centerY = (pt1.y + pt2.y) / 2;

  const adjustedPt1 = new McGePoint3d(centerX - scaledWidth / 2, centerY + scaledHeight / 2);
  const adjustedPt2 = new McGePoint3d(centerX + scaledWidth / 2, centerY - scaledHeight / 2);

  return [adjustedPt1, adjustedPt2];
}

export function calculateOppositeCornerAutoScaleBasedOnPts(
  rectBWidth: number,
  rectBHeight: number,
  pt1: McGePoint3d,
  pt2: McGePoint3d,
): McGePoint3d {
  const newWidth = Math.abs(pt2.x - pt1.x);
  const newHeight = Math.abs(pt2.y - pt1.y);

  let scaleFactor: number;
  if (newWidth > newHeight) {
    scaleFactor = newWidth / rectBWidth;
  } else {
    scaleFactor = newHeight / rectBHeight;
  }

  const adjustedWidth = rectBWidth * scaleFactor;
  const adjustedHeight = rectBHeight * scaleFactor;

  const pt2Adjusted = new McGePoint3d(pt1.x + adjustedWidth, pt1.y - adjustedHeight);

  return pt2Adjusted;
}
