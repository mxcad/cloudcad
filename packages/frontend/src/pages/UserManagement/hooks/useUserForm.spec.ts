import { renderHook, act } from '@testing-library/react';
import { useUserForm } from './useUserForm';
import type { UserResponseDto } from '@/api-sdk';

const mockUser: UserResponseDto = {
  id: '1',
  username: 'alice',
  email: 'alice@example.com',
  phone: '1234567890',
  nickname: 'Alice',
  status: 'ACTIVE',
  role: { id: 'role1', name: 'USER', isSystem: true },
} as UserResponseDto;

describe('useUserForm', () => {
  describe('create mode', () => {
    it('initializes with empty fields', () => {
      const { result } = renderHook(() =>
        useUserForm({ mailEnabled: false, isEditing: false, onSubmit: vi.fn() }),
      );

      expect(result.current.form.getValues('username')).toBe('');
      expect(result.current.form.getValues('email')).toBe('');
      expect(result.current.form.getValues('password')).toBe('');
    });

    it('does not call onSubmit when required fields are empty', async () => {
      const onSubmit = vi.fn();
      const { result } = renderHook(() =>
        useUserForm({ mailEnabled: false, isEditing: false, onSubmit }),
      );

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('calls onSubmit with form data when valid', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useUserForm({ mailEnabled: false, isEditing: false, onSubmit }),
      );

      act(() => {
        result.current.form.setValue('username', 'bob');
        result.current.form.setValue('password', 'pass123');
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(onSubmit).toHaveBeenCalledWith({
        username: 'bob',
        email: '',
        password: 'pass123',
        roleId: '',
        nickname: '',
        status: 'ACTIVE',
      });
    });
  });

  describe('edit mode', () => {
    it('populates form with existing user data', () => {
      const { result } = renderHook(() =>
        useUserForm({ mailEnabled: false, isEditing: true, onSubmit: vi.fn(), editingUser: mockUser }),
      );

      expect(result.current.form.getValues('username')).toBe('alice');
      expect(result.current.form.getValues('email')).toBe('alice@example.com');
      expect(result.current.form.getValues('nickname')).toBe('Alice');
    });

    it('does not require password when editing', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useUserForm({ mailEnabled: false, isEditing: true, onSubmit, editingUser: mockUser }),
      );

      // Password is empty, but edit mode should allow it
      expect(result.current.form.getValues('password')).toBe('');

      await act(async () => {
        await result.current.handleSubmit();
      });

      // Should succeed because password is optional in edit mode
      expect(onSubmit).toHaveBeenCalled();
    });
  });

  describe('mode switching', () => {
    it('resets form when editingUser changes from user to null', () => {
      const { result, rerender } = renderHook(
        ({ editingUser, isEditing }) =>
          useUserForm({ mailEnabled: false, isEditing, onSubmit: vi.fn(), editingUser }),
        {
          initialProps: {
            editingUser: mockUser as UserResponseDto | null,
            isEditing: true,
          },
        },
      );

      expect(result.current.form.getValues('username')).toBe('alice');

      rerender({ editingUser: null, isEditing: false });

      expect(result.current.form.getValues('username')).toBe('');
    });
  });
});
