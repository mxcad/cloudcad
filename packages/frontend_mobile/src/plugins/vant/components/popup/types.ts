export enum UploadState {
  success,
  fail,
  uploading,
  notSelected
}
export interface UploadFileInfo {
  name: string
  uploadState: UploadState
  progress: number
  hash: string
  source?: File
  type: "img" | "ref"
}