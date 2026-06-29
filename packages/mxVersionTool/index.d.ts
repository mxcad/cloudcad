export type MxCallback = (error: Error | null, result?: string) => void;

export function mxCheckout(
  repoUrl: string,
  targetDir: string,
  username: string | null,
  password: string | null,
  callback: MxCallback
): void;

export function mxAdd(
  targetPaths: string[],
  isRecursive: boolean,
  noIgnore: boolean,
  parents: boolean,
  callback: MxCallback
): void;

export function mxCommit(
  targetPaths: string[],
  message: string,
  isRecursive: boolean,
  username: string | null,
  password: string | null,
  callback: MxCallback
): void;

export function mxDelete(
  targetPaths: string[],
  isRecursive: boolean,
  keepLocal: boolean,
  username: string | null,
  password: string | null,
  callback: MxCallback
): void;

export function mxList(
  repoUrl: string,
  isRecursive: boolean,
  revision: number | null,
  username: string | null,
  password: string | null,
  callback: MxCallback
): void;

export function mxadminCreate(
  repoPath: string,
  callback: MxCallback
): void;

export function mxImport(
  importPath: string,
  repoUrl: string,
  message: string,
  callback: MxCallback
): void;

export function mxLog(
  targetPath: string,
  limit: number | null,
  verbose: boolean,
  username: string | null,
  password: string | null,
  callback: MxCallback
): void;

export function mxCat(
  filePath: string,
  revision: number | null,
  username: string | null,
  password: string | null,
  callback: MxCallback
): void;

export interface MxCheckResult {
  available: boolean;
  version: string | null;
  message: string;
}

export interface PlatformInfo {
  platform: string;
  isWindows: boolean;
  mxPath: string;
  mxadminPath: string;
}

export type MxCheckCallback = (error: Error | null, result?: MxCheckResult) => void;

export function checkMxAvailable(callback: MxCheckCallback): void;

export function checkMxAvailableSync(): MxCheckResult;

export function getPlatformInfo(): PlatformInfo;

export function mxPropset(
  targetPath: string,
  propertyName: string,
  propertyValue: string,
  callback: MxCallback
): void;

export function mxUpdate(
  targetPath: string,
  username: string | null,
  password: string | null,
  callback: MxCallback
): void;

export function mxCleanup(
  targetPath: string,
  callback: MxCallback
): void;

export function mxSwitch(
  oldUrl: string,
  newUrl: string,
  targetPath: string,
  username: string | null,
  password: string | null,
  callback: MxCallback
): void;