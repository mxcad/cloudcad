import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuthActions } from './useAuthActions';
import { authControllerRegister } from '@/api-sdk';
import { saveAuthState } from '@/lib/authState';
import { triggerProactiveRefresh } from '@/config/clientSetup';

// useAuthActions 的模块依赖全部 mock：本测试只关心 register 对登录态的写入策略，
// 不触发真实 SDK / 存储 / 主动刷新
vi.mock('@/api-sdk', () => ({
  authControllerLogin: vi.fn(),
  authControllerLoginByPhone: vi.fn(),
  authControllerRegister: vi.fn(),
  authControllerRegisterByPhone: vi.fn(),
  authControllerGetProfile: vi.fn(),
  authControllerLogout: vi.fn(),
  authControllerVerifyEmail: vi.fn(),
  authControllerVerifyPhone: vi.fn(),
  adminAuthControllerLogin: vi.fn(),
  authSetupControllerCreateFirstAdmin: vi.fn(),
}));

vi.mock('@/languages', () => ({ t: (key: string) => key }));

vi.mock('@/config/clientSetup', () => ({
  triggerProactiveRefresh: vi.fn(),
  cancelProactiveRefresh: vi.fn(),
  redirectToLogin: vi.fn(),
}));

vi.mock('@/lib/browserStorage', () => ({ writeJson: vi.fn() }));

vi.mock('@/lib/authState', () => ({
  saveAuthState: vi.fn(() => true),
  clearAuthState: vi.fn(),
}));

vi.mock('@/utils/permissionUtils', () => ({
  clearProjectPermissionsCache: vi.fn(),
}));

vi.mock('@/services/mxcadManager/saveDefaults', () => ({
  clearSavePermissionCache: vi.fn(),
}));

vi.mock('@/stores/fileSystemStore', () => ({
  useFileSystemStore: { getState: () => ({ setPersonalSpaceId: vi.fn() }) },
}));

describe('useAuthActions.register（强制邮箱验证回归）', () => {
  const setToken = vi.fn();
  const setUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('需邮箱验证（后端返回 {message,email} 无 token）：不写登录态、透传 email 供跳转 /verify-email', async () => {
    vi.mocked(authControllerRegister).mockResolvedValue({
      data: { message: '验证码已发送到您的邮箱', email: 'a@b.com' },
    } as never);

    const { result } = renderHook(() => useAuthActions({ setToken, setUser }));
    let ret: { message: string; email?: string } | undefined;
    await act(async () => {
      ret = await result.current.register({ username: 'u', password: 'p' });
    });

    // 关键回归：无 token 响应不得写入登录态（旧 bug 无条件 applyAuthData 污染登录态，
    // 且丢掉 email 导致调用方永远不跳 /verify-email，强制邮箱验证被 UI 层绕过）
    expect(saveAuthState).not.toHaveBeenCalled();
    expect(setToken).not.toHaveBeenCalled();
    expect(setUser).not.toHaveBeenCalled();
    expect(triggerProactiveRefresh).not.toHaveBeenCalled();
    // 透传 email + 后端 message，调用方据此 navigate('/verify-email')
    expect(ret).toEqual({ message: '验证码已发送到您的邮箱', email: 'a@b.com' });
  });

  it('直接注册成功（后端返回 accessToken）：写入登录态', async () => {
    vi.mocked(authControllerRegister).mockResolvedValue({
      data: {
        accessToken: 'AT',
        refreshToken: 'RT',
        user: { id: '1', username: 'u' },
      },
    } as never);

    const { result } = renderHook(() => useAuthActions({ setToken, setUser }));
    let ret: { message: string; email?: string } | undefined;
    await act(async () => {
      ret = await result.current.register({ username: 'u', password: 'p' });
    });

    expect(saveAuthState).toHaveBeenCalledWith({
      accessToken: 'AT',
      refreshToken: 'RT',
      user: { id: '1', username: 'u' },
    });
    expect(setToken).toHaveBeenCalledWith('AT');
    expect(triggerProactiveRefresh).toHaveBeenCalled();
    expect(ret).toEqual({ message: '注册成功' });
  });
});
