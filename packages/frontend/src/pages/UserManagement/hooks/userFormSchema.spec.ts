import { userFormSchema } from './userFormSchema';

describe('userFormSchema', () => {
  describe('username', () => {
    it('rejects empty username', () => {
      const result = userFormSchema({ mailEnabled: false, isEditing: false }).safeParse({
        username: '',
        email: '',
        password: 'pass123',
        roleId: '',
        nickname: '',
        status: 'ACTIVE',
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('用户名不能为空');
    });

    it('rejects username shorter than 3 characters', () => {
      const result = userFormSchema({ mailEnabled: false, isEditing: false }).safeParse({
        username: 'ab',
        email: '',
        password: 'pass123',
        roleId: '',
        nickname: '',
        status: 'ACTIVE',
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('用户名至少3个字符');
    });

    it('rejects username longer than 20 characters', () => {
      const result = userFormSchema({ mailEnabled: false, isEditing: false }).safeParse({
        username: 'a'.repeat(21),
        email: '',
        password: 'pass123',
        roleId: '',
        nickname: '',
        status: 'ACTIVE',
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('用户名最多20个字符');
    });

    it('accepts valid username', () => {
      const result = userFormSchema({ mailEnabled: false, isEditing: false }).safeParse({
        username: 'alice',
        email: '',
        password: 'pass123',
        roleId: '',
        nickname: '',
        status: 'ACTIVE',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('email', () => {
    it('requires email when mailEnabled', () => {
      const result = userFormSchema({ mailEnabled: true, isEditing: false }).safeParse({
        username: 'alice',
        email: '',
        password: 'pass123',
        roleId: '',
        nickname: '',
        status: 'ACTIVE',
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('邮箱不能为空');
    });

    it('allows empty email when mailEnabled is false', () => {
      const result = userFormSchema({ mailEnabled: false, isEditing: false }).safeParse({
        username: 'alice',
        email: '',
        password: 'pass123',
        roleId: '',
        nickname: '',
        status: 'ACTIVE',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email format', () => {
      const result = userFormSchema({ mailEnabled: true, isEditing: false }).safeParse({
        username: 'alice',
        email: 'not-an-email',
        password: 'pass123',
        roleId: '',
        nickname: '',
        status: 'ACTIVE',
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('邮箱格式不正确');
    });
  });

  describe('password', () => {
    it('requires password when creating', () => {
      const result = userFormSchema({ mailEnabled: false, isEditing: false }).safeParse({
        username: 'alice',
        email: '',
        password: '',
        roleId: '',
        nickname: '',
        status: 'ACTIVE',
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('密码不能为空');
    });

    it('allows empty password when editing', () => {
      const result = userFormSchema({ mailEnabled: false, isEditing: true }).safeParse({
        username: 'alice',
        email: '',
        password: '',
        roleId: '',
        nickname: '',
        status: 'ACTIVE',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('full valid form', () => {
    it('accepts complete valid data for creation', () => {
      const result = userFormSchema({ mailEnabled: true, isEditing: false }).safeParse({
        username: 'alice',
        email: 'alice@example.com',
        password: 'securePass1',
        roleId: 'role1',
        nickname: 'Alice',
        status: 'ACTIVE',
      });
      expect(result.success).toBe(true);
    });

    it('accepts complete valid data for editing without password', () => {
      const result = userFormSchema({ mailEnabled: true, isEditing: true }).safeParse({
        username: 'alice',
        email: 'alice@example.com',
        password: '',
        roleId: 'role1',
        nickname: 'Alice',
        status: 'ACTIVE',
      });
      expect(result.success).toBe(true);
    });
  });
});
