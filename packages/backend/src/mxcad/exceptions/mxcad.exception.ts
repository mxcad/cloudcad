///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * MxCAD 异常基类
 * 用于 MxCAD 相关接口的统一错误处理
 */
export class MxCadException extends HttpException {
  constructor(
    public readonly ret: string,
    message?: string,
    status: HttpStatus = HttpStatus.OK
  ) {
    super({ ret, message }, status);
  }
}

/**
 * MxCAD 参数错误异常
 */
export class MxCadParamException extends MxCadException {
  constructor(message: string = '参数错误') {
    super('errorparam', message);
  }
}

/**
 * MxCAD 转换错误异常
 */
export class MxCadConvertException extends MxCadException {
  constructor(message: string = '文件转换失败') {
    super('convertFileError', message);
  }
}

/**
 * MxCAD 文件已存在异常
 */
export class MxCadFileExistsException extends MxCadException {
  constructor(message: string = '文件已存在') {
    super('fileAlreadyExist', message);
  }
}

/**
 * MxCAD 分片已存在异常
 */
export class MxCadChunkExistsException extends MxCadException {
  constructor(message: string = '分片已存在') {
    super('chunkAlreadyExist', message);
  }
}

/**
 * MxCAD 权限错误异常
 */
export class MxCadPermissionException extends MxCadException {
  constructor(message: string = '权限不足') {
    super('errorparam', message, HttpStatus.FORBIDDEN);
  }
}

/**
 * MxCAD 认证错误异常
 */
export class MxCadAuthException extends MxCadException {
  constructor(message: string = '用户未认证') {
    super('errorparam', message, HttpStatus.UNAUTHORIZED);
  }
}
