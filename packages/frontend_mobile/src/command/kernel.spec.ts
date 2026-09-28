import { describe, it, expect, vi } from 'vitest'
import {
  areLinesCollinear,
  calculateDistanceFromPointToLine,
  copyAttribute,
  darkenColor,
  isSegmentStartCloserToPoint,
  selectLineSegmentFromPolylineByPoint,
} from './kernel'

/**
 * 几何内核的数学契约回归。
 *
 * 这组函数过去埋在 1539 行的 m_mx_fillet 里、靠兄弟命令文件横向 import，
 * 5 个文件共享却没有一处测试——而它们大多是纯几何计算，本可零成本覆盖。
 * 收拢到 kernel.ts 后在这里按接口固定行为，实现可随意重构。
 *
 * 测试只用鸭子类型的二维向量/实体替身，不启动 CAD 引擎：
 * 被测函数只读取或调用参数对象上的方法，不依赖引擎构造器。
 */
vi.mock('mxcad', () => ({
  McDb: { Intersect: { kExtendBoth: 0 } },
  McDbArc: vi.fn(),
  McDbEntity: vi.fn(),
  McDbLine: vi.fn(),
  McDbPolyline: vi.fn(),
  McGePoint3d: vi.fn(),
  MxCADUtility: { calcBulge: vi.fn() },
}))

type Pt = Parameters<typeof calculateDistanceFromPointToLine>[0]
type Line = Parameters<typeof areLinesCollinear>[0]
type Ent = Parameters<typeof copyAttribute>[0]
type Poly = Parameters<typeof selectLineSegmentFromPolylineByPoint>[0]
type Color = Parameters<typeof darkenColor>[0]

/** 最小二维向量替身：只提供被测函数用到的方法 */
interface PtStub {
  x: number
  y: number
  z: number
  clone(): PtStub
  sub(o: PtStub): PtStub
  crossProduct(o: PtStub): { length(): number }
  dotProduct(o: PtStub): number
  length(): number
  distanceTo(o: PtStub): number
}

function pt(x: number, y: number): Pt & PtStub {
  const self: PtStub = {
    x,
    y,
    z: 0,
    clone() {
      return pt(this.x, this.y)
    },
    sub(o) {
      return pt(this.x - o.x, this.y - o.y)
    },
    crossProduct(o) {
      const z = this.x * o.y - this.y * o.x
      return { length: () => Math.abs(z) }
    },
    dotProduct(o) {
      return this.x * o.x + this.y * o.y
    },
    length() {
      return Math.hypot(this.x, this.y)
    },
    distanceTo(o) {
      return Math.hypot(this.x - o.x, this.y - o.y)
    },
  }
  return self as unknown as Pt & PtStub
}

/** 线段替身：共线判定只读端点坐标 */
function seg(x1: number, y1: number, x2: number, y2: number): Line {
  return {
    startPoint: { x: x1, y: y1 },
    endPoint: { x: x2, y: y2 },
  } as unknown as Line
}

/**
 * 多段线替身。最近点固定返回投影点，避免引入额外投影逻辑。
 *
 * getPointAt 越界返回 { val: undefined }——循环最后一步会取 getPointAt(numVerts())，
 * 真引擎此时返回空结果而非抛错，被测代码靠 `if (nextPt && ...)` 接住。
 */
function polyline(points: Array<[number, number]>, isClosed = false, closest: Pt = pt(0, 0)): Poly {
  return {
    numVerts: () => points.length,
    getPointAt: (i: number) => ({
      val: points[i] ? pt(points[i][0], points[i][1]) : undefined,
    }),
    getClosestPointTo: () => ({ val: closest }),
    isClosed,
  } as unknown as Poly
}

describe('calculateDistanceFromPointToLine — 点到线段的距离', () => {
  it('垂足落在线段内部：返回到直线的垂直距离', () => {
    expect(calculateDistanceFromPointToLine(pt(5, 3), pt(0, 0), pt(10, 0))).toBe(3)
  })

  it('垂足越过终点：返回到终点的距离', () => {
    // |RP| = |(15,3)-(10,0)| = √34 ≈ 5.83，Math.floor 后为 5
    expect(calculateDistanceFromPointToLine(pt(15, 3), pt(0, 0), pt(10, 0))).toBe(5)
  })

  it('垂足越到起点之外：返回到起点的距离', () => {
    // |QP| = |(-5,3)-(0,0)| = √34 ≈ 5.83，Math.floor 后为 5
    expect(calculateDistanceFromPointToLine(pt(-5, 3), pt(0, 0), pt(10, 0))).toBe(5)
  })
})

describe('isSegmentStartCloserToPoint — 选中点更靠近哪一端', () => {
  it('选中点靠近起点时返回 true', () => {
    expect(isSegmentStartCloserToPoint(pt(0, 0), pt(10, 0), pt(5, 0), pt(1, 3))).toBe(true)
  })

  it('选中点靠近终点时返回 false', () => {
    expect(isSegmentStartCloserToPoint(pt(0, 0), pt(10, 0), pt(5, 0), pt(9, 3))).toBe(false)
  })
})

describe('areLinesCollinear — 两线共线判定', () => {
  it('斜率相同返回 true', () => {
    expect(areLinesCollinear(seg(0, 0, 10, 10), seg(20, 20, 30, 30))).toBe(true)
  })

  it('斜率不同返回 false', () => {
    expect(areLinesCollinear(seg(0, 0, 10, 10), seg(0, 0, 10, 0))).toBe(false)
  })

  it('两条竖直线（斜率为无穷大）返回 true', () => {
    expect(areLinesCollinear(seg(0, 0, 0, 10), seg(5, 0, 5, 10))).toBe(true)
  })

  it('零长线段走 NaN 分支：按起点 x 坐标判定', () => {
    expect(areLinesCollinear(seg(3, 0, 3, 0), seg(3, 5, 3, 5))).toBe(true)
    expect(areLinesCollinear(seg(0, 0, 0, 0), seg(5, 0, 5, 0))).toBe(false)
  })
})

describe('darkenColor — 颜色变暗并夹到 [0,1]', () => {
  it('各分量乘以因子', () => {
    const c = { r: 1, g: 0.5, b: 0.2 } as unknown as Color
    darkenColor(c, 0.5)
    expect(c).toMatchObject({ r: 0.5, g: 0.25, b: 0.1 })
  })

  it('乘后超界夹到 1', () => {
    const c = { r: 0.9, g: 0.9, b: 0.9 } as unknown as Color
    darkenColor(c, 2)
    expect(c).toMatchObject({ r: 1, g: 1, b: 1 })
  })

  it('负因子夹到 0，且不抛异常', () => {
    const c = { r: 0.5, g: 0.5, b: 0.5 } as unknown as Color
    expect(() => darkenColor(c, -1)).not.toThrow()
    expect(c).toMatchObject({ r: 0, g: 0, b: 0 })
  })

  it('原地修改入参，返回 undefined（调用方按此约定使用）', () => {
    const c = { r: 0.8, g: 0.8, b: 0.8 } as unknown as Color
    expect(darkenColor(c, 0.5)).toBeUndefined()
    expect(c.r).toBe(0.4)
  })
})

describe('copyAttribute — 同步图形属性', () => {
  it('9 个属性全部从目标实体复制到源实体', () => {
    const src = {
      layer: 7,
      trueColor: 'red',
      colorIndex: 3,
      linetype: 'DASH',
      visible: true,
      textStyle: 'Standard',
      lineweight: 50,
      drawOrder: 2,
      linetypeScale: 1.5,
    } as unknown as Ent
    const dst = {} as unknown as Ent

    copyAttribute(dst, src)

    expect(dst).toMatchObject(src)
  })
})

describe('selectLineSegmentFromPolylineByPoint — 点选多段线线段', () => {
  it('命中容差内的线段并返回其端点下标', () => {
    const res = selectLineSegmentFromPolylineByPoint(
      polyline([[0, 0], [100, 0]], false, pt(50, 50)),
      pt(50, 50),
      100,
    )
    expect(res?.startIndex).toBe(0)
    expect(res?.endIndex).toBe(1)
  })

  it('超出容差时不命中', () => {
    // 最近点 (50,50) 到线段 (0,0)-(100,0) 的距离为 50
    const res = selectLineSegmentFromPolylineByPoint(
      polyline([[0, 0], [100, 0]], false, pt(50, 50)),
      pt(50, 50),
      10,
    )
    expect(res).toBeUndefined()
  })

  it('闭合多段线命中收口边时返回 isClosed 与环绕下标', () => {
    // A(0,0)→B(100,0)→C(100,100)，收口边 C→A
    // (50,50) 正好在收口边上，到另两条边都是 50
    const res = selectLineSegmentFromPolylineByPoint(
      polyline([[0, 0], [100, 0], [100, 100]], true, pt(50, 50)),
      pt(50, 50),
      10,
    )
    expect(res).toMatchObject({ startIndex: 2, endIndex: 0, isClosed: true })
  })
})
