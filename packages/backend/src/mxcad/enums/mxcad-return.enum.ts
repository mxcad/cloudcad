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

export enum MxUploadReturn {
  kOk = 'ok', // 成功
  kErrorParam = 'errorparam', // 参数错误
  kChunkAlreadyExist = 'chunkAlreadyExist', // 分片已存在
  kChunkNoExist = 'chunkNoExist', // 分片不存在
  kFileAlreadyExist = 'fileAlreadyExist', // 文件已存在
  kFileNoExist = 'fileNoExist', // 文件不存在
  kConvertFileError = 'convertFileError', // 文件转换错误
  kQuotaExceeded = 'quotaExceeded', // 存储配额不足
}
