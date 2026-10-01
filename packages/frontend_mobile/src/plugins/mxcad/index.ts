import { currentLayerNameHistoryState } from "@/command/layer/currentLayerNameHistoryState";
import { McObject } from "mxcad";
import { getParamsFromUrl } from "@/utils/paramsFromUrl";
import { MxFun } from "mxdraw";
import { registerCommand } from "./command";
import { openMxWeb } from "./openMxWeb";
import { t } from "@/languages";

/**
 * 引擎单例守卫（对齐 PC MxCADInstanceManager）。
 *
 * McObject 引擎只支持单实例：重复 new + create 会拉起第二份 WASM 引擎、
 * 重复加载 wasm 与 shx 字体（控制台里 MxCAD TryVersion / replace [*.shx]
 * 成对出现即此症状）。模块级引用 + window 级引用双保险：
 *  - 模块级 mxcadSingleton：同一模块实例内 createMxCAD 多次调用只初始化一次；
 *  - window.__MxCAD_MOBILE__：模块重评估（HMR / 模块图变化）后模块级引用归零
 *    但引擎仍在，从 window 恢复引用，避免重复 create 命中引擎内部守卫返回损坏实例
 *    （PC 用 window.__MxCADView__ 做同样的事）。
 */
declare global {
  interface Window {
    __MxCAD_MOBILE__?: McObject;
  }
}

let mxcadSingleton: McObject | null = null;
let mxcadInitPromise: Promise<McObject> | null = null;

/**
 * 创建/获取 MxCad 引擎（幂等）。
 * 首次调用真正 new McObject + create；之后（含并发调用、组件重挂载、
 * 模块重评估）一律返回同一实例，不再重复初始化。
 */
export const createMxCAD = (fileUrl?: string): Promise<McObject> => {
  if (mxcadSingleton) return Promise.resolve(mxcadSingleton);
  if (window.__MxCAD_MOBILE__) {
    mxcadSingleton = window.__MxCAD_MOBILE__;
    return Promise.resolve(mxcadSingleton);
  }
  if (mxcadInitPromise) return mxcadInitPromise;
  mxcadInitPromise = doCreateMxCAD(fileUrl)
    .then((mxcad) => {
      mxcadSingleton = mxcad;
      window.__MxCAD_MOBILE__ = mxcad;
      return mxcad;
    })
    .catch((e) => {
      // 初始化失败复位，允许后续重试（成功路径 mxcadSingleton 已置位，不会走到这）
      mxcadInitPromise = null;
      throw e;
    });
  return mxcadInitPromise;
};

/** 真正执行 new McObject + create 的初始化体（只会被调用一次） */
async function doCreateMxCAD(fileUrl?: string): Promise<McObject> {
  const mxcad = new McObject();

  let {
    file,
    mode,
  } = getParamsFromUrl();

  // 如果传入了 fileUrl，优先使用（分享链接/外部指定文件时走这里，像 PC 端 MxCADView 初始化传 openFile 一样）
  if (fileUrl) {
    file = fileUrl
  } else {
    const urlParams = new URLSearchParams(window.location.search);
    // shareToken 也算「有特定文件」：分享链接的 fileId 在 path 不在 query，若此处
    // 开 empty.mxweb，引擎初始化即发起一次 open，随后 openMxWeb 再开分享文件会撞上
    // 引擎「同一时刻只能打开一个文档」限制（assert(0), cannot start a new open）。
    // 分享流须建空引擎，由 openMxWeb 独占首次打开（对齐 PC 打开串行队列的约束）。
    const hasSpecificFile = urlParams.has('fileId') || urlParams.has('nodeId') || urlParams.has('hash') || urlParams.has('fileHash') || urlParams.has('shareToken');

    if (!file && !hasSpecificFile) {
      file = new URL("../../../public/empty.mxweb", import.meta.url).href;
    }
  }

  if (
    (mode !== "2d" && mode !== "2d-st" && mode !== "st") ||
    typeof mode === "undefined"
  ) {
    mode = "SharedArrayBuffer" in window ? "2d" : "2d-st";
  }
  if (mode === "st") {
    mode = "2d-st";
  }

  mxcad.on("init", () => {
    // http://192.168.101.102:5173/?sup_mul_touch=true
    let sup_mul_touch = MxFun.getQueryString("sup_mul_touch");
    if(sup_mul_touch == "true"){
      MxFun.setIniset({MobileCommandOperationSupportsMultipoint:true});
    }
  });

  const initReady = new Promise<void>((resolve) => {
    mxcad.on("init_mxcad", () => {
      // ‍  不显示坐标图标.
      // ‍ Do not display coordinate icons

      mxcad.setAttribute({ ShowCoordinate: false });
      resolve();
    });
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

    ...(file ? { fileUrl: file } : {}),
    // ‍  提供加载字体的目录路径
    // ‍ Provide the directory path for loading fonts

    fontspath: new URL("../../../public/fonts", import.meta.url).href,
    middlePan: true,
    enableUndo: true,
  });

  await initReady;

  // src/command/** 在 main.ts 模块求值期就调用了 addCommand，那一刻
  // store.state.MxFun 还是 null（MxFun 由 mxdraw 的 mxfun() 异步加载），
  // 所以全部命令都被排进了队列。init_mxcad 之后引擎可用，这里才真正注册；
  // 不排空的话 src/command/** 下的命令全是静默 no-op。
  registerCommand();

  mxcad.on("openFileComplete", () => {
    currentLayerNameHistoryState.value = [];
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
      throw new Error(t('文件路径不存在'));
    }
    const url = buildMxwebUrl(nodeInfo.path);
    return await openMxWeb(url);
  } catch (e) {
    console.error('openFileByNodeId failed:', e);
    return false;
  }
}
