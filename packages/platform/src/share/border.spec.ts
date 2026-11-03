import { describe, it, expect } from 'vitest';
import { isRectSurroundedByBorder, type RectBox } from './border';

const REGION = {
  minPt: { x: 0, y: 0 },
  maxPt: { x: 100, y: 100 },
};

/** 容差（CAD 长度）：相当于 5px 视觉误差，随视图缩放由调用方换算传入 */
const TOL = 1;

function box(x1: number, y1: number, x2: number, y2: number): RectBox {
  return {
    minPt: { x: Math.min(x1, x2), y: Math.min(y1, y2) },
    maxPt: { x: Math.max(x1, x2), y: Math.max(y1, y2) },
  };
}

/** 四条边各一条线，构成完整直角方形边框 */
function fullBorder(): RectBox[] {
  return [
    box(0, 0, 0, 100), // 左边
    box(100, 0, 100, 100), // 右边
    box(0, 100, 100, 100), // 上边
    box(0, 0, 100, 0), // 下边
  ];
}

describe('isRectSurroundedByBorder', () => {
  it('四条边各有实体边共线 → 是直角方形边框', () => {
    expect(isRectSurroundedByBorder(REGION, fullBorder(), TOL)).toBe(true);
  });

  it('单一闭合矩形实体（包围盒=区域）→ 是直角方形边框', () => {
    expect(isRectSurroundedByBorder(REGION, [box(0, 0, 100, 100)], TOL)).toBe(
      true
    );
  });

  it('缺少一条边 → 不是边框', () => {
    const three = fullBorder().slice(0, 3); // 无下边
    expect(isRectSurroundedByBorder(REGION, three, TOL)).toBe(false);
  });

  it('区域任意内移（远离边框，超过容差）→ 不是边框', () => {
    // 只框住中间，边框在 10 之外（tol=1，10>1）
    const inner = { minPt: { x: 10, y: 10 }, maxPt: { x: 90, y: 90 } };
    expect(isRectSurroundedByBorder(inner, fullBorder(), TOL)).toBe(false);
  });

  it('容差内偏移仍算共线（「两个坐标值附近的实体」）', () => {
    // 区域边在 0.5 偏移处，tol=1 → 0.5 <= 1 仍算共线
    const near = {
      minPt: { x: 0.5, y: 0.5 },
      maxPt: { x: 99.5, y: 99.5 },
    };
    expect(isRectSurroundedByBorder(near, fullBorder(), TOL)).toBe(true);
  });

  it('超出容差的偏移不算共线（5px 换算的容差精确判边）', () => {
    // 区域边偏移 2，tol=1 → 2 > 1 不算共线
    const off = {
      minPt: { x: 2, y: 2 },
      maxPt: { x: 98, y: 98 },
    };
    expect(isRectSurroundedByBorder(off, fullBorder(), TOL)).toBe(false);
  });

  it('横跨边线的点状实体不构成边框（沿边方向无可见长度）', () => {
    // 四边都有「点状」实体：bbox 沿边方向为 0 长度，不满足 overlap > tol
    const dots = [
      box(0, 40, 0, 40), // 左边一点
      box(100, 40, 100, 40), // 右边一点
      box(40, 100, 40, 100), // 上边一点
      box(40, 0, 40, 0), // 下边一点
    ];
    expect(isRectSurroundedByBorder(REGION, dots, TOL)).toBe(false);
  });

  it('退化区域（宽或高为 0）→ 不是边框', () => {
    const degenerate = { minPt: { x: 0, y: 0 }, maxPt: { x: 0, y: 100 } };
    expect(isRectSurroundedByBorder(degenerate, fullBorder(), TOL)).toBe(false);
  });

  it('空实体集合 → 不是边框', () => {
    expect(isRectSurroundedByBorder(REGION, [], TOL)).toBe(false);
  });

  it('容差非正（换算失败）→ 不是边框（保守）', () => {
    expect(isRectSurroundedByBorder(REGION, fullBorder(), 0)).toBe(false);
  });
});
