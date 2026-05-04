///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

export interface UploadChunkOptions {
  hash: string;
  name: string;
  size: number;
  chunk: number;
  chunks: number;
  context: import('../node/filesystem-node.service').FileSystemNodeContext;
}

export interface MergeOptions {
  hash: string;
  name: string;
  size: number;
  chunks: number;
  context: import('../node/filesystem-node.service').FileSystemNodeContext;
  srcDwgNodeId?: string;
}

export interface MergeResult {
  ret: string;
  tz?: boolean;
  nodeId?: string;
}

export interface UploadFileOptions {
  filePath: string;
  hash: string;
  name: string;
  size: number;
  context: import('../node/filesystem-node.service').FileSystemNodeContext;
}
