import { ValidationArguments, ValidatorConstraintInterface } from 'class-validator';
/**
 * 字段匹配验证器 - 验证两个字段是否相等
 */
export declare class IsMatchConstraint implements ValidatorConstraintInterface {
    validate(value: unknown, args: ValidationArguments): boolean;
    defaultMessage(args: ValidationArguments): string;
}
/**
 * 字段匹配验证装饰器
 * @param property 要匹配的属性名
 * @param validationOptions 验证选项
 */
export declare function IsMatch(property: string, validationOptions?: object): (object: object, propertyName: string) => void;
/**
 * 密码验证装饰器 - 统一密码策略
 * 要求: 8-50位
 */
export declare function IsStrongPassword(): <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
/**
 * 用户名验证装饰器
 */
export declare function IsUsername(): <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
/**
 * 邮箱验证装饰器
 */
export declare function IsEmailField(): <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
/**
 * 昵称验证装饰器
 */
export declare function IsNickname(): <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
//# sourceMappingURL=validation.decorator.d.ts.map