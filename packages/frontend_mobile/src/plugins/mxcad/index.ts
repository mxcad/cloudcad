import { currentLayerNameHistoryState } from "@/command/layer/currentLayerNameHistoryState";
import { McObject, MxCpp } from "mxcad";
import { getParamsFromUrl } from "@/utils/paramsFromUrl";
import { useDwgUpload } from "../WebUploader/useDwgUpload";
import { MxFun } from "mxdraw";
import { openMxWeb } from "./openMxWeb";
/** 创建MxCad APP控件 **/
/**Create MxCad APP Control

 */
export const createMxCAD = async () => {
  const mxcad = new McObject();

  let {
    file = new URL("../../../public/test2.mxweb", import.meta.url).href,
    mode,
  } = getParamsFromUrl();
  if (
    (mode !== "2d" && mode !== "2d-st" && mode !== "st") ||
    typeof mode === "undefined"
  ) {
    mode = "SharedArrayBuffer" in window ? "2d" : "2d-st";
  }
  if (mode === "st") {
    mode === "2d-st";
  }

  mxcad.on("init", () => {
    // http://192.168.101.102:5173/?sup_mul_touch=true
    let sup_mul_touch = MxFun.getQueryString("sup_mul_touch");
    if(sup_mul_touch == "true"){
      MxFun.setIniset({MobileCommandOperationSupportsMultipoint:true});
    }
  });

  mxcad.on("init_mxcad", () => {
    // ‍  不显示坐标图标.
    // ‍ Do not display coordinate icons

    mxcad.setAttribute({ ShowCoordinate: false });
  });
  mxcad.create({
    // ‍  canvascanvas元素的id
    // ‍ The ID of the canvas element

    canvas: "#mxCanvas",
    // ‍  获取加载wasm相关文件(wasm/js/worker.js)路径位置
    // ‍ Retrieve the path location for loading wasm related files (wasm/js/worker. js)

    locateFile: (fileName) =>
      new URL(
        `/node_modules/mxcad/dist/wasm/${mode}/${fileName}`,
        import.meta.url
      ).href,
    // ‍  需要初始化打开的文件url路径
    // ‍ Need to initialize the URL path of the opened file

    fileUrl: file,
    // ‍  提供加载字体的目录路径
    // ‍ Provide the directory path for loading fonts

    fontspath: new URL("../../../public/fonts", import.meta.url).href,
    middlePan: true,
    enableUndo: true,
  });
  mxcad.on("openFileComplete", () => {
    // ‍  清空置为当前图层的历史记录状态
    // ‍ Clear empty space as the historical record status of the current layer

    currentLayerNameHistoryState.value = [];
    useDwgUpload();
  });
  return mxcad;
};

/**
 * Open a file by node ID.
 * Fetches node info, builds the mxweb URL, and opens it in the CAD engine.
 */
export async function openFileByNodeId(nodeId: string): Promise<boolean> {
  try {
    const { getNodeInfo, buildMxwebUrl } = await import('../../services/fileService');
    const nodeInfo = await getNodeInfo(nodeId);
    if (!nodeInfo.path) {
      throw new Error('文件路径不存在');
    }
    const url = buildMxwebUrl(nodeInfo.path);
    return await openMxWeb(url);
  } catch (e) {
    console.error('openFileByNodeId failed:', e);
    return false;
  }
}

export { MxCpp };
