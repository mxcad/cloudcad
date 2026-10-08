///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 协同详细日志卡片单测：@/api-sdk / 通知 / 复制 hook 全部 mock，
 * 聚焦装配与交互接线（加载态、探测降级、开关保存、错误重试、只读、复制）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  showToast: vi.fn(),
  copy: vi.fn(),
}));

vi.mock('@/api-sdk', () => ({
  adminControllerGetMxcadEngineConfig: mocks.get,
  adminControllerUpdateCoordinateLog: mocks.put,
}));
vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => ({ showToast: mocks.showToast }),
}));
vi.mock('@/hooks/useCopy', () => ({
  useCopy: () => ({ copiedMarker: null, copy: mocks.copy }),
}));

import { CoordinateLogCard } from '../CoordinateLogCard';

const ok = (data: unknown) => ({ data, error: undefined });

function checkbox(): HTMLInputElement {
  const el = document.querySelector(
    '[data-testid="rc-coordinate-log-switch"] input[type="checkbox"]'
  );
  expect(el, '未找到开关 checkbox').toBeTruthy();
  return el as HTMLInputElement;
}

describe('CoordinateLogCard', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.put.mockReset();
    mocks.showToast.mockReset();
    mocks.copy.mockReset();
    mocks.get.mockResolvedValue(
      ok({
        enabled: true,
        logPath: 'C:/Users/MxDrawHome/AppData/Local/MxWebCAD/',
      })
    );
  });

  it('渲染开关当前值与日志位置（探测成功）', async () => {
    render(<CoordinateLogCard canManage />);

    await waitFor(() => expect(checkbox().checked).toBe(true));
    expect(screen.getByText('已开启')).toBeTruthy();
    expect(
      screen.getByDisplayValue('C:/Users/MxDrawHome/AppData/Local/MxWebCAD/')
    ).toBeTruthy();
  });

  it('引擎探测失败：日志位置降级文案 + 复制按钮禁用', async () => {
    mocks.get.mockResolvedValue(ok({ enabled: false, logPath: null }));
    render(<CoordinateLogCard canManage />);

    await waitFor(() => expect(checkbox().checked).toBe(false));
    expect(
      screen.getByPlaceholderText(
        '未能获取日志目录（引擎探测失败），请确认引擎已安装。'
      )
    ).toBeTruthy();
    expect(
      (screen.getByTestId('rc-coordinate-log-copy') as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it('拉取配置失败显示错误与重试，重试重新拉取', async () => {
    mocks.get
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(ok({ enabled: false, logPath: null }));

    render(<CoordinateLogCard canManage />);

    const errorBox = await screen.findByTestId('rc-coordinate-log-error');
    expect(errorBox.textContent).toContain('network down');
    expect(screen.getByText('重试')).toBeTruthy();

    fireEvent.click(screen.getByText('重试'));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  });

  it('切换开关立即保存，成功后同步返回值并 toast', async () => {
    mocks.put.mockResolvedValue(ok({ enabled: false, logPath: null }));
    render(<CoordinateLogCard canManage />);
    await waitFor(() => expect(checkbox().checked).toBe(true));

    fireEvent.click(checkbox());

    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    expect(mocks.put).toHaveBeenCalledWith({ body: { enabled: false } });
    await waitFor(() => expect(screen.getByText('已关闭')).toBeTruthy());
    expect(mocks.showToast).toHaveBeenCalledWith(
      '协同日志开关已保存，需重启协同服务后才会对协同编辑生效。',
      'success'
    );
  });

  it('无写权限时开关禁用并显示只读标记', async () => {
    render(<CoordinateLogCard canManage={false} />);
    await waitFor(() => expect(checkbox().disabled).toBe(true));
    expect(screen.getByText('只读')).toBeTruthy();
  });

  it('点击复制按钮以日志路径为内容、以卡片为 marker 调用唯一复制出口', async () => {
    render(<CoordinateLogCard canManage />);
    await waitFor(() =>
      expect(
        screen.getByDisplayValue('C:/Users/MxDrawHome/AppData/Local/MxWebCAD/')
      ).toBeTruthy()
    );

    fireEvent.click(screen.getByTestId('rc-coordinate-log-copy'));
    expect(mocks.copy).toHaveBeenCalledWith(
      'C:/Users/MxDrawHome/AppData/Local/MxWebCAD/',
      'coordinate-log'
    );
  });
});
