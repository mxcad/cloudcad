import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAddCommand = vi.fn();

vi.mock('@/plugins/mxcad/command', () => ({
  addCommand: mockAddCommand,
}));

vi.mock('mxcad', () => ({
  McDbLine: vi.fn(),
  McDbCircle: vi.fn(),
  McDbPolyline: vi.fn(),
  McGePoint3d: vi.fn(),
  MxCADUiPrPoint: vi.fn().mockImplementation(() => ({
    clearLastInputPoint: vi.fn(),
    setMessage: vi.fn(),
    setOffsetInputPostion: vi.fn(),
    setInputToucheType: vi.fn(),
    setUserDraw: vi.fn(),
    go: vi.fn().mockResolvedValue(null),
    getStatus: vi.fn().mockReturnValue(0),
    drawReserve: vi.fn(),
  })),
  MxCpp: {
    getCurrentMxCAD: vi.fn().mockReturnValue({ drawEntity: vi.fn() }),
  },
}));

vi.mock('mxdraw', () => ({
  MrxDbgUiPrBaseReturn: { kNone: 0 },
  MxType: { InputToucheType: { kGetEnd: 0 } },
}));

describe('绘制命令 m_mx_line', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('导入时应注册命令', async () => {
    await import('./m_mx_line');
    expect(mockAddCommand).toHaveBeenCalledWith('m_mx_line', expect.any(Function));
  });
});

describe('绘制命令 m_mx_circle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('导入时应注册命令', async () => {
    await import('./m_mx_circle');
    expect(mockAddCommand).toHaveBeenCalledWith('m_mx_circle', expect.any(Function));
  });
});

describe('绘制命令 m_mx_rect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('导入时应注册命令', async () => {
    await import('./m_mx_rect');
    expect(mockAddCommand).toHaveBeenCalledWith('m_mx_rect', expect.any(Function));
  });
});
