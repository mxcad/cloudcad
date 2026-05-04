import { HttpException, HttpStatus } from '@nestjs/common';
/**
 * MxCAD 异常基类
 * 用于 MxCAD 相关接口的统一错误处理
 */
export declare class MxCadException extends HttpException {
    readonly ret: string;
    constructor(ret: string, message?: string, status?: HttpStatus);
}
/**
 * MxCAD 参数错误异常
 */
export declare class MxCadParamException extends MxCadException {
    constructor(message?: string);
}
/**
 * MxCAD 转换错误异常
 */
export declare class MxCadConvertException extends MxCadException {
    constructor(message?: string);
}
/**
 * MxCAD 文件已存在异常
 */
export declare class MxCadFileExistsException extends MxCadException {
    constructor(message?: string);
}
/**
 * MxCAD 分片已存在异常
 */
export declare class MxCadChunkExistsException extends MxCadException {
    constructor(message?: string);
}
/**
 * MxCAD 权限错误异常
 */
export declare class MxCadPermissionException extends MxCadException {
    constructor(message?: string);
}
/**
 * MxCAD 认证错误异常
 */
export declare class MxCadAuthException extends MxCadException {
    constructor(message?: string);
}
//# sourceMappingURL=mxcad.exception.d.ts.map