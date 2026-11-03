///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';
import { I18nContext } from 'nestjs-i18n';

/**
 * 名称合法性校验（项目名 / 节点名共用）。
 *
 * 与前端 `@cloudcad/platform` 的 `checkFileName` 规则一致（去重逻辑收敛在
 * platform 供前端，后端因包范围无法引入，此处维护同一规则）：
 * 非法字符 `< > : " / \ | ? *`、控制字符、Windows 保留名（CON/PRN/AUX/NUL/COM1-9/LPT1-9）、
 * 首尾点。长度由各 DTO 的 `@Length` 负责，这里只做字符集与保留名判定。
 *
 * 错误文案按原因码映射 i18n（与 `FileUtils.validateFilename` 一致）。
 */
@ValidatorConstraint({ name: 'isSafeName', async: false })
export class IsSafeNameConstraint implements ValidatorConstraintInterface {
  private static readonly ILLEGAL_CHARS = /[<>:"/\\|?*]/;
  // eslint-disable-next-line no-control-regex
  private static readonly CONTROL_CHARS = /[\x00-\x1F\x7F]/u;
  private static readonly RESERVED_NAMES =
    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (IsSafeNameConstraint.ILLEGAL_CHARS.test(trimmed)) return false;
    if (IsSafeNameConstraint.CONTROL_CHARS.test(trimmed)) return false;
    if (IsSafeNameConstraint.RESERVED_NAMES.test(trimmed)) return false;
    if (trimmed.startsWith('.') || trimmed.endsWith('.')) return false;
    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const value = typeof args.value === 'string' ? args.value.trim() : '';
    if (IsSafeNameConstraint.RESERVED_NAMES.test(value)) {
      return (
        I18nContext.current()?.t('error.file.name_windows_reserved') ??
        'Windows 保留文件名'
      );
    }
    if (value.startsWith('.') || value.endsWith('.')) {
      return (
        I18nContext.current()?.t('error.file_extra.filename_starts_with_dot') ??
        '文件名不能以点开头'
      );
    }
    return (
      I18nContext.current()?.t('error.file.name_contains_illegal_chars') ??
      '文件名包含非法字符'
    );
  }
}

/**
 * 名称合法性校验装饰器（项目名 / 节点名共用）。
 */
export function IsSafeName(options?: object) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: options,
      constraints: [],
      validator: IsSafeNameConstraint,
    });
  };
}
