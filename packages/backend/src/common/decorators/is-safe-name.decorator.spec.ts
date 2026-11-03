///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { validate } from 'class-validator';
import { CreateProjectDto } from '../../file-system/dto/create-project.dto';
import { UpdateNodeDto } from '../../file-system/dto/update-node.dto';

/** 用 class-validator 跑 DTO 全部装饰器，返回校验错误 */
async function validateDto(dto: object): Promise<string[]> {
  const errors = await validate(dto);
  const names: string[] = [];
  for (const err of errors) {
    if (err.property === 'name') {
      names.push(...Object.keys(err.constraints ?? {}));
    }
  }
  return names;
}

describe('IsSafeName 项目/节点名称非法字符校验', () => {
  it.each([
    ['正常中文名', '测试项目'],
    ['正常带空格', '我的 项目 v2'],
    ['正常带点（非首尾）', '项目.ver'],
    ['正常字母数字下划线', 'Project_2026'],
    ['正常带括号', '项目（一）'],
  ])('%s 通过: %s', async (_label, name) => {
    const dto = new CreateProjectDto();
    dto.name = name;
    dto.description = '';
    expect(await validateDto(dto)).not.toContain('isSafeName');
  });

  it.each([
    ['尖括号', '<项目>'],
    ['冒号', '项目:测试'],
    ['斜杠', '项目/测试'],
    ['反斜杠', '项目\\测试'],
    ['竖线', '项目|测试'],
    ['问号', '项目?测试'],
    ['星号', '项目*测试'],
    ['双引号', '项目"测试'],
  ])('拒绝非法字符 %s: %s', async (_label, name) => {
    const dto = new CreateProjectDto();
    dto.name = name;
    dto.description = '';
    expect(await validateDto(dto)).toContain('isSafeName');
  });

  it('拒绝控制字符', async () => {
    const dto = new CreateProjectDto();
    dto.name = '项目\u0000测试';
    dto.description = '';
    expect(await validateDto(dto)).toContain('isSafeName');
  });

  it('拒绝 Windows 保留名', async () => {
    const dto = new CreateProjectDto();
    dto.name = 'CON';
    dto.description = '';
    expect(await validateDto(dto)).toContain('isSafeName');
  });

  it('拒绝首尾点', async () => {
    const dto = new CreateProjectDto();
    dto.name = '.hidden';
    dto.description = '';
    expect(await validateDto(dto)).toContain('isSafeName');
  });

  it('UpdateNodeDto 同样拒绝非法字符（项目重命名/节点重命名共用）', async () => {
    const dto = new UpdateNodeDto();
    dto.name = '重命名<>非法';
    expect(await validateDto(dto)).toContain('isSafeName');
  });
});
