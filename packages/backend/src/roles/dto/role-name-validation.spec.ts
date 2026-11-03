import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateRoleDto } from './create-role.dto';
import { CreateProjectRoleDto } from './create-project-role.dto';

/**
 * BUG-ADMIN-003 回归：角色名称不能全为空白字符。
 * 此前仅 @IsNotEmpty() 会放过纯空白名（' ' 非空字符串），
 * 导致前端（!name 同样放过空格）+ 后端都创建出空白名角色。
 * 修复 = 前端 trim 校验 + 后端 @Matches(/\S/) 兜底。
 */
describe('角色名称校验（BUG-ADMIN-003）', () => {
  it('CreateRoleDto：纯空白名被拒绝', async () => {
    const dto = plainToInstance(CreateRoleDto, { name: '   ' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('CreateRoleDto：正常名通过', async () => {
    const dto = plainToInstance(CreateRoleDto, { name: '设计主管' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(false);
  });

  it('CreateProjectRoleDto：纯空白名被拒绝', async () => {
    const dto = plainToInstance(CreateProjectRoleDto, { name: '   ' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });
});
