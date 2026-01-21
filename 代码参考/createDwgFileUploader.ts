///////////////////////////////////////////////////////////////////////////////
//版权所有（C）2002-2022，成都梦想凯德科技有限公司。
//本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
//此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
//https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

// @ts-nocheck
import WebUploader from "webuploader";
import $api from "../axios/index";
import { getMxCADFileExtName, getUploadFileConfig } from "@/config/serverConfig";
import { t } from "@/languages";
import { get } from "http";
import { getRootContainer } from "@/utils/getRootContainer"

export interface UploaderRegisterConfig {
  /** 指定Drag And Drop拖拽的容器，如果不指定，则不启动 */
  dnd?: string
  /** css选择器规范 通常采用id 如 #id, 选择文件的按钮。 内部根据当前运行是创建，可能是input元素，也可能是flash
   *
innerHTML {String} 指定按钮文字。不指定时优先从指定的容器中看是否自带文字。
multiple {Boolean} 是否开起同时选择多个文件能力。
   * . */
  pick?:
  | string
  | {
    /** id {Seletor|dom} 指定选择文件的按钮容器，不指定则不创建按钮。注意 这里虽然写的是 id, 但是不是只支持 id, 还支持 class, 或者 dom 节点。 */
    id?: string;
    /** {String} 请采用 innerHTML 代替 */
    label?: string;
    /** {String} 指定按钮文字。不指定时优先从指定的容器中看是否自带文字。 */
    innerHTML?: string;
    /** 是否开起同时选择多个文件能力。  */
    multiple?: boolean;
  };
  /** 上传失败回调 */
  onError?: (err_str?: any) => void;
  /** 文件接收的后台服务器接口 */
  serverURL?: string;
  /** 文件上传排队时触发函数 */
  onFileQueued?: (file: any) => void | boolean | Promise<any>;

  /** 文件上传进度监听进度触发函数
   * @param percentage 百分比进度
   */
  onProgress?: (percentage: number) => void;
  /** 文件上传前生成hash值的进度触发函数
   * @param percentage 百分比进度
   */
  onCreateHashProgress?: (percentage: number) => void;
  /** 文件开始上传触发回调函数
   * @param percentage 百分比进度
   */
  onBeginUpload?: () => void;

  /** 服务器检测到文件hash值已存在，秒传 触发该回调函数
   */
  onSecondTransmission?: () => void;

  /** 文件上传成功
   * @param file 文件对象
   * @param hash 该文件生成的hash值
   *  */
  onUploadSuccess?: (file: any, hash: string, isUseExistingFile: boolean) => void;

  /**所有文件上传成功 */
  onUploadFinished?: () => void;

  /** 上传文件的类型 */
  accept?: {
    extensions: string;
    mimeTypes: string;
  }
}

export function getHostUrl(): string {
  let host = window.location.hostname;
  if (host.substring(0, 4) != "http") {
    host = document.location.protocol + "//" + host;
  }
  return host;
}

let isReloadFile = false;

export function setReloadFile(isReload: boolean) {
  isReloadFile = isReload;
}
let uploader: any
export const getUploader = () => {
  return uploader
}
/** 创建文件上传器上传器
 * @parma config 注册上传器需要的配置
 *  */
export function createDwgFileUploader(config: UploaderRegisterConfig) {
  let {
    create,
    baseUrl = "",
    fileisExist,
    chunkisExist,
    chunked
  } = getUploadFileConfig() || {};

  if (baseUrl.substring(0, 16) == "http://localhost") {
    baseUrl = getHostUrl() + baseUrl.substring(16);
  }


  const {
    pick,
    serverURL,
    onError,
    onFileQueued,
    onCreateHashProgress,
    onProgress,
    onBeginUpload,
    onSecondTransmission,
    onUploadSuccess,
    onUploadFinished,
    accept: _accept
  } = config;

  let hash = "";
  WebUploader.Uploader.register(
    {
      "before-send": "beforeSend",
    },
    {
      beforeSend: (block: any) => {

        if (isReloadFile) {
          return true;
        }
        else {
          // 分片文件准备上传，判断一下服务是否已经有了，如果有了，就来再上传.
          const deferred = WebUploader.Deferred();
          $api
            .post(baseUrl + chunkisExist, {
              chunk: block.chunk,
              chunks: block.chunks,
              fileName: block.file.name,
              fileHash: hash,
              size: block.blob.size,
            })
            .then(
              (res: any) => {
                if (res.data.ret == "chunkAlreadyExist") {
                  // 分片存在
                  deferred.reject();
                } else {
                  // 分片不存在
                  deferred.resolve();
                }
              },
              () => {
                console.log("MxTip:post chunk is Exits error");
                onError && onError();
              }
            );
          return deferred.promise();

        }
      },
    }
  );
  let { swf, server = "", accept, dnd, ...createOptions } = create || {};

  let extensions = "dwg,DWG,dxf,DXF,mxweb";
  let mimeTypes = ".dwg,.DwG,.dxf,.DXF,.mxweb";
  if (getMxCADFileExtName() != "mxweb") {
    extensions = "dwg,DWG,dxf,DXF," + getMxCADFileExtName();
    mimeTypes = ".dwg,.DwG,.dxf,.DXF," + getMxCADFileExtName(true);
  }

  uploader = WebUploader.create({
    //是否允许重复的图片
    //duplicate: true,
    dnd: getRootContainer(),
    preserveHeaders: true, // 是否保留头部meta信息。
    withCredentials: true, //携带Cookie
    auto: false, // 选完文件后，是否自动上传
    swf, // swf文件路径
    server: serverURL || baseUrl + server, // 文件接收服务端  接收接口
    pick,
    resize: false, //上传前不压缩
    duplicate: true,
    //线程数
    threads: 3,
    chunked: chunked,
    //chunkSize:checkSize,//每个分片的大小，默认5M
    //单个文件大小限制
    //fileSingleSizeLimit: 2000,
    //上传文件数量限制
    fileNumLimit: 2,
    timeout: 2601000, //超时时间
    //文件类型
    accept: accept || _accept || {
      extensions: extensions,
      mimeTypes: mimeTypes,
    },
    ...createOptions
  });
  let isFileSelected = false;

  uploader.once('ready', function () {
    // 监听input 取消事件
    const pick = uploader.options.pick as HTMLDivElement;

    const input = pick.getElementsByTagName('input')[0] as HTMLInputElement;
    input.onclick = () => {
      window.addEventListener("focus", () => {
        // 如果文件选择框已关闭且未选择文件，则创建一个div，并设置div的样式，然后移除div 避免某些浏览器无法处理切换回页面焦点时动态css不生效
        console.log("文件选择框已关闭且未选择文件")
        if (!input.files?.length) {
          const div = document.createElement('div')
          div.style.width = '100%'
          div.style.top = '0'
          div.style.position = 'absolute'
          div.style.zIndex = '1050'
          div.style.height = '100%'
          document.body?.appendChild(div)
          requestAnimationFrame(() => {
            div.remove()
          })
        }
      }, {
        once: true
      });
    }
  })

  // 文件排队
  uploader.on("fileQueued", async (file: any) => {
    isFileSelected = true; // 重置状态
    if (onFileQueued && await onFileQueued(file)) {
      return
    }
    // 检查生成hash 上传文件
    uploader
      .md5File(file)
      .progress((percentage: any) => {
        onCreateHashProgress && onCreateHashProgress(percentage);
      })
      .then((fileHash: string) => {
        hash = fileHash;

        if (isReloadFile) {
          onBeginUpload && onBeginUpload();
          uploader.upload();
        }
        else {
          if (file.ext === "mxweb") {
            // mxweb,就直接打开，这里不需要上传转换。 onFileQueued调用打开.
            uploader.skipFile(file);
            uploader.reset();

          }
          else {
            // 判断文件在服务上是否已经存在，如果已经存在，就不上传了
            $api
              .post(baseUrl + fileisExist, {
                fileHash,
                filename: file.name,
              })
              .then(
                (res) => {
                  onBeginUpload && onBeginUpload();
                  if (res.data.ret == "fileAlreadyExist") {
                    onSecondTransmission && onSecondTransmission();
                    uploader.skipFile(file);
                    uploader.reset();
                    onUploadSuccess && onUploadSuccess(file, hash, true);
                  } else {
                    uploader.upload();
                  }
                },
                () => {
                  console.log("MxTip:post file is Exits error:1");
                  onError && onError();
                }
              );
          }
        }

      });
  });

  uploader.on("uploadBeforeSend", (block: any, data: any, headers: any) => {
    data.hash = hash;
  });

  // 文件上传过程中创建进度条实时显示。
  uploader.on("uploadProgress", (file: any, percentage: number) => {
    onProgress && onProgress(percentage * 100);
  });

  //上传成功
  uploader.on("uploadSuccess", (file: any, ret_uploader: any) => {
    $api.post(baseUrl + fileisExist, { fileHash: hash, filename: file.name }).then((res) => {
      if (res.data.ret == "fileAlreadyExist") {
        onUploadSuccess && onUploadSuccess(file, hash, false);
      } else {
        if (ret_uploader && ret_uploader.ret != "ok") {
          onError && onError(t("dwg文件转换mxweb出错,打开失败"));
        }
        else {
          onError && onError(t("dwg格式不对转换mxweb出错,打开文件失败"));
        }
        console.log("MxTip:uploader file error");
        console.log(ret_uploader);
        console.log(res);
      }
    },
      () => {
        console.log("MxTip:post file is Exits error:2");
        onError && onError();
      }
    );
  });

  // 所有文件上传成功
  uploader.on("uploadFinished", function (file: any) {
    onUploadFinished && onUploadFinished();
    //清空队列
    uploader.reset();
  });

  uploader.on("uploadError", (file: any, reason: any) => {
    console.log("MxTip:uploadError error:1");
    console.group(reason);
    onError && onError();
  });

  uploader.on("error", (type: any) => {
    uploader.reset();
    console.log("MxTip:uploadError error:2");
    console.log("err", type);
    onError && onError();
  });
  return uploader;
}
