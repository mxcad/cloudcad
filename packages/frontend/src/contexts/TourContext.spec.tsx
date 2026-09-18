import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));
vi.mock('@voerkai18n/react', () => ({ useVoerkaI18n: () => ({}) }));
vi.mock('@/languages', () => ({ i18nScope: {} }));
vi.mock('../config/tourGuides', () => ({ getTourGuides: () => [] }));

import { TourProvider, useTour } from './TourContext';
import { markDesktopOrigin } from '../lib/desktopOrigin';

/** 探针组件：暴露首次引导弹框状态 */
const Probe: React.FC = () => {
  const { isStartModalOpen } = useTour();
  return <div data-testid="start-modal-open">{String(isStartModalOpen)}</div>;
};

function renderProvider() {
  return render(
    <MemoryRouter>
      <TourProvider guides={[]}>
        <Probe />
      </TourProvider>
    </MemoryRouter>
  );
}

describe('TourProvider 首次登录引导弹框触发', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('桌面端 EXE 打开的会话首次登录不弹弹框', () => {
    window.history.replaceState(null, '', '/device?user_code=ABCD-1234');
    markDesktopOrigin();
    renderProvider();
    expect(screen.getByTestId('start-modal-open').textContent).toBe('false');
  });

  it('桌面端登录回调入口（/logo?redirect_uri）同样不弹', () => {
    window.history.replaceState(
      null,
      '',
      '/logo?redirect_uri=http://127.0.0.1:8080/callback&state=abc'
    );
    markDesktopOrigin();
    renderProvider();
    expect(screen.getByTestId('start-modal-open').textContent).toBe('false');
  });

  it('普通会话首次登录弹弹框（既有行为不回归）', () => {
    renderProvider();
    expect(screen.getByTestId('start-modal-open').textContent).toBe('true');
  });

  it('普通会话已 dismissed 时不弹（既有行为不回归）', () => {
    localStorage.setItem('cloudcad_tour_dismissed', 'true');
    renderProvider();
    expect(screen.getByTestId('start-modal-open').textContent).toBe('false');
  });
});
