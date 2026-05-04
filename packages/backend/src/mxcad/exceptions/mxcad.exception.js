///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
import { HttpException, HttpStatus } from '@nestjs/common';
/**
 * MxCAD 异常基类
 * 用于 MxCAD 相关接口的统一错误处理
 */
export class MxCadException extends HttpException {
    constructor(ret, message, status = HttpStatus.OK) {
        super({ ret, message }, status);
        this.ret = ret;
    }
}
/**
 * MxCAD 参数错误异常
 */
export class MxCadParamException extends MxCadException {
    constructor(message = '参数错误') {
        super('errorparam', message);
    }
}
/**
 * MxCAD 转换错误异常
 */
export class MxCadConvertException extends MxCadException {
    constructor(message = '文件转换失败') {
        super('convertFileError', message);
    }
}
/**
 * MxCAD 文件已存在异常
 */
export class MxCadFileExistsException extends MxCadException {
    constructor(message = '文件已存在') {
        super('fileAlreadyExist', message);
    }
}
/**
 * MxCAD 分片已存在异常
 */
export class MxCadChunkExistsException extends MxCadException {
    constructor(message = '分片已存在') {
        super('chunkAlreadyExist', message);
    }
}
/**
 * MxCAD 权限错误异常
 */
export class MxCadPermissionException extends MxCadException {
    constructor(message = '权限不足') {
        super('errorparam', message, HttpStatus.FORBIDDEN);
    }
}
/**
 * MxCAD 认证错误异常
 */
export class MxCadAuthException extends MxCadException {
    constructor(message = '用户未认证') {
        super('errorparam', message, HttpStatus.UNAUTHORIZED);
    }
}
//# sourceMappingURL=mxcad.exception.js.map