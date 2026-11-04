import { watch } from 'vue';
import { useRouter } from 'vue-router';
import { t } from '@/languages';
import { usePosterRegionStore } from '@/stores/posterRegion';
import { useEditorStore } from '@/stores/editor';
import { openDrawing } from '@/services/drawingOpener';
import {
  generateThumbnail,
  generatePosterImageBlob,
  pickThumbnailRegion,
  uploadThumbnailBlobForNode,
  detectRegionBorder,
  restoreCanvasSize,
} from '@/services/thumbnailService';
import { composeSharePosterDataUrl } from '@/utils/sharePoster';

/**
 * 分享图片「指定区域」的底层执行流（由常驻 Home 编辑器调用一次）。
 *
 * 分享管理子页（ShareManagePage）点「指定区域」→ 收起子页 → 本 flow 检测到
 * pending-open → 打开目标文件 → 移动端两点对角框选（pickThumbnailRegion，非
 * getCorner）→ 用区域出缩略图并上传 → 合成海报 → 回 /shell/share，分享管理
 * 消费结果弹预览。
 *
 * 安全约束与后台渲染一致（防静默替换引擎文档造成数据丢失）：编辑器有未保存
 * 改动/正在协同时拒绝，不发起 openDrawing（打开会丢弃当前图纸内容）。
 */
export function usePosterRegionFlow() {
  const router = useRouter();
  const store = usePosterRegionStore();

  watch(
    () => store.state.status,
    async (status) => {
      if (status !== 'pending-open') return;
      const { nodeId, item } = store.state;
      store.setStatus('picking');
      try {
        const { state } = useEditorStore();
        if (state.isModified) {
          throw new Error(t('当前图纸有未保存的修改，请先保存后再生成分享图片'));
        }
        if (state.isInCollaboration) {
          throw new Error(t('协同编辑进行中，暂不能生成分享图片'));
        }

        // 目标文件已是当前打开图纸：不再后台开图（后台开图触发 fetchFileNode
        // 登录/权限校验，且会静默重载当前文档）。仅当文件未打开时才 openDrawing。
        if (state.fileId !== nodeId) {
          const opened = await openDrawing({ source: 'node', nodeId });
          if (!opened) throw new Error(t('打开图纸失败，无法生成分享图片'));
        }

        const region = await pickThumbnailRegion();
        if (!region) {
          // 用户取消框选：回分享管理，消费侧提示「已取消指定区域」
          store.finish(null, '');
          await router.replace('/shell/share');
          return;
        }

        // 边框检测必须在「框选结束瞬间」执行并缓存（viewCoordLong2Cad 读当前实时视图
        // 缩放，generateThumbnail/generatePosterImageBlob 会 zoomW 到区域改变缩放，
        // 之后 6px 换算的 CAD 长度就失真）：共线容差 = max(6px 换算, 区域长边 3%)，
        // 以框选时视图为准；hasBorder 在此算好，下方出图一律复用，不再重算。
        const hasBorder = await detectRegionBorder(region);

        // 缩略图上传保持 200px（文件列表/后台渲染用，best-effort 不阻塞海报）
        const thumbBlob = await generateThumbnail(region);
        if (thumbBlob) await uploadThumbnailBlobForNode(nodeId, thumbBlob);

        // 海报图纸图用引擎高分辨率 BMP（用户参考 Mx_ScreenToBmp：清晰度远高于 200px 缩略图）
        const posterBlob = await generatePosterImageBlob(region);
        if (!posterBlob) throw new Error(t('缩略图生成失败，请重试'));

        // 显式还原画布尺寸：跨页流程随后 router.replace 收起编辑器，renderFullDrawing
        // 回调里延迟（50ms+rAF）的 updateCanvasSize 会与路由切换抢跑，画布可能停留在
        // 1000px 截图尺寸（移动端无 ResizeObserver/visibilitychange 在重新露出时补
        // resize）。此刻画布仍可见，在路由切换前显式还原到视口尺寸（对齐 PC 同页流程）。
        await restoreCanvasSize();

        const posterDataUrl = await composeSharePosterDataUrl({
          shareUrl: item?.url ?? '',
          fileName: item?.name ?? '',
          thumbnail: posterBlob,
          scanText: t('扫一扫看图纸'),
          thumbnailHasBorder: hasBorder,
        });
        store.finish(region, posterDataUrl, posterBlob, hasBorder);
        await router.replace('/shell/share');
      } catch (e) {
        console.error('[usePosterRegionFlow] 指定区域失败:', e);
        store.setError(e instanceof Error && e.message ? e.message : t('指定区域失败'));
        await router.replace('/shell/share');
      }
    },
  );

  return { store };
}
