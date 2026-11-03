import { defineStore } from 'pinia';
import { reactive } from 'vue';

/**
 * 分享图片「指定区域」跨页意图（分享管理子页 ⇄ 底层编辑器）。
 *
 * 移动端分享管理（ShareManagePage）是覆盖在底层 CAD 编辑器之上的子页，画布被
 * subpage-overlay 全屏遮挡。用户点「指定区域」时需要收起子页让画布露出、在底层
 * 引擎上框选，框选完成后再回到分享管理弹预览。这中间 ShareManagePage 会卸载
 * （ref 丢失），故用本 store 传递意图与结果：
 *
 *   status 流转：pending-open（子页已收起，编辑器待打开文件并框选）
 *              → picking（编辑器正在打开/框选）
 *              → done（region + 海报 dataUrl 就绪，分享管理消费后 clear）
 *              → error（失败，分享管理消费错误文案后 clear）
 *
 * 取消框选（pickThumbnailRegion 返回 null）→ finish(null, '')，分享管理据此提示
 * 「已取消指定区域」。
 */
export interface PosterRegionPoint {
  x: number;
  y: number;
}

export interface PosterRegion {
  minPt: PosterRegionPoint;
  maxPt: PosterRegionPoint;
}

/** ShareItem 的最小必要子集（框选完成后回分享管理恢复 activeShare 以支持下载）。 */
export interface PosterRegionShareItem {
  token: string;
  fileId: string;
  name: string;
  url: string;
  [key: string]: unknown;
}

export type PosterRegionStatus = 'idle' | 'pending-open' | 'picking' | 'done' | 'error';

interface PosterRegionState {
  status: PosterRegionStatus;
  nodeId: string;
  item: PosterRegionShareItem | null;
  region: PosterRegion | null;
  posterDataUrl: string;
  /** 指定区域出的高清图纸图 Blob：预览面板调海报选项（名称/二维码/文字大小）时用它重合成，不重新引擎截图 */
  posterBlob: Blob | null;
  /** 框选区域是否与图纸直角方形边框重合（决定海报是否省略圆角描边，选项重合成时保持一致） */
  posterHasBorder: boolean;
  error: string;
}

const defaultState = (): PosterRegionState => ({
  status: 'idle',
  nodeId: '',
  item: null,
  region: null,
  posterDataUrl: '',
  posterBlob: null,
  posterHasBorder: false,
  error: '',
});

export const usePosterRegionStore = defineStore('posterRegion', () => {
  const state = reactive<PosterRegionState>(defaultState());

  /** 分享管理发起「指定区域」：写意图并让编辑器接管（子页随后收起）。 */
  function request(nodeId: string, item: PosterRegionShareItem) {
    state.nodeId = nodeId;
    state.item = item;
    state.region = null;
    state.posterDataUrl = '';
    state.error = '';
    state.status = 'pending-open';
  }

  function setStatus(status: PosterRegionStatus) {
    state.status = status;
  }

  /** 框选完成（region 为 null 表示用户取消；posterDataUrl 为空表示无海报可展示）。 */
  function finish(
    region: PosterRegion | null,
    posterDataUrl: string,
    posterBlob: Blob | null = null,
    posterHasBorder = false
  ) {
    state.region = region;
    state.posterDataUrl = posterDataUrl;
    state.posterBlob = posterBlob;
    state.posterHasBorder = posterHasBorder;
    state.status = 'done';
  }

  function setError(message: string) {
    state.error = message;
    state.status = 'error';
  }

  /** 分享管理消费完结果后清除，避免下次进入误读旧意图。 */
  function clear() {
    Object.assign(state, defaultState());
  }

  return { state, request, setStatus, finish, setError, clear };
});
