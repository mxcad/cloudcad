import { validate, ValidationArguments } from 'class-validator';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  HasEmailOrPhone,
  HasEmailOrPhoneReset,
} from './password-reset.dto';

/**
 * 回归测试：`@Validate()` 只认 @ValidatorConstraint() 注册的类。
 *
 * 历史上这三处曾把「普通函数 / 装饰器工厂函数」传给 `@Validate()`，
 * class-validator 的 `getTargetValidatorConstraints` 查不到元数据，
 * 校验被**静默跳过且不报错**，导致：
 * - `confirmPassword` 与 `newPassword` 不匹配仍返回 200 并真的改密码；
 * - 不传 email/phone 时穿透到业务层 `401 用户不存在`（应为 400）。
 * 本文件锁死这三条校验必须真实生效。
 */
describe('ResetPasswordDto 校验器有效性', () => {
  const valid = (overrides: Partial<ResetPasswordDto> = {}): ResetPasswordDto => {
    const dto = new ResetPasswordDto();
    Object.assign(dto, {
      email: 'user@example.com',
      code: '123456',
      newPassword: 'W1fNew!2026',
      confirmPassword: 'W1fNew!2026',
      validateContact: '',
      ...overrides,
    });
    return dto;
  };

  it('合法 payload 应通过校验', async () => {
    const errors = await validate(valid());
    expect(errors).toHaveLength(0);
  });

  it('confirmPassword 与 newPassword 不匹配必须被拒绝（P0 回归）', async () => {
    const errors = await validate(
      valid({ newPassword: 'W1fNew!2026', confirmPassword: 'Different!99' })
    );
    const props = errors.map((e) => e.property);
    expect(props).toContain('confirmPassword');
  });

  it('缺失 confirmPassword 必须被拒绝', async () => {
    const errors = await validate(valid({ confirmPassword: undefined as never }));
    expect(errors.map((e) => e.property)).toContain('confirmPassword');
  });

  it('email 与 phone 都不传时 validateContact 必须被拒绝（回归：曾穿透到 401）', async () => {
    const dto = new ResetPasswordDto();
    Object.assign(dto, {
      code: '123456',
      newPassword: 'W1fNew!2026',
      confirmPassword: 'W1fNew!2026',
      validateContact: '',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('validateContact');
  });

  it('仅传 phone 时应通过 email/phone 二选一校验', async () => {
    const errors = await validate(
      valid({ email: undefined as never, phone: '13800138000' })
    );
    expect(errors.map((e) => e.property)).not.toContain('validateContact');
  });
});

describe('ForgotPasswordDto 校验器有效性', () => {
  it('email 与 phone 都不传时 validateContact 必须被拒绝', async () => {
    const dto = new ForgotPasswordDto();
    Object.assign(dto, { validateContact: '' });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('validateContact');
  });

  it('传 email 时应通过', async () => {
    const dto = new ForgotPasswordDto();
    Object.assign(dto, { email: 'user@example.com', validateContact: '' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

describe('HasEmailOrPhone / HasEmailOrPhoneReset 约束类自身', () => {
  // validate() 只读 args.object，其余字段本测试不使用，补齐以满足 ValidationArguments 类型
  const argsOf = (object: Record<string, unknown>): ValidationArguments =>
    ({ object, value: undefined, constraints: [], targetName: 'x', property: 'x' } as ValidationArguments);

  it('两个约束类的 validate 都真实按 email||phone 判定', () => {
    expect(new HasEmailOrPhone().validate(undefined, argsOf({}))).toBe(false);
    expect(new HasEmailOrPhoneReset().validate(undefined, argsOf({}))).toBe(false);
    expect(
      new HasEmailOrPhone().validate(undefined, argsOf({ email: 'a@b.com' }))
    ).toBe(true);
    expect(
      new HasEmailOrPhoneReset().validate(
        undefined,
        argsOf({ phone: '13800138000' })
      )
    ).toBe(true);
  });
});
